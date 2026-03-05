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
 *                         Validates "P\d+" format, persists to localStorage.
 * 2. Mic permission     — requests getUserMedia; shows "Übungslauf starten" button.
 * 3. Practice mode      — one warm-up question (not uploaded to backend).
 * 4. Survey questions   — 29 ICF domain questions with vertical slider + optional audio cue.
 *                         Each answer POSTs to /api/healthslider/submit-item/ including
 *                         participantId, sessionId, questionIndex, answerValue, and the
 *                         recorded audio Blob (webm or m4a depending on browser).
 * 5. Summary / end      — shown after the last question; "Beenden" clears localStorage.
 *
 * Persistence (localStorage)
 * --------------------------
 * patient_id        — survives page reloads; cleared by "ID zurücksetzen" footer button.
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
import { PlayFill, BellFill, BellSlashFill } from 'react-bootstrap-icons';

/** ====== DATA ====== */
const PRACTICE_QUESTION = 'Übungslauf Beispiel (Wird nicht gespeichert)';
const REAL_QUESTIONS = [
  'Allgemeine Gesundheit und wie geht es Ihnen heute und in den letzten Tagen und warum?',
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

const AUDIO_BASE = '/audio/items';
const pad2 = (n: number) => String(n).padStart(2, '0');
const getItemAudioSrc = (isPractice: boolean, idx: number) => {
  if (isPractice) return `${AUDIO_BASE}/ubung.m4a`;
  return `${AUDIO_BASE}/q${pad2(idx + 1)}.m4a`;
};

/** ===== Helpers ===== */
const safeFilePart = (s: string) =>
  (s || '')
    .replace(/[^\w\-]+/g, '_')
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
  // Keep only webm/mp4 (no ogg)
  const candidates = [
    'audio/mp4', // Safari/iOS (AAC)
    'audio/webm;codecs=opus', // Chrome/Firefox (Opus)
    'audio/webm',
  ];
  for (const t of candidates) {
    if ((window as any).MediaRecorder?.isTypeSupported?.(t)) return t;
  }
  return '';
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
  const [testMode, setTestMode] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('');

  const sessionIdRef = useRef<string>(localStorage.getItem('survey_sessionId') || '');

  // slider DOM
  const spectrumRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);

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
  const [audioError, setAudioError] = useState<string>('');

  // ✅ responsive breakpoint
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 520 : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 520);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const total = REAL_QUESTIONS.length;
  const progressPercent = isPracticeMode ? 0 : ((questionIndex + 1) / total) * 100;
  const progressText = isPracticeMode ? '' : `Frage ${questionIndex + 1} von ${total}`;

  /** --- ding --- */
  const playDing = useCallback(
    (freq = 550) => {
      if (!dingActive) return;
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      } catch {}
    },
    [dingActive]
  );

  /** --- play pre-recorded item audio (manual) --- */
  const playItemAudio = useCallback(async () => {
    setAudioError('');
    const el = audioRef.current;
    if (!el) return;

    const src = getItemAudioSrc(isPracticeMode, questionIndex);
    try {
      el.pause();
      el.currentTime = 0;
    } catch {}

    const absolute = `${window.location.origin}${src}`;
    if (el.src !== absolute) el.src = src;

    try {
      await el.play();
    } catch {
      setAudioError(
        'Audio kann nicht abgespielt werden (Datei fehlt oder Gerät blockiert Wiedergabe).'
      );
    }
  }, [isPracticeMode, questionIndex]);

  /** --- preload current + next audio for snappy playback --- */
  useEffect(() => {
    try {
      const src = getItemAudioSrc(isPracticeMode, questionIndex);
      const nextIdx = Math.min(questionIndex + 1, REAL_QUESTIONS.length - 1);
      const nextSrc = isPracticeMode ? getItemAudioSrc(false, 0) : getItemAudioSrc(false, nextIdx);
      const a1 = new Audio(src);
      a1.preload = 'auto';
      const a2 = new Audio(nextSrc);
      a2.preload = 'auto';
    } catch {}
  }, [isPracticeMode, questionIndex]);

  /** --- sync URL-provided patient ID to localStorage --- */
  useEffect(() => {
    if (urlPatientId) localStorage.setItem('patient_id', urlPatientId);
  }, [urlPatientId]);

  const submitPatientId = () => {
    const v = patientIdInput.trim();
    if (!/^P\d+$/.test(v)) {
      setPatientIdError('ID muss mit P beginnen, gefolgt von Ziffern (z.B. P01).');
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

  /** --- cue on new question (no auto speech) --- */
  useEffect(() => {
    if (testMode || showSummary) return;

    setShowFlash(true);
    setIsLocked(true);
    playDing(550);
    if (navigator.vibrate) navigator.vibrate(20);

    const flashTimer = setTimeout(() => setShowFlash(false), 250);
    const lockTimer = setTimeout(() => setIsLocked(false), 1200);
    return () => {
      clearTimeout(flashTimer);
      clearTimeout(lockTimer);
    };
  }, [questionIndex, testMode, showSummary, playDing]);

  /** --- recording helpers (PER ITEM, self-contained blobs) --- */
  const startItemRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) throw new Error('No mic stream');

    const mimeType = pickRecorderMime();
    const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    mimeRef.current = rec.mimeType || mimeType || '';
    chunksRef.current = [];

    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };

    recorderRef.current = rec;
    rec.start(); // no timeslice -> complete file with header
  }, []);

  const stopItemRecorder = useCallback(async (): Promise<Blob | null> => {
    const rec = recorderRef.current;
    if (!rec) return null;

    const blobType = mimeRef.current || rec.mimeType || 'audio/webm';

    const blob: Blob | null = await new Promise((resolve) => {
      try {
        rec.onstop = () => {
          const chunks = chunksRef.current;
          if (!chunks.length) return resolve(null);
          resolve(new Blob(chunks, { type: blobType }));
        };
        try {
          (rec as any).requestData?.();
        } catch {}
        rec.stop();
      } catch {
        resolve(null);
      }
    });

    recorderRef.current = null;
    chunksRef.current = [];
    return blob;
  }, []);

  const stopAll = () => {
    try {
      recorderRef.current?.stop();
    } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    chunksRef.current = [];
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

  const ensureSessionId = () => {
    if (!sessionIdRef.current)
      sessionIdRef.current = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const startMic = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMicError('Dieser Browser unterstützt Mikrofon-Aufnahmen nicht.');
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
      ensureSessionId();
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
          } catch {}
        }, 0);
      } else {
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
      } catch {}
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
    const clamped = Math.min(97, Math.max(3, pct));
    setSliderPosition(clamped);
    setSliderMoved(true);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (saving || isLocked) return;
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
    } catch {}
  };

  useEffect(() => {
    const el = spectrumRef.current;
    if (!el) return;

    const onTouchStart = (ev: TouchEvent) => {
      if (saving || isLocked) return;
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
  }, [handleSliderMove, saving, isLocked]);

  if (!patientId) {
    return (
      <main style={styles.app}>
        <h1 style={{ ...styles.title, marginTop: 24 }}>Patienten-ID eingeben</h1>
        <div style={{ marginTop: 24, textAlign: 'center', maxWidth: 400, width: '100%' }}>
          <p style={{ fontSize: 16, color: '#444', marginBottom: 16 }}>
            Bitte geben Sie die Patienten-ID ein (Format: P01, P02...).
          </p>
          <input
            type="text"
            value={patientIdInput}
            onChange={(e) => {
              setPatientIdInput(e.target.value);
              setPatientIdError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitPatientId();
            }}
            placeholder="P01"
            autoFocus
            style={{
              width: '100%',
              fontSize: 20,
              padding: '12px 14px',
              borderRadius: 12,
              border: '2px solid #ccc',
              marginBottom: 10,
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          />
          {patientIdError && <p style={{ color: '#b00020', marginBottom: 10 }}>{patientIdError}</p>}
          <button
            type="button"
            style={{ ...styles.btn, ...styles.btnPrimary }}
            onClick={submitPatientId}
          >
            Weiter
          </button>
        </div>
        <footer style={{ ...styles.footer, marginTop: 'auto' }}>
          <div style={styles.footerText}>{VERSION}</div>
        </footer>
      </main>
    );
  }

  if (testMode) {
    return (
      <main style={styles.app}>
        <h1 style={styles.title}>Willkommen</h1>
        <div style={{ marginTop: 24, textAlign: 'center', maxWidth: 600 }}>
          <p style={{ fontSize: 18, color: '#444' }}>Bitte erlauben Sie den Mikrofon-Zugriff.</p>
          {!!micError && <p style={{ color: '#b00020' }}>{micError}</p>}

          <button type="button" style={{ ...styles.btn, ...styles.btnPrimary }} onClick={startMic}>
            Übungslauf starten
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        ...styles.app,
        backgroundColor: showFlash ? '#87CEEB' : '#f6f4f0',
        transition: 'background 0.2s',
      }}
    >
      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        onError={() => setAudioError('Audio-Datei nicht gefunden oder nicht unterstützt.')}
        style={{ display: 'none' }}
      />

      {isPracticeMode && <div style={styles.practiceBanner}>ÜBUNGSMODUS</div>}

      {!isPracticeMode && (
        <div style={styles.progressRow}>
          <div style={styles.progressText}>{progressText}</div>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      <div style={styles.questionHeader}>
        <h1 style={styles.title}>
          {isPracticeMode ? PRACTICE_QUESTION : REAL_QUESTIONS[questionIndex]}
        </h1>

        <button
          type="button"
          onClick={() => setDingActive((v) => !v)}
          style={{
            ...styles.audioBtn,
            background: dingActive ? '#9d8d71' : '#fff',
            color: dingActive ? '#fff' : '#000',
          }}
          aria-label={dingActive ? 'Ton an' : 'Ton aus'}
          title={dingActive ? 'Ton an' : 'Ton aus'}
        >
          {dingActive ? (
            <BellFill size={isMobile ? 18 : 20} />
          ) : (
            <BellSlashFill size={isMobile ? 18 : 20} />
          )}
        </button>
      </div>

      {!showSummary ? (
        <>
          <section style={styles.centerArea}>
            <div style={styles.endLabelTop}>Sehr gut</div>

            {/* ✅ On mobile: play button ABOVE the slider, not off-screen */}
            {isMobile ? (
              <button
                type="button"
                onClick={playItemAudio}
                style={styles.playBtnMobile}
                aria-label="Frage abspielen"
                title="Frage abspielen"
              >
                <PlayFill size={22} />
                <span style={{ fontWeight: 700 }}>Frage abspielen</span>
              </button>
            ) : null}

            <div style={styles.sliderWrap}>
              {!isMobile ? (
                <button
                  type="button"
                  onClick={playItemAudio}
                  style={styles.playBtnAnchored}
                  aria-label="Frage abspielen"
                  title="Frage abspielen"
                >
                  <PlayFill size={32} />
                </button>
              ) : null}

              <div
                ref={spectrumRef}
                style={styles.trackBox}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <div style={styles.gradientBar} />
                <div style={{ ...styles.cap, ...styles.capTop }} />
                <div style={{ ...styles.cap, ...styles.capBottom }} />
                <div
                  role="slider"
                  aria-valuenow={sliderPosition}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  style={{ ...styles.knob, bottom: `${sliderPosition}%` }}
                />
              </div>
            </div>

            {audioError && <div style={styles.audioError}>{audioError}</div>}

            <div style={styles.endLabelBottom}>Sehr schlecht</div>
          </section>

          {showSliderAlert && (
            <div style={styles.modalOverlay}>
              <div style={styles.modal}>
                <p style={{ fontSize: 18, marginBottom: 20 }}>
                  Möchten Sie den Schieber in der Mitte belassen oder eine andere Position wählen?
                </p>
                <button
                  type="button"
                  style={{ ...styles.btn, ...styles.btnPrimary, marginBottom: 10 }}
                  onClick={() => executeNextSafe(sliderPosition)}
                >
                  Belassen und weiter
                </button>
                <button
                  type="button"
                  style={{ ...styles.btn, ...styles.btnNeutral }}
                  onClick={() => setShowSliderAlert(false)}
                >
                  Schieber anpassen
                </button>
              </div>
            </div>
          )}

          {uploadFail.open && (
            <div style={styles.modalOverlay}>
              <div style={styles.modal}>
                <h3 style={{ marginTop: 0 }}>Upload fehlgeschlagen</h3>
                <p style={{ whiteSpace: 'pre-wrap', marginBottom: 16 }}>{uploadFail.message}</p>

                <div
                  style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}
                >
                  <button
                    type="button"
                    style={{ ...styles.btn, ...styles.btnNeutral, minWidth: 180 }}
                    onClick={() =>
                      setUploadFail({ open: false, message: '', audio: null, meta: null })
                    }
                  >
                    Schließen
                  </button>

                  <button
                    type="button"
                    style={{ ...styles.btn, ...styles.btnPrimary, minWidth: 220 }}
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

          {/* ✅ Buttons stack on mobile */}
          <div style={styles.buttonsRow}>
            {isPracticeMode ? (
              <button
                type="button"
                style={{ ...styles.btn, ...styles.btnPrimary }}
                onClick={() => executeNextSafe(50)}
              >
                Start
              </button>
            ) : (
              <>
                <button
                  type="button"
                  style={{ ...styles.btn, ...styles.btnNeutral, opacity: isLocked ? 0.5 : 1 }}
                  disabled={saving || isLocked}
                  onClick={() => handleNext('NA')}
                >
                  Kann ich nicht beantworten
                </button>
                <button
                  type="button"
                  style={{ ...styles.btn, ...styles.btnPrimary, opacity: isLocked ? 0.5 : 1 }}
                  disabled={saving || isLocked}
                  onClick={() => handleNext(sliderPosition)}
                >
                  Weiter
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <div style={styles.buttonsRow}>
          <button
            type="button"
            style={{ ...styles.btn, ...styles.btnPrimary }}
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
          >
            Beenden
          </button>
        </div>
      )}

      {/* ✅ Footer stacks on mobile */}
      <footer style={styles.footer}>
        <button
          type="button"
          onClick={() => {
            localStorage.clear();
            window.location.reload();
          }}
          style={styles.resetLink}
        >
          ID zurücksetzen
        </button>
        <div style={styles.footerText}>{patientId ? `ID: ${patientId}` : 'No ID'}</div>
        <div style={styles.footerText}>{VERSION}</div>
      </footer>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    minHeight: '100svh',
    background: '#f6f4f0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'env(safe-area-inset-top) 12px calc(16px + env(safe-area-inset-bottom))',
    fontFamily: 'sans-serif',
    color: '#1f1f1f',
    maxWidth: 980,
    margin: '0 auto',
  },

  practiceBanner: {
    background: '#ffcc00',
    padding: '6px 14px',
    borderRadius: 999,
    fontWeight: 'bold',
    marginTop: 8,
    fontSize: 13,
  },

  progressRow: { width: '100%', marginTop: 8 },
  progressText: { fontSize: 13, color: '#4a4a4a', marginBottom: 6 },
  progressTrack: { width: '100%', height: 8, background: '#e2e2e2', borderRadius: 8 },
  progressFill: {
    height: '100%',
    background: '#2fb463',
    borderRadius: 8,
    transition: 'width .2s ease',
  },

  questionHeader: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 10,
    alignItems: 'start',
    marginTop: 6,
  },

  title: {
    margin: '10px 0 6px',
    fontSize: 'clamp(18px, 4.8vw, 32px)',
    lineHeight: 1.25,
    textAlign: 'left',
    wordBreak: 'break-word',
    hyphens: 'auto',
  },

  audioBtn: {
    border: '1px solid #ccc',
    borderRadius: '50%',
    width: 'clamp(44px, 10vw, 52px)',
    height: 'clamp(44px, 10vw, 52px)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
  },

  centerArea: {
    flex: 1,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },

  endLabelTop: { fontSize: 'clamp(16px, 4vw, 20px)', color: '#222' },
  endLabelBottom: { fontSize: 'clamp(16px, 4vw, 20px)', color: '#222' },

  sliderWrap: {
    position: 'relative',
    width: 'min(180px, 56vw)', // ✅ narrower on small phones
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },

  playBtnAnchored: {
    position: 'absolute',
    left: 'calc(-76px - 64px)',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 76,
    height: 76,
    borderRadius: '50%',
    border: 'none',
    background: '#9bb0e6',
    color: '#0f1a2a',
    cursor: 'pointer',
    boxShadow: '0 10px 20px rgba(0,0,0,0.12)',
    display: 'grid',
    placeItems: 'center',
  },

  playBtnMobile: {
    width: '100%',
    maxWidth: 520,
    border: 'none',
    borderRadius: 14,
    padding: '12px 14px',
    background: '#9bb0e6',
    color: '#0f1a2a',
    cursor: 'pointer',
    boxShadow: '0 8px 16px rgba(0,0,0,0.10)',
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  trackBox: {
    position: 'relative',
    width: '100%',
    height: 'clamp(320px, 55svh, 560px)', // ✅ fits phones
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'none',
    overscrollBehavior: 'contain',
  },

  gradientBar: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    top: 0,
    width: '100%',
    height: '100%',
    background: 'linear-gradient(180deg, #71dfc6 0%, #eef0ec 50%, #c47993 100%)',
    borderRadius: 18,
  },

  cap: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '145%',
    height: 18,
    borderRadius: 8,
  },
  capTop: { top: -5, background: '#67d7be' },
  capBottom: { bottom: -5, background: '#c47993' },

  knob: {
    position: 'absolute',
    left: '50%',
    transform: 'translate(-50%, 50%)',
    width: '135%',
    height: 28,
    background: '#1f1f1f',
    borderRadius: 16,
    boxShadow: '0 2px 8px rgba(0,0,0,.25)',
  },

  audioError: { marginTop: 6, color: '#b00020', fontSize: 13, textAlign: 'center' },

  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    padding: 12,
  },
  modal: {
    background: '#fff',
    padding: 18,
    borderRadius: 16,
    maxWidth: 520,
    width: '100%',
    textAlign: 'center',
  },

  buttonsRow: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 12,
    marginTop: 8,
  },

  btn: {
    width: '100%',
    minHeight: 56,
    fontSize: 'clamp(16px, 4.4vw, 20px)',
    borderRadius: 14,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  btnNeutral: { background: '#e7e2da', color: '#1f1f1f' },
  btnPrimary: { background: '#9d8d71', color: '#fff' },

  footer: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 6,
    padding: '10px 0 0',
    fontSize: 13,
    color: '#707070',
    textAlign: 'center',
  },

  resetLink: {
    color: '#9b9b9b',
    background: 'none',
    border: 'none',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  footerText: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
};
