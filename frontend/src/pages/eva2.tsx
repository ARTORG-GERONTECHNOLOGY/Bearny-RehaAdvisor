import { useState, useRef, useEffect, useCallback } from 'react';
import { zipSync, strToU8 } from 'fflate';

/** ====== DATA ====== */
const PRACTICE_QUESTION = 'Übungslauf Beispiel: Holzhacken (Wird nicht gespeichert)';
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
const VERSION = 'Version 8.1 (Original Look + Alert + Practice), 2026';

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

type FailureZip = { blob: Blob; filename: string };

const buildFailureZip = async (args: {
  audio: Blob;
  questionIndex: number;
  questionText: string;
  answerValue: number;
  patientId: string;
  sessionId: string;
}): Promise<FailureZip> => {
  const ext = args.audio.type.includes('mp4') ? 'mp4' : 'webm';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  const baseName =
    `healthslider_${safeFilePart(args.patientId || 'unknown')}` +
    `_q${String(args.questionIndex + 1).padStart(2, '0')}` +
    `_${stamp}`;

  const meta = {
    patientId: args.patientId,
    sessionId: args.sessionId,
    questionIndex: args.questionIndex,
    questionText: args.questionText,
    answerValue: args.answerValue,
    mimeType: args.audio.type,
    createdAt: new Date().toISOString(),
  };

  const audioBytes = new Uint8Array(await args.audio.arrayBuffer());
  const metaBytes = strToU8(JSON.stringify(meta, null, 2));

  const zipped = zipSync({
    [`${baseName}.${ext}`]: audioBytes,
    [`${baseName}.json`]: metaBytes,
  });

  const zipBlob = new Blob([zipped], { type: 'application/zip' });
  return { blob: zipBlob, filename: `${baseName}.zip` };
};

export default function HealthSlider() {
  // --- PERSISTENCE & MODES ---
  const [sliderPosition, setSliderPosition] = useState(50);
  const [questionIndex, setQuestionIndex] = useState(() => {
    const saved = localStorage.getItem('survey_index');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isPracticeMode, setIsPracticeMode] = useState(() => {
    return localStorage.getItem('survey_index') === null;
  });
  const [testMode, setTestMode] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [patientId, setPatientId] = useState('');

  // --- RECORDING & AUDIO ---
  const [isRecording, setIsRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [micError, setMicError] = useState('');
  const [practiceAudioUrl, setPracticeAudioUrl] = useState<string | null>(null);

  const spectrumRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sessionIdRef = useRef<string>(localStorage.getItem('survey_sessionId') || '');

  // ✅ Timeslice buffer (Safari/iPad stable)
  const chunkBufferRef = useRef<Blob[]>([]);
  const cutIndexRef = useRef(0);
  const firstChunkReadyRef = useRef<Promise<void> | null>(null);
  const firstChunkResolveRef = useRef<(() => void) | null>(null);

  const [failedZip, setFailedZip] = useState<FailureZip | null>(null);

  const total = REAL_QUESTIONS.length;
  const progressPercent = isPracticeMode ? 0 : ((questionIndex + 1) / total) * 100;
  const progressText = isPracticeMode ? '' : `Frage ${questionIndex + 1} von ${total}`;

  // --- AUTO-SAVE EFFECT ---
  useEffect(() => {
    if (!isPracticeMode) {
      localStorage.setItem('survey_index', questionIndex.toString());
      if (sessionIdRef.current) localStorage.setItem('survey_sessionId', sessionIdRef.current);
    }
  }, [questionIndex, isPracticeMode]);

  // --- ID INITIALIZATION ---
  useEffect(() => {
    const stored = localStorage.getItem('patient_id');
    if (stored) setPatientId(stored);
    else {
      const input = window.prompt('Bitte geben Sie Ihre Patienten-ID ein:');
      if (input && input.trim()) {
        localStorage.setItem('patient_id', input.trim());
        setPatientId(input.trim());
      }
    }
  }, []);

  const pickMime = () => {
    // Prefer mp4 for iOS if supported; fallback to webm
    const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
    return types.find((t) => (window as any).MediaRecorder?.isTypeSupported?.(t)) || '';
  };

  const startMic = async () => {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      // reset buffers
      chunkBufferRef.current = [];
      cutIndexRef.current = 0;

      firstChunkReadyRef.current = new Promise<void>((resolve) => {
        firstChunkResolveRef.current = resolve;
      });

      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunkBufferRef.current.push(ev.data);
          if (firstChunkResolveRef.current) {
            firstChunkResolveRef.current();
            firstChunkResolveRef.current = null;
          }
        }
      };

      recorderRef.current = rec;

      // ✅ crucial for iPad reliability
      rec.start(750);

      setIsRecording(true);
      setTestMode(false);
    } catch (e) {
      setMicError('Mikrofon-Zugriff verweigert. Bitte in den Einstellungen erlauben.');
    }
  };

  const cutAudioChunk = async (): Promise<Blob | null> => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== 'recording') return null;

    // wait for at least one chunk (prevents “empty every second”)
    if (firstChunkReadyRef.current) {
      await Promise.race([firstChunkReadyRef.current, new Promise((r) => setTimeout(r, 1500))]);
    }

    const start = cutIndexRef.current;
    const end = chunkBufferRef.current.length;
    if (end <= start) return null;

    const slice = chunkBufferRef.current.slice(start, end);
    cutIndexRef.current = end;

    const mime = slice[0]?.type || pickMime() || 'audio/webm';
    const blob = new Blob(slice, { type: mime });

    // tiny blobs are basically “no audio”
    if (blob.size < 1024) return null;
    return blob;
  };

  const stopAll = () => {
    try {
      recorderRef.current?.stop();
    } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setIsRecording(false);
  };

  // --- UPLOAD LOGIC WITH DETAILED ERRORS ---
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
      const ext = payload.audio.type.includes('mp4') ? 'mp4' : 'webm';
      fd.append('audioMime', payload.audio.type || '');
      fd.append('audio', new File([payload.audio], `rec.${ext}`, { type: payload.audio.type }));
    }

    try {
      const res = await fetch('/api/healthslider/submit-item/', { method: 'POST', body: fd });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = text;
        try {
          const j = JSON.parse(text);
          msg = j.error || j.message || text;
        } catch {}
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${String(msg).slice(0, 500)}`);
      }
    } catch (e: any) {
      // Build ZIP (audio + meta) and:
      // 1) attempt auto-download (works on many browsers)
      // 2) always keep a “manual download” fallback button (required for iPad reliability)
      if (payload.audio) {
        const zip = await buildFailureZip({
          audio: payload.audio,
          questionIndex: payload.questionIndex,
          questionText: payload.questionText,
          answerValue: Number(payload.answerValue),
          patientId,
          sessionId: sessionIdRef.current,
        });

        try {
          downloadBlob(zip.blob, zip.filename);
        } catch {
          // Safari may block auto downloads; fallback UI below
        }

        setFailedZip(zip);
      }

      alert(
        `Fehler beim Speichern!\nGrund: ${e?.message || 'Unbekannter Fehler'}\n\n` +
          `Die Aufnahme kann lokal als ZIP gespeichert werden. ` +
          `Falls kein Download gestartet hat (iPad), bitte unten auf „ZIP herunterladen“ tippen.`
      );

      throw e;
    }
  };

  // --- NAVIGATION ---
  const handleNext = async (val: number | 'NA') => {
    if (isPracticeMode) {
      const blob = await cutAudioChunk();
      if (blob) setPracticeAudioUrl(URL.createObjectURL(blob));
      return;
    }

    setSaving(true);
    try {
      if (!sessionIdRef.current) {
        sessionIdRef.current = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      }

      const audio = await cutAudioChunk();

      await uploadItem({
        questionIndex,
        questionText: REAL_QUESTIONS[questionIndex],
        answerValue: val === 'NA' ? -1 : val,
        audio,
      });

      // success -> clear any previous failedZip
      setFailedZip(null);

      if (questionIndex < total - 1) {
        setQuestionIndex((i) => i + 1);
        setSliderPosition(50);
      } else {
        setShowSummary(true);
        stopAll();
      }
    } catch {
      // uploadItem already alerted + prepared ZIP fallback UI
    } finally {
      setSaving(false);
    }
  };

  const startRealInterview = () => {
    setIsPracticeMode(false);
    setQuestionIndex(0);
    setSliderPosition(50);
    setPracticeAudioUrl(null);
    setFailedZip(null);
  };

  const handleSliderMove = useCallback((clientY: number) => {
    const el = spectrumRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let y = clientY - rect.top;
    y = Math.max(0, Math.min(rect.height, y));
    const pct = Math.round(100 - (y / rect.height) * 100);
    setSliderPosition(Math.min(97, Math.max(3, pct)));
  }, []);

  // --- GLOBAL EVENT LISTENERS ---
  useEffect(() => {
    const onMove = (e: MouseEvent) => isDragging && handleSliderMove(e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches.length === 1) {
        if (e.cancelable) e.preventDefault();
        handleSliderMove(e.touches[0].clientY);
      }
    };
    const stop = () => setIsDragging(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', stop);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', stop);
    };
  }, [isDragging, handleSliderMove]);

  // --- RENDERING ---
  if (testMode) {
    return (
      <main style={styles.app}>
        <h1 style={styles.title}>Willkommen</h1>
        <div style={{ marginTop: 24, textAlign: 'center', maxWidth: 600 }}>
          <p style={{ fontSize: 18, color: '#444' }}>
            Bitte erlauben Sie den Mikrofon-Zugriff. Wir starten mit einem Übungslauf, um die Bedienung zu testen.
          </p>
          {micError && <div style={{ color: '#b00020', marginBottom: 12 }}>{micError}</div>}
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={startMic}>
            Übungslauf starten
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.app}>
      {isPracticeMode && <div style={styles.practiceBanner}>ÜBUNGSMODUS - Daten werden nicht gespeichert</div>}

      {!isPracticeMode && (
        <div style={styles.progressRow}>
          <div style={styles.progressText}>{progressText}</div>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      <h1 style={styles.title}>{isPracticeMode ? PRACTICE_QUESTION : REAL_QUESTIONS[questionIndex]}</h1>

      {!showSummary ? (
        <>
          <section style={styles.centerArea}>
            <div style={styles.endLabelTop} aria-hidden>
              Sehr gut
            </div>

            <div
              ref={spectrumRef}
              style={styles.trackBox}
              onClick={(e) => handleSliderMove(e.clientY)}
              aria-label="Schieberegler vertikal"
            >
              <div style={styles.gradientBar} />
              <div style={{ ...styles.cap, ...styles.capTop }} />
              <div style={{ ...styles.cap, ...styles.capBottom }} />

              <div
                role="slider"
                aria-valuenow={sliderPosition}
                onMouseDown={() => setIsDragging(true)}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                style={{ ...styles.knob, bottom: `${sliderPosition}%` }}
              />
            </div>

            <div style={styles.endLabelBottom} aria-hidden>
              Sehr schlecht
            </div>
          </section>

          {isPracticeMode && practiceAudioUrl && (
            <div style={styles.audioTestBox}>
              <p style={{ marginBottom: 8, fontSize: 14 }}>Ihre Test-Aufnahme zum Prüfen:</p>
              <audio src={practiceAudioUrl} controls style={{ height: 40 }} />
            </div>
          )}

          {/* ✅ iPad-safe fallback: manual ZIP download */}
          {!!failedZip && !isPracticeMode && (
            <div style={styles.failureBox} role="alert" aria-live="polite">
              <div style={styles.failureTitle}>Upload fehlgeschlagen – Aufnahme lokal sichern</div>
              <div style={styles.failureText}>
                Wenn der automatische Download nicht gestartet hat (iPad/Safari), bitte unten tippen.
              </div>
              <div style={styles.failureActions}>
                <button
                  style={{ ...styles.btn, ...styles.btnPrimary, ...styles.failureBtn }}
                  onClick={() => downloadBlob(failedZip.blob, failedZip.filename)}
                >
                  ZIP herunterladen
                </button>
                <button
                  style={{ ...styles.btn, ...styles.btnNeutral, ...styles.failureBtn }}
                  onClick={() => setFailedZip(null)}
                >
                  Schließen
                </button>
              </div>
            </div>
          )}

          <div style={styles.buttonsRow}>
            {isPracticeMode ? (
              <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={startRealInterview}>
                {practiceAudioUrl ? 'Test okay, Interview starten' : 'Übung beenden & Start'}
              </button>
            ) : (
              <>
                <button
                  style={{ ...styles.btn, ...styles.btnNeutral }}
                  disabled={saving}
                  onClick={() => handleNext('NA')}
                >
                  {saving ? 'Speichert...' : 'Kann ich nicht beantworten'}
                </button>
                <button
                  style={{ ...styles.btn, ...styles.btnPrimary }}
                  disabled={saving}
                  onClick={() => handleNext(sliderPosition)}
                >
                  {saving ? 'Speichert...' : 'Weiter'}
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <div style={styles.buttonsRow}>
          <button
            style={{ ...styles.btn, ...styles.btnPrimary }}
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
          >
            Bestätigen & Beenden
          </button>
        </div>
      )}

      <footer style={styles.footer}>
        <button
          onClick={() => {
            localStorage.clear();
            window.location.reload();
          }}
          style={styles.resetLink}
        >
          ID zurücksetzen
        </button>
        <div style={styles.footerText}>
          {patientId ? `Teilnehmer:in: ${patientId}` : 'No ID'}
          {isRecording && !isPracticeMode ? ' • ⏺ Aufnahme läuft' : ''}
        </div>
        <div style={styles.footerText}>{VERSION}</div>
      </footer>
    </main>
  );
}

/** ====== ORIGINAL STYLES RESTORED (plus failure box) ====== */
const styles: Record<string, React.CSSProperties> = {
  app: {
    minHeight: '100dvh',
    background: '#f6f4f0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0 16px 24px',
    fontFamily: '"Atkinson Hyperlegible", system-ui, sans-serif',
    color: '#1f1f1f',
  },
  practiceBanner: {
    background: '#ffcc00',
    padding: '8px 20px',
    borderRadius: '20px',
    fontWeight: 'bold',
    marginTop: 10,
    fontSize: 14,
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  progressRow: { width: '100%', maxWidth: 980, marginTop: 8 },
  progressText: { fontSize: 14, color: '#4a4a4a', marginBottom: 6 },
  progressTrack: { width: '100%', height: 8, background: '#e2e2e2', borderRadius: 8 },
  progressFill: { height: '100%', background: '#2fb463', borderRadius: 8, transition: 'width .2s ease' },
  title: { margin: '16px 0', fontSize: 32, lineHeight: 1.2, textAlign: 'center', maxWidth: 980 },
  centerArea: {
    flex: 1,
    maxWidth: 980,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 12,
  },
  endLabelTop: { fontSize: 20, color: '#222', marginBottom: 6 },
  endLabelBottom: { fontSize: 20, color: '#222', marginTop: 6 },
  trackBox: { position: 'relative', width: 180, height: 'min(60vh, 520px)', touchAction: 'none' },
  gradientBar: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    top: 0,
    width: '100%',
    height: '100%',
    background: 'linear-gradient(180deg, #71dfc6 0%, #eef0ec 50%, #c47993 100%)',
    borderRadius: 18,
    zIndex: 0,
  },
  cap: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '145%',
    height: 18,
    borderRadius: 8,
    zIndex: 1,
  },
  capTop: { top: -5, background: '#67d7be' },
  capBottom: { bottom: -5, background: '#c47993' },
  knob: {
    position: 'absolute',
    left: '50%',
    transform: 'translate(-50%, 50%)',
    width: '135%',
    height: 34,
    background: '#1f1f1f',
    borderRadius: 18,
    opacity: 0.9,
    zIndex: 2,
    cursor: 'grab',
    boxShadow: '0 2px 8px rgba(0,0,0,.25)',
  },
  audioTestBox: {
    background: '#fff',
    padding: '12px',
    borderRadius: '14px',
    marginBottom: 16,
    boxShadow: 'inset 0 0 0 1px #eee',
  },
  buttonsRow: { width: '100%', maxWidth: 980, display: 'flex', justifyContent: 'space-between', gap: 16, padding: '4px 0' },
  btn: { flex: 1, minHeight: 56, fontSize: 20, borderRadius: 14, border: 'none', cursor: 'pointer' },
  btnNeutral: { background: '#e7e2da', color: '#1f1f1f' },
  btnPrimary: { background: '#9d8d71', color: '#fff' },
  footer: {
    width: '100%',
    maxWidth: 980,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '12px 0',
    color: '#707070',
    fontSize: 14,
  },
  resetLink: { fontSize: 14, color: '#9b9b9b', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' },
  footerText: { whiteSpace: 'nowrap' },

  // ✅ New: failure box (iPad-safe manual ZIP download)
  failureBox: {
    width: '100%',
    maxWidth: 980,
    background: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    boxShadow: 'inset 0 0 0 1px #f0d9a8',
    border: '1px solid #f0d9a8',
  },
  failureTitle: { fontSize: 16, fontWeight: 800, marginBottom: 6 },
  failureText: { fontSize: 14, color: '#444', marginBottom: 12 },
  failureActions: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  failureBtn: { minHeight: 52, fontSize: 18 },
};
