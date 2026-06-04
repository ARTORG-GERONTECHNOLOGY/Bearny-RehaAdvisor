/**
 * ICF Monitor — patient-facing questionnaire  (/icf/:patientId?)
 *
 * Routes
 * ------
 * /icf/:patientId?   Optional URL segment; /eva2 redirects here for backwards compatibility.
 *
 * State machine (rendered screens in order)
 * -----------------------------------------
 * 1. Patient-ID input   — when no patientId in URL param or localStorage.
 *                         Validates "P\d+-\d+T\d+" format, persists to localStorage.
 * 2. Mic permission     — requests getUserMedia; shows "Übungslauf starten" button.
 * 3. Practice mode      — one warm-up question (not uploaded to backend).
 * 4. Survey questions   — 29 ICF domain questions with vertical slider + optional audio cue.
 *                         Each answer POSTs to /api/healthslider/submit-item/ including
 *                         participantId, sessionId, questionIndex, answerValue, and the
 *                         recorded audio Blob (webm or m4a depending on browser).
 * 5. Summary / end      — shown after the last question; localStorage is cleared immediately
 *                         before the end screen renders (no "Beenden" button).
 *
 * Persistence (localStorage)
 * --------------------------
 * patient_id        — survives page reloads; cleared when the last answer is submitted.
 * survey_index      — allows resuming mid-survey after accidental reload.
 * survey_sessionId  — groups all answers for a single sitting.
 *
 * Upload failure handling
 * -----------------------
 * If /api/healthslider/submit-item/ fails, a modal lets the patient download the
 * audio blob + JSON metadata locally, so no data is lost.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';

import { PlayFill, BellFill, BellSlashFill, InfoLg } from 'react-bootstrap-icons';
import EndScreen from '@/components/icf/EndScreen';
import InfoScreen from '@/components/icf/InfoScreen';
import PatientIdScreen from '@/components/icf/PatientIdScreen';
import StartScreen from '@/components/icf/StartScreen';
import '@/assets/styles/icf.css';

/** ====== DATA ====== */
const PRACTICE_QUESTION = 'Übungslauf Beispiel (Wird nicht gespeichert)';
const REAL_QUESTIONS = [
  'Gesundheit, Befinden und Wohlbefinden allgemein',
  'Essen und Trinken',
  'Sich selber und den Körper pflegen, sich waschen und kleiden',
  'Die Toilette benutzen, das Blasenmanagement und die Urinausscheidung',
  'Die Verdauung und das Management des Stuhlgangs',
  'Muskelfunktion und Muskelkraft',
  'Beweglichkeit, Gelenke und Knochen',
  'Liegen, sitzen, aufstehen, gehen, die Position wechseln und sich fortbewegen',
  'Fortbewegungs- und Verkehrsmittel benützen',
  'Herzfunktion, Atmung, Leistungsfähigkeit und Belastbarkeit',
  'Mit anderen kommunizieren, sich ausdrücken und verstehen können',
  'Pflege von sozialen Kontakten und Umgang mit anderen, Familie und Freunde',
  'Sexualleben und sexuelle Funktionen',
  'Schlaf',
  'Probleme lösen und Wissen anwenden',
  'Gedächtnis',
  'Denken',
  'Umgang mit Emotionen und Gefühlen',
  'Psychische Energie und Antrieb',
  'Schmerzen',
  'Ausführen von Aufgaben in Haushalt und Beruf, Freizeit und Erholung',
  'Unterstützung durch private und professionelle Personen',
  'Anderen helfen',
  'Verwendung von Produkten und Substanzen für die Gesundheit und individuellen Bedarf',
  'Verwendung von Technologien, digitalen Produkten und Hilfsmittel',
  'Versorgung durch das Gesundheitswesen und Verhalten von professionellen Personen und Fachkräften',
  'Zugang zu privaten oder öffentlichen Gebäuden',
  'Einflüsse von Umwelt und Klima auf körperliche und psychische Gesundheit',
  'Auf Gesundheit achten',
];

const VERSION = 'Version 2.2 (ICF Monitor - Full Sync), 2026';

const AUDIO_BASE = '/icf-audio/items';
const AUDIO_EXTS = ['wav', 'm4a', 'mp3'] as const;
const pad2 = (n: number) => String(n).padStart(2, '0');
const getItemAudioStem = (isPractice: boolean, idx: number) => {
  if (isPractice) return 'ubung';
  return `q${pad2(idx + 1)}`;
};

const getItemAudioSrcCandidates = (isPractice: boolean, idx: number) => {
  const stem = getItemAudioStem(isPractice, idx);
  const out: string[] = [];
  for (const ext of AUDIO_EXTS) {
    const file = `${stem}.${ext}`;
    out.push(`${AUDIO_BASE}/${file}`);
    out.push(new URL(`icf-audio/items/${file}`, document.baseURI).toString());
    out.push(new URL(`../icf-audio/items/${file}`, window.location.href).toString());
  }
  return Array.from(new Set(out));
};

/** ===== Helpers ===== */
const safeFilePart = (s: string) =>
  (s || '')
    .replace(/[^\w-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60);

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
};

const downloadText = (text: string, filename: string) => {
  downloadBlob(new Blob([text], { type: 'application/json' }), filename);
};

const extFromMime = (mime: string) => {
  const m = (mime || '').toLowerCase();
  if (m.includes('audio/mp4')) return 'm4a';
  if (m.includes('webm')) return 'webm';
  // no ogg by request
  return 'webm';
};

const pickRecorderMime = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  // Keep only webm/mp4 (no ogg)
  const candidates = [
    'audio/mp4', // Safari/iOS (AAC)
    'audio/webm;codecs=opus', // Chrome/Firefox (Opus)
    'audio/webm',
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* empty */
    }
  }
  // isTypeSupported is unreliable on some iOS versions — fall back to audio/mp4
  // (Safari's native format) and let the browser reject it if truly unsupported
  return 'audio/mp4';
};

export default function HealthSlider() {
  const { patientId: urlPatientId } = useParams<{ patientId?: string }>();

  // --- questionnaire states ---
  const [sliderPosition, setSliderPosition] = useState(50);
  const [sliderMoved, setSliderMoved] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(() => {
    const saved = localStorage.getItem('survey_index');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [isPracticeMode, setIsPracticeMode] = useState(
    () => localStorage.getItem('survey_index') === null
  );
  const [testMode, setTestMode] = useState(
    () =>
      localStorage.getItem('survey_index') === null &&
      localStorage.getItem('survey_sessionId') === null
  );
  const [showSummary, setShowSummary] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [patientId, setPatientId] = useState(() => {
    if (urlPatientId) return urlPatientId;
    return localStorage.getItem('patient_id') || '';
  });
  const [patientIdInput, setPatientIdInput] = useState('');
  const [patientIdError, setPatientIdError] = useState('');

  // --- UI cues ---
  const [isLocked, setIsLocked] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [showSliderAlert, setShowSliderAlert] = useState(false);
  const [dingActive, setDingActive] = useState(true);

  // --- recording ---
  const [saving, setSaving] = useState(false);
  const [micError, setMicError] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const micDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('');

  // recording status + mid-survey error feedback
  const [isRecording, setIsRecording] = useState(false);
  const [recorderWarning, setRecorderWarning] = useState('');
  // stable ref so onerror handler always sees current state without restarting the recorder
  const handleRecorderErrorRef = useRef<(e: Event) => void>(() => {});

  const sessionIdRef = useRef<string>(localStorage.getItem('survey_sessionId') || '');

  // slider DOM
  const spectrumRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);

  // persistent AudioContext for headphone routing (ding + playback share one session)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  // upload-failure prompt
  const [uploadFail, setUploadFail] = useState<{
    open: boolean;
    message: string;
    audio: Blob | null;
    meta: any;
  }>({ open: false, message: '', audio: null, meta: null });

  // keep last blob so upload-fail prompt can download it
  const lastAudioRef = useRef<Blob | null>(null);

  // pre-recorded audio
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobPlaybackUrlRef = useRef<string | null>(null);
  const successfulSrcRef = useRef<Record<string, string>>({});
  const [audioError, setAudioError] = useState<string>('');

  // ✅ responsive breakpoints
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 520 : false
  );
  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth <= 520);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const total = REAL_QUESTIONS.length;

  /** --- wire <audio> into the shared AudioContext with 2× gain boost + headphone routing --- */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || audioNodeRef.current) return;
    try {
      const ctx = getAudioCtx();
      audioNodeRef.current = ctx.createMediaElementSource(audio);
      audioGainRef.current = ctx.createGain();
      audioGainRef.current.gain.value = 5.0;
      audioNodeRef.current.connect(audioGainRef.current);
      audioGainRef.current.connect(ctx.destination);
    } catch {
      /* empty */
    }
  }, [getAudioCtx]);

  /** --- ding --- */
  const playDing = useCallback(
    (freq = 550) => {
      if (!dingActive) return;
      try {
        const ctx = getAudioCtx();
        ctx.resume().catch(() => {});
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } catch {
        /* empty */
      }
    },
    [dingActive, getAudioCtx]
  );

  /** --- play pre-recorded item audio (manual) --- */
  const playItemAudio = useCallback(async () => {
    setAudioError('');
    const el = audioRef.current;
    if (!el) return;

    // Resume shared AudioContext so audio routes to current output (incl. headphones)
    try {
      await getAudioCtx().resume();
    } catch {
      /* empty */
    }

    const itemKey = getItemAudioStem(isPracticeMode, questionIndex);
    const allCandidates = getItemAudioSrcCandidates(isPracticeMode, questionIndex);
    const cached = successfulSrcRef.current[itemKey];
    const candidates = cached
      ? [cached, ...allCandidates.filter((src) => src !== cached)]
      : allCandidates;

    for (const src of candidates) {
      try {
        el.pause();
        el.currentTime = 0;
      } catch {
        /* empty */
      }

      if (el.src !== src) {
        el.src = src;
        el.load();
      }

      try {
        await el.play();
        successfulSrcRef.current[itemKey] = src;
        return;
      } catch {
        /* empty */
      }
    }

    // Some deployments route static files through non-standard base paths or MIME headers.
    // Fetching the file and playing a blob URL is a robust fallback across browsers.
    for (const src of candidates) {
      try {
        const res = await fetch(src, { cache: 'no-store' });
        if (!res.ok) continue;

        const blob = await res.blob();
        if (!blob || blob.size <= 0) continue;

        const contentType = (blob.type || res.headers.get('content-type') || '').toLowerCase();
        if (contentType && !contentType.startsWith('audio/')) continue;

        if (blobPlaybackUrlRef.current) URL.revokeObjectURL(blobPlaybackUrlRef.current);
        const blobUrl = URL.createObjectURL(blob);
        blobPlaybackUrlRef.current = blobUrl;

        try {
          el.pause();
          el.currentTime = 0;
        } catch {
          /* empty */
        }

        el.src = blobUrl;
        el.load();
        await el.play();
        successfulSrcRef.current[itemKey] = src;
        return;
      } catch {
        /* empty */
      }
    }

    setAudioError(
      'Audio kann nicht abgespielt werden (Datei fehlt oder Gerät blockiert Wiedergabe).'
    );
  }, [isPracticeMode, questionIndex, getAudioCtx]);

  useEffect(() => {
    return () => {
      if (blobPlaybackUrlRef.current) URL.revokeObjectURL(blobPlaybackUrlRef.current);
      blobPlaybackUrlRef.current = null;
    };
  }, []);

  /** --- preload current + next audio for snappy playback --- */
  useEffect(() => {
    try {
      const currentKey = getItemAudioStem(isPracticeMode, questionIndex);
      const currentCandidates = getItemAudioSrcCandidates(isPracticeMode, questionIndex);
      const src = successfulSrcRef.current[currentKey] || currentCandidates[0];
      const nextIdx = Math.min(questionIndex + 1, REAL_QUESTIONS.length - 1);
      const nextKey = getItemAudioStem(false, isPracticeMode ? 0 : nextIdx);
      const nextCandidates = isPracticeMode
        ? getItemAudioSrcCandidates(false, 0)
        : getItemAudioSrcCandidates(false, nextIdx);
      const nextSrc = successfulSrcRef.current[nextKey] || nextCandidates[0];
      const a1 = new Audio(src);
      a1.preload = 'auto';
      const a2 = new Audio(nextSrc);
      a2.preload = 'auto';
    } catch {
      /* empty */
    }
  }, [isPracticeMode, questionIndex]);

  useEffect(() => {
    if (urlPatientId) {
      setPatientId(urlPatientId);
      localStorage.setItem('patient_id', urlPatientId);
      setPatientIdError('');
    }
  }, [urlPatientId]);

  const submitPatientId = () => {
    const v = patientIdInput.trim();
    if (!/^P\d+-\d+T\d+$/.test(v)) {
      setPatientIdError('ID muss dem Format Pxxx-xxxTx entsprechen (z.B. P001-001T1).');
      return;
    }
    localStorage.setItem('patient_id', v);
    setPatientId(v);
  };

  /** --- persistence --- */
  useEffect(() => {
    if (!isPracticeMode) {
      localStorage.setItem('survey_index', questionIndex.toString());
      if (sessionIdRef.current) localStorage.setItem('survey_sessionId', sessionIdRef.current);
    }
  }, [questionIndex, isPracticeMode]);

  /** --- keep a stable ref to playDing so bell toggle doesn't restart the lock timer --- */
  const playDingRef = useRef(playDing);
  useEffect(() => {
    playDingRef.current = playDing;
  }, [playDing]);

  /** --- cue on new question (no auto speech) --- */
  useEffect(() => {
    if (testMode || showSummary) return;

    setShowFlash(true);
    setIsLocked(true);
    playDingRef.current(550);
    if (navigator.vibrate) navigator.vibrate(20);

    const flashTimer = setTimeout(() => setShowFlash(false), 250);
    const lockTimer = setTimeout(() => setIsLocked(false), 3000);
    return () => {
      clearTimeout(flashTimer);
      clearTimeout(lockTimer);
    };
  }, [questionIndex, testMode, showSummary]); // ← playDing intentionally omitted via ref

  /** --- recording helpers (PER ITEM, self-contained blobs) --- */
  const startItemRecorder = useCallback(() => {
    // Prefer the WebAudio-routed stream so mic and playback share one OS audio session,
    // preventing Android from pausing the recorder when item audio plays through the speaker.
    const stream = micDestRef.current?.stream ?? streamRef.current;
    if (!stream) throw new Error('No mic stream');

    const mimeType = pickRecorderMime();
    let rec: MediaRecorder;
    try {
      rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      // Fallback: let the browser choose the format (handles iOS edge cases)
      rec = new MediaRecorder(stream);
    }

    mimeRef.current = rec.mimeType || mimeType || '';
    chunksRef.current = [];

    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    rec.onerror = (e) => handleRecorderErrorRef.current(e);

    recorderRef.current = rec;
    // 250ms timeslice ensures chunks arrive periodically; fixes iOS/Safari where
    // ondataavailable can fire after onstop when no timeslice is used.
    rec.start(250);
    setIsRecording(true);
  }, []);

  /** --- keep handleRecorderErrorRef current so onerror always sees fresh state --- */
  useEffect(() => {
    handleRecorderErrorRef.current = (e: Event) => {
      const errMsg = (e as any)?.error?.message || 'Unbekannter Aufnahme-Fehler';
      const partialBlob =
        chunksRef.current.length > 0
          ? new Blob(chunksRef.current, { type: mimeRef.current || 'audio/webm' })
          : null;
      const meta = {
        participantId: patientId,
        sessionId: sessionIdRef.current,
        questionIndex,
        questionText: isPracticeMode ? PRACTICE_QUESTION : REAL_QUESTIONS[questionIndex],
        answerValue: null,
        answeredAt: new Date().toISOString(),
        error: `MediaRecorder-Fehler: ${errMsg}`,
      };
      setIsRecording(false);
      recorderRef.current = null;
      setUploadFail({
        open: true,
        message: `Aufnahme unterbrochen (${errMsg}).\n\nSie können die bisherige Teilaufnahme herunterladen.\nDie Befragung kann ohne Aufnahme fortgesetzt werden.`,
        audio: partialBlob,
        meta,
      });
      try {
        startItemRecorder();
      } catch {
        /* empty */
      }
    };
  }, [patientId, questionIndex, isPracticeMode, startItemRecorder]);

  /** --- resume AudioContext + recorder after tab comes back to foreground (iOS) --- */
  useEffect(() => {
    const onVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        await audioCtxRef.current?.resume();
      } catch {
        /* empty */
      }
      const rec = recorderRef.current;
      if (
        (!rec || rec.state === 'inactive') &&
        !saving &&
        !showSummary &&
        !isPracticeMode &&
        !testMode
      ) {
        setRecorderWarning('Aufnahme nach Hintergrund-Modus neu gestartet.');
        try {
          startItemRecorder();
        } catch {
          /* empty */
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [saving, showSummary, isPracticeMode, testMode, startItemRecorder]);

  const stopItemRecorder = useCallback(async (): Promise<Blob | null> => {
    const rec = recorderRef.current;
    if (!rec) return null;

    const blobType = mimeRef.current || rec.mimeType || 'audio/webm';

    const blob: Blob | null = await new Promise((resolve) => {
      try {
        rec.onstop = () => {
          // Give a brief tick for any final ondataavailable to fire (iOS Safari quirk)
          setTimeout(() => {
            const chunks = chunksRef.current;
            if (!chunks.length) return resolve(null);
            resolve(new Blob(chunks, { type: blobType }));
          }, 50);
        };
        rec.stop();
      } catch {
        resolve(null);
      }
    });

    recorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
    return blob;
  }, []);

  const stopAll = () => {
    try {
      recorderRef.current?.stop();
    } catch {
      /* empty */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    micDestRef.current?.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    micDestRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
  };

  /** --- backend upload --- */
  const uploadItem = async (payload: {
    questionIndex: number;
    questionText: string;
    answerValue: number;
    audio: Blob | null;
  }) => {
    const fd = new FormData();
    fd.append('participantId', patientId);
    fd.append('sessionId', sessionIdRef.current);
    fd.append('questionIndex', String(payload.questionIndex));
    fd.append('questionText', payload.questionText);
    fd.append('answerValue', String(payload.answerValue));
    fd.append('answeredAt', new Date().toISOString());

    if (payload.audio) {
      const mime = payload.audio.type || mimeRef.current || '';
      const ext = extFromMime(mime);
      fd.append('audioMime', mime);
      fd.append(
        'audio',
        new File([payload.audio], `rec_q${payload.questionIndex + 1}.${ext}`, {
          type: mime || payload.audio.type,
        })
      );
    }

    const res = await fetch('/api/healthslider/submit-item/', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  };

  const createSecureSessionSuffix = () => {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  };

  const ensureSessionId = () => {
    if (!sessionIdRef.current)
      sessionIdRef.current = `${Date.now()}_${createSecureSessionSuffix()}`;
  };

  const startMic = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMicError('Dieser Browser unterstützt Mikrofon-Aufnahmen nicht.');
        return;
      }
      if (typeof MediaRecorder === 'undefined') {
        setMicError(
          'Audioaufnahmen werden von diesem Browser nicht unterstützt (MediaRecorder fehlt). Bitte Safari 14.3+ oder Chrome verwenden.'
        );
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Route mic through the shared AudioContext so the OS sees one unified audio
      // session. Without this, Android can pause/stop the MediaRecorder the moment
      // the item audio starts playing through the speaker.
      try {
        const ctx = getAudioCtx();
        await ctx.resume();
        const micSource = ctx.createMediaStreamSource(stream);
        const micDest = ctx.createMediaStreamDestination();
        micSource.connect(micDest);
        micDestRef.current = micDest;
      } catch {
        // If WebAudio routing fails, fall back to recording the raw stream.
        micDestRef.current = null;
      }

      ensureSessionId();
      // Persist sessionId immediately so a refresh during practice mode also
      // skips the welcome screen (testMode initialises to false when either
      // survey_index or survey_sessionId is present in localStorage).
      if (sessionIdRef.current) localStorage.setItem('survey_sessionId', sessionIdRef.current);
      startItemRecorder();

      setTestMode(false);
      setMicError('');
    } catch (e: any) {
      console.error('[HealthSlider] getUserMedia error', e);

      const name = e?.name || 'UnknownError';
      const msg = e?.message || '';

      // Helpful mapping
      let nice = `Mikrofon-Fehler: ${name}`;
      if (name === 'NotAllowedError') nice = 'Mikrofon blockiert (Browser- oder OS-Permission).';
      if (name === 'NotFoundError') nice = 'Kein Mikrofon gefunden (Gerät/Headset prüfen).';
      if (name === 'NotReadableError')
        nice = 'Mikrofon belegt (z.B. Zoom/Teams) oder Start fehlgeschlagen.';

      setMicError(`${nice}${msg ? ` (${msg})` : ''}`);
    }
  };

  const advanceToNextQuestion = () => {
    if (questionIndex < total - 1) {
      setQuestionIndex((i) => i + 1);
      setSliderPosition(50);
      setSliderMoved(false);
    } else {
      localStorage.removeItem('survey_index');
      localStorage.removeItem('survey_sessionId');
      localStorage.removeItem('patient_id');
      setShowSummary(true);
      stopAll();
    }
  };

  const executeNextSafe = async (val: number | 'NA') => {
    setShowSliderAlert(false);
    setSaving(true);

    try {
      ensureSessionId();

      const audioBlob = await stopItemRecorder();
      lastAudioRef.current = audioBlob;

      if (isPracticeMode) {
        setIsPracticeMode(false);
        setQuestionIndex(0);
        setSliderPosition(50);
        setSliderMoved(false);

        startItemRecorder();
        return;
      }

      const answerValue = val === 'NA' ? -1 : val;

      await uploadItem({
        questionIndex,
        questionText: REAL_QUESTIONS[questionIndex],
        answerValue,
        audio: audioBlob,
      });

      const isLast = questionIndex >= total - 1;
      if (!isLast) {
        advanceToNextQuestion();
        setTimeout(() => {
          try {
            startItemRecorder();
          } catch (e: any) {
            setRecorderWarning(
              `Mikrofon nicht mehr verfügbar (${e?.message || e}). Antworten können weiterhin ohne Aufnahme abgegeben werden.`
            );
          }
        }, 0);
      } else {
        localStorage.removeItem('survey_index');
        localStorage.removeItem('survey_sessionId');
        localStorage.removeItem('patient_id');
        setShowSummary(true);
        stopAll();
      }
    } catch (e: any) {
      const meta = {
        participantId: patientId,
        sessionId: sessionIdRef.current,
        questionIndex,
        questionText: isPracticeMode ? PRACTICE_QUESTION : REAL_QUESTIONS[questionIndex],
        answerValue: val === 'NA' ? -1 : val,
        answeredAt: new Date().toISOString(),
        error: String(e?.message || e),
      };

      setUploadFail({
        open: true,
        message: `Fehler beim Hochladen.\n\nSie können die Aufnahme lokal herunterladen und später weitergeben.\n\n${meta.error}`,
        audio: lastAudioRef.current,
        meta,
      });

      try {
        startItemRecorder();
      } catch (e: any) {
        setRecorderWarning(
          `Mikrofon nicht mehr verfügbar (${e?.message || e}). Antworten können weiterhin ohne Aufnahme abgegeben werden.`
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async (val: number | 'NA') => {
    if (val !== 'NA' && !sliderMoved && sliderPosition === 50) {
      setShowSliderAlert(true);
      return;
    }
    await executeNextSafe(val);
  };

  /** ===== Touch + pointer drag fix ===== */
  const handleSliderMove = useCallback((clientY: number) => {
    const el = spectrumRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let y = clientY - rect.top;
    y = Math.max(0, Math.min(rect.height, y));
    const pct = Math.round(100 - (y / rect.height) * 100);
    const clamped = Math.min(100, Math.max(0, pct));
    setSliderPosition(clamped);
    setSliderMoved(true);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (saving) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    isDraggingRef.current = true;
    handleSliderMove(e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    handleSliderMove(e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* empty */
    }
  };

  useEffect(() => {
    const el = spectrumRef.current;
    if (!el) return;

    const onTouchStart = (ev: TouchEvent) => {
      if (saving) return;
      ev.preventDefault();
      isDraggingRef.current = true;
      const t = ev.touches[0];
      if (t) handleSliderMove(t.clientY);
    };

    const onTouchMove = (ev: TouchEvent) => {
      if (!isDraggingRef.current) return;
      ev.preventDefault();
      const t = ev.touches[0];
      if (t) handleSliderMove(t.clientY);
    };

    const onTouchEnd = () => {
      isDraggingRef.current = false;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart as any);
      el.removeEventListener('touchmove', onTouchMove as any);
      el.removeEventListener('touchend', onTouchEnd as any);
      el.removeEventListener('touchcancel', onTouchEnd as any);
    };
  }, [handleSliderMove, saving]);

  if (!patientId) {
    return (
      <PatientIdScreen
        value={patientIdInput}
        error={patientIdError}
        onChange={(v) => {
          setPatientIdInput(v);
          setPatientIdError('');
        }}
        onSubmit={submitPatientId}
      />
    );
  }

  if (testMode) {
    return <StartScreen micError={micError} onStart={startMic} />;
  }

  return (
    <main
      className="icf-page"
      style={{ backgroundColor: showFlash ? '#858585' : '#EFECE7', transition: 'background 0.2s' }}
    >
      <audio
        ref={audioRef}
        preload="auto"
        onError={() => setAudioError('Audio-Datei nicht gefunden oder nicht unterstützt.')}
        style={{ display: 'none' }}
      />

      <div className="relative max-w-5xl w-full mt-6 mb-10">
        <div className="flex gap-3 md:gap-6 pr-20 lg:pr-60">
          {!isPracticeMode && (
            <div className="flex-shrink-0">
              <div className="font-bold text-4xl md:text-5xl !leading-none">
                {questionIndex + 1}
              </div>
              <div className="flex gap-1">
                <div className="font-bold text-xl md:text-2xl text-[#727272] !leading-none whitespace-nowrap">
                  / {total}
                </div>
                {isRecording && (
                  <div
                    aria-label="Aufnahme läuft"
                    title="Aufnahme läuft"
                    className="icf-rec-dot animate-pulse"
                  />
                )}
              </div>
            </div>
          )}

          <div className="min-w-0">
            {isPracticeMode && <div className="icf-practice-banner">ÜBUNGSMODUS</div>}
            <h1 className="font-bold text-xl md:text-2xl break-words !leading-none">
              {isPracticeMode ? PRACTICE_QUESTION : REAL_QUESTIONS[questionIndex]}
            </h1>
          </div>
        </div>

        <div className="absolute top-0 right-0 flex flex-col lg:flex-row gap-2">
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            className="icf-action-btn icf-action-btn--info"
            aria-label="Information"
            title="Information"
          >
            <InfoLg size={isMobile ? 30 : 36} />
          </button>

          <button
            type="button"
            onClick={() => setDingActive((v) => !v)}
            className="icf-action-btn"
            style={{
              background: dingActive ? '#d7c6a7' : '#fff',
              color: dingActive ? '#fff' : '#000',
            }}
            aria-label={dingActive ? 'Ton an' : 'Ton aus'}
            title={dingActive ? 'Ton an' : 'Ton aus'}
          >
            {dingActive ? (
              <BellFill size={isMobile ? 30 : 36} />
            ) : (
              <BellSlashFill size={isMobile ? 30 : 36} />
            )}
          </button>

          <button
            type="button"
            onClick={playItemAudio}
            className="icf-action-btn icf-action-btn--play"
            aria-label="Frage abspielen"
            title="Frage abspielen"
          >
            <PlayFill size={isMobile ? 30 : 36} />
          </button>
        </div>
      </div>

      {!showSummary && (
        <>
          <div className="flex flex-col gap-2 text-center mb-8 items-center">
            <div className="font-bold text-xl md:text-2xl text-[#58D8B0]">sehr gut</div>

            <div className="icf-slider-wrap">
              <div
                ref={spectrumRef}
                role="group"
                aria-label="Schieberegler vertikal"
                className="icf-track-box"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onClick={(e) => {
                  if (!saving) handleSliderMove(e.clientY);
                }}
              >
                <div className="icf-gradient-bar" />
                <div className="icf-cap icf-cap--top" />
                <div className="icf-cap icf-cap--bottom" />
                <div
                  role="slider"
                  aria-valuenow={sliderPosition}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="icf-knob"
                  style={{ bottom: `${sliderPosition}%` }}
                />
              </div>
            </div>

            <div className="font-bold text-xl md:text-2xl text-[#C1839D]">sehr schlecht</div>
          </div>

          {audioError && <div className="icf-audio-error">{audioError}</div>}

          {showSliderAlert && (
            <div className="icf-modal-overlay">
              <div className="icf-modal">
                <p className="text-lg mb-5">
                  Möchten Sie den Schieber in der Mitte belassen oder eine andere Position wählen?
                </p>
                <button
                  type="button"
                  className="icf-btn icf-btn--primary mb-2.5"
                  onClick={() => executeNextSafe(sliderPosition)}
                >
                  Belassen und weiter
                </button>
                <button
                  type="button"
                  className="icf-btn icf-btn--neutral"
                  onClick={() => setShowSliderAlert(false)}
                >
                  Schieber anpassen
                </button>
              </div>
            </div>
          )}

          {uploadFail.open && (
            <div className="icf-modal-overlay">
              <div className="icf-modal">
                <h3 className="mt-0">Upload fehlgeschlagen</h3>
                <p className="whitespace-pre-wrap mb-4">{uploadFail.message}</p>

                <div className="icf-modal-actions">
                  <button
                    type="button"
                    className="icf-btn icf-btn--neutral min-w-[180px]"
                    onClick={() =>
                      setUploadFail({ open: false, message: '', audio: null, meta: null })
                    }
                  >
                    Schließen
                  </button>

                  <button
                    type="button"
                    className="icf-btn icf-btn--primary min-w-[220px]"
                    onClick={() => {
                      const meta = uploadFail.meta;
                      const ts = new Date().toISOString().replace(/[:.]/g, '-');
                      const base = `${safeFilePart(meta.participantId)}_${safeFilePart(meta.sessionId)}_q${String(meta.questionIndex + 1).padStart(2, '0')}_${ts}`;
                      downloadText(JSON.stringify(meta, null, 2), `${base}.json`);

                      const audio = uploadFail.audio;
                      if (audio) {
                        const mime = audio.type || mimeRef.current || 'audio/webm';
                        const ext = extFromMime(mime);
                        downloadBlob(audio, `${base}.${ext}`);
                      } else {
                        alert('Keine Audio-Daten verfügbar.');
                      }
                    }}
                  >
                    Audio + Info herunterladen
                  </button>
                </div>
              </div>
            </div>
          )}

          {recorderWarning && (
            <div role="alert" className="icf-recorder-warning">
              <span>{recorderWarning}</span>
              <button
                type="button"
                onClick={() => setRecorderWarning('')}
                className="icf-dismiss-btn"
                aria-label="Meldung schließen"
              >
                ×
              </button>
            </div>
          )}

          <div
            className={`${isPracticeMode ? 'icf-buttons-row--centered' : 'icf-buttons-row'} max-w-5xl`}
          >
            {isPracticeMode ? (
              <button
                type="button"
                className="icf-btn icf-btn--primary max-w-xs"
                onClick={() => executeNextSafe(50)}
              >
                Start
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="icf-btn icf-btn--neutral ml-auto max-w-xs"
                  style={{ opacity: isLocked ? 0.5 : 1 }}
                  disabled={saving || isLocked}
                  onClick={() => handleNext('NA')}
                >
                  Kann ich nicht beantworten
                </button>
                <button
                  type="button"
                  className="icf-btn icf-btn--primary max-w-xs"
                  style={{ opacity: isLocked ? 0.5 : 1 }}
                  disabled={saving || isLocked}
                  onClick={() => handleNext(sliderPosition)}
                >
                  Weiter
                </button>
              </>
            )}
          </div>
        </>
      )}

      {showSummary && (
        <EndScreen />
      )}

      {showInfo && <InfoScreen isRecording={isRecording} onClose={() => setShowInfo(false)} />}

      <footer className="icf-survey-footer">
        <div className="icf-footer-text">{patientId ? `ID: ${patientId}` : 'No ID'}</div>
        <div className="icf-footer-text">{VERSION}</div>
      </footer>
    </main>
  );
}
