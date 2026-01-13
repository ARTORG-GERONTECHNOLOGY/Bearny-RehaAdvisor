import { useState, useRef, useEffect, useCallback } from 'react';

const TEST_QUESTION = 'Testlauf Beispiel: Holzhacken';
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
const VERSION = 'Version 7, 05.12.2025';

export default function HealthSlider() {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // store answers locally (optional)
  const [answers, setAnswers] = useState<[string, number][]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [testMode, setTestMode] = useState(true);

  // participant code entered by user (NOT DB id)
  const [participantId, setParticipantId] = useState('');

  // recording state
  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [saving, setSaving] = useState(false);

  const spectrumRef = useRef<HTMLDivElement | null>(null);

  // One recorder session
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  // Queue to resolve the next chunk when requestData fires
  const chunkResolversRef = useRef<Array<(b: Blob | null) => void>>([]);
  const lastCutAtRef = useRef<number>(Date.now());

  // session id to group all items
  const sessionIdRef = useRef<string>('');

  const total = REAL_QUESTIONS.length;
  const currentQuestion = testMode ? TEST_QUESTION : REAL_QUESTIONS[questionIndex];
  const progressText = testMode ? '' : `Frage ${questionIndex + 1} von ${total}`;
  const progressPercent = testMode ? 0 : ((questionIndex + 1) / total) * 100;

  // ---- helpers: slider move ----
  const handleSliderMove = useCallback((clientY: number) => {
    const el = spectrumRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let y = clientY - rect.top;
    y = Math.max(0, Math.min(rect.height, y));
    let pct = Math.round(100 - (y / rect.height) * 100);
    pct = Math.min(97, Math.max(3, pct));
    setSliderPosition(pct);
  }, []);

  // ---- dragging listeners ----
  useEffect(() => {
    const onMove = (e: MouseEvent) => isDragging && handleSliderMove(e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches.length === 1) {
        e.preventDefault();
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

  // ---- Ask participant code once (on mount) ----
  useEffect(() => {
    const stored = localStorage.getItem('participant_code');
    if (stored) {
      setParticipantId(stored);
      return;
    }
    const input = window.prompt('Bitte geben Sie Ihre Teilnehmer-ID ein:');
    if (input && input.trim()) {
      const cleaned = input.trim();
      localStorage.setItem('participant_code', cleaned);
      setParticipantId(cleaned);
    }
  }, []);

  // ---- pick a supported mime type ----
  const pickMime = () => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ];
    for (const c of candidates) {
      if ((window as any).MediaRecorder?.isTypeSupported?.(c)) return c;
    }
    return ''; // let browser decide
  };

  // ---- Start recording ONCE (user click) ----
  const startInterview = async () => {
    setMicError('');

    if (!participantId) {
      setMicError('Teilnehmer-ID fehlt. Bitte Seite neu laden und ID setzen.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      rec.ondataavailable = (ev: BlobEvent) => {
        const resolver = chunkResolversRef.current.shift();
        if (!resolver) return;
        if (ev.data && ev.data.size > 0) resolver(ev.data);
        else resolver(null);
      };

      rec.onerror = () => {
        setMicError('Audioaufnahme-Fehler. Bitte Browser neu starten oder anderes Gerät.');
      };

      recorderRef.current = rec;

      // session id = timestamp+random
      sessionIdRef.current = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

      rec.start(); // continuous
      lastCutAtRef.current = Date.now();

      setMicReady(true);
      setIsRecording(true);

      // move from test screen to first real question if you want immediately:
      // keep your old behavior: first click transitions out of testMode
      setTestMode(false);
      setQuestionIndex(0);
      setSliderPosition(50);

    } catch (e: any) {
      setMicError(
        e?.name === 'NotAllowedError'
          ? 'Mikrofon-Zugriff verweigert. Bitte erlauben und erneut versuchen.'
          : 'Mikrofon konnte nicht gestartet werden.'
      );
    }
  };

  // ---- Request a chunk since last cut (auto per question) ----
  const cutAudioChunk = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state !== 'recording') return resolve(null);

      chunkResolversRef.current.push(resolve);
      try {
        rec.requestData(); // emits one dataavailable with audio since last requestData/start
      } catch {
        resolve(null);
      }
    });
  };

  // ---- Upload one item (answer + chunk) ----
  const uploadItem = async (payload: {
    questionIndex: number;
    questionText: string;
    answerValue: number;
    audio: Blob | null;
  }) => {
    const fd = new FormData();
    fd.append('participantId', participantId);
    fd.append('sessionId', sessionIdRef.current);
    fd.append('version', VERSION);
    fd.append('questionIndex', String(payload.questionIndex));
    fd.append('questionText', payload.questionText);
    fd.append('answerValue', String(payload.answerValue));
    fd.append('answeredAt', new Date().toISOString());

    if (payload.audio) {
      // name can be anything; backend stores to GridFS
      const ext = payload.audio.type.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([payload.audio], `q_${payload.questionIndex}.${ext}`, {
        type: payload.audio.type || 'audio/webm',
      });
      fd.append('audio', file);
      // optional: duration can be measured client-side later
    }

    const res = await fetch('/api/healthslider/submit-item/', {
      method: 'POST',
      body: fd,
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error || 'Upload failed');
    }
  };

  // ---- stop recorder + mic ----
  const stopRecording = () => {
    try {
      recorderRef.current?.stop();
    } catch {}
    recorderRef.current = null;

    const s = streamRef.current;
    if (s) s.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    setIsRecording(false);
    setMicReady(false);
  };

  // cleanup on unmount
  useEffect(() => {
    return () => stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- advance + auto-save per question ----
  const goNext = async (answerValue: number | 'NA') => {
    if (testMode) {
      // if you want to keep a test step BEFORE start, do not use this.
      // With auto-record once, we start via startInterview() button instead.
      return;
    }

    if (!isRecording) {
      setMicError('Aufnahme läuft nicht. Bitte Interview neu starten.');
      return;
    }

    const val = answerValue === 'NA' ? -1 : answerValue;

    setSaving(true);
    setMicError('');

    try {
      const audioChunk = await cutAudioChunk();

      await uploadItem({
        questionIndex,
        questionText: REAL_QUESTIONS[questionIndex],
        answerValue: val,
        audio: audioChunk,
      });

      // keep local summary (optional)
      const updated = [...answers, [REAL_QUESTIONS[questionIndex], val]] as [string, number][];
      setAnswers(updated);

      if (questionIndex < total - 1) {
        setQuestionIndex((i) => i + 1);
        setSliderPosition(50);
      } else {
        setShowSummary(true);
        // optionally stop here (or after confirm)
        stopRecording();
      }
    } catch (e: any) {
      setMicError(e?.message || 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    if (testMode || questionIndex === 0 || saving) return;

    setAnswers((prev) => {
      const lastVal = prev[prev.length - 1]?.[1];
      setSliderPosition(typeof lastVal === 'number' && lastVal >= 0 ? lastVal : 50);
      return prev.slice(0, -1);
    });
    setQuestionIndex((i) => Math.max(0, i - 1));
    // Note: going back does NOT “uncut” audio already uploaded.
    // If you need that, we add delete/overwrite endpoints.
  };

  const confirmAndFinish = () => {
    alert('Fragebogen abgeschlossen!');
    stopRecording();

    setAnswers([]);
    setQuestionIndex(0);
    setSliderPosition(50);
    setShowSummary(false);
    setTestMode(true);

    localStorage.removeItem('participant_code');
    window.location.reload();
  };

  // --- UI ---
  return (
    <main style={styles.app}>
      {!testMode && (
        <div style={styles.progressRow}>
          <div style={styles.progressText}>{progressText}</div>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      <h1 style={styles.title}>{currentQuestion}</h1>

      {/* One-time mic start screen */}
      {testMode ? (
        <div style={{ width: '100%', maxWidth: 980, marginTop: 18, textAlign: 'center' }}>
          <p style={{ color: '#444', fontSize: 18 }}>
            Bitte erlauben Sie das Mikrofon. Die Aufnahme startet automatisch und wird pro Frage gespeichert.
          </p>

          {micError && (
            <div style={{ color: '#b00020', marginBottom: 12 }}>
              {micError}
            </div>
          )}

          <button
            style={{ ...styles.btn, ...styles.btnPrimary, maxWidth: 520 }}
            onClick={startInterview}
          >
            Interview starten (Mikrofon aktivieren)
          </button>
        </div>
      ) : (
        <>
          {micError && (
            <div style={{ color: '#b00020', marginTop: 8 }}>
              {micError}
            </div>
          )}

          <section style={styles.centerArea}>
            <div style={styles.endLabelTop} aria-hidden>Sehr gut</div>

            <div
              ref={spectrumRef}
              style={styles.trackBox}
              onClick={(e) => handleSliderMove(e.clientY)}
              aria-label="Schieberegler vertikal"
              role="group"
            >
              <div style={styles.gradientBar} />
              <div style={{ ...styles.cap, ...styles.capTop }} />
              <div style={{ ...styles.cap, ...styles.capBottom }} />

              <div
                role="slider"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={sliderPosition}
                aria-label="Wert einstellen"
                tabIndex={0}
                onMouseDown={() => setIsDragging(true)}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                style={{
                  ...styles.knob,
                  bottom: `${sliderPosition}%`,
                }}
              />
            </div>

            <div style={styles.endLabelBottom} aria-hidden>Sehr schlecht</div>
          </section>

          {!showSummary ? (
            <>
              <div style={styles.buttonsRow}>
                <button
                  style={{ ...styles.btn, ...styles.btnNeutral }}
                  disabled={saving}
                  onClick={() => goNext('NA')}
                >
                  {saving ? 'Speichern…' : 'Kann ich nicht beantworten'}
                </button>

                <button
                  style={{ ...styles.btn, ...styles.btnPrimary }}
                  disabled={saving}
                  onClick={() => goNext(sliderPosition)}
                >
                  {saving ? 'Speichern…' : 'Weiter'}
                </button>
              </div>

              <div style={styles.backSpacer} />

              <div style={styles.backRow}>
                <button
                  type="button"
                  onClick={goBack}
                  disabled={questionIndex === 0 || saving}
                  style={{
                    ...styles.btnBack,
                    ...(questionIndex === 0 || saving ? styles.btnBackDisabled : {}),
                  }}
                  aria-label="Zurück zur vorherigen Frage"
                  title="Zurück"
                >
                  Zurück
                </button>
              </div>
            </>
          ) : (
            <div style={styles.buttonsRow}>
              <button
                style={{ ...styles.btn, ...styles.btnPrimary }}
                onClick={confirmAndFinish}
              >
                Bestätigen & Beenden
              </button>
            </div>
          )}

          <footer style={styles.footer}>
            <button
              onClick={() => {
                localStorage.removeItem('participant_code');
                stopRecording();
                window.location.reload();
              }}
              style={styles.resetLink}
            >
              ID zurücksetzen
            </button>
            <div style={styles.footerText}>
              {participantId ? `Teilnehmer:in: ${participantId}` : 'No ID gesetzt'}
              {isRecording ? ' • Aufnahme läuft' : ''}
            </div>
            <div style={styles.footerText}>{VERSION}</div>
          </footer>
        </>
      )}
    </main>
  );
}

/** ====== STYLES (unchanged from you, keep your existing styles) ====== */
const styles: Record<string, React.CSSProperties> = {
  app: {
    minHeight: '100dvh',
    background: '#f6f4f0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflowY: 'auto',
    padding: '0 16px 24px',
    fontFamily:
      '"Atkinson Hyperlegible", system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    color: '#1f1f1f',
  },
  progressRow: { width: '100%', maxWidth: 980, marginTop: 8 },
  progressText: { fontSize: 14, color: '#4a4a4a', marginBottom: 6 },
  progressTrack: { width: '100%', height: 8, background: '#e2e2e2', borderRadius: 8 },
  progressFill: {
    height: '100%',
    background: '#2fb463',
    borderRadius: 8,
    transition: 'width .2s ease',
  },
  title: {
    margin: '8px 0 0',
    fontSize: 36,
    lineHeight: 1.2,
    textAlign: 'center',
    maxWidth: 980,
  },
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
  trackBox: {
    position: 'relative',
    width: 140,
    height: 'min(60vh, calc(100dvh - 260px))',
    touchAction: 'none',
  },
  gradientBar: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    top: 0,
    width: '100%',
    height: '100%',
    background: 'linear-gradient(180deg, #71dfc6 0%, #eef0ec 50%, #c47993 100%)',
    borderRadius: 14,
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.05)',
    zIndex: 0,
  },
  cap: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '140%',
    height: 15,
    borderRadius: 6,
    zIndex: 1,
  },
  capTop: { top: -5, background: '#67d7be' },
  capBottom: { bottom: -5, background: '#c47993' },
  knob: {
    position: 'absolute',
    left: '50%',
    transform: 'translate(-50%, 50%)',
    width: '130%',
    height: 28,
    background: '#1f1f1f',
    borderRadius: 16,
    opacity: 0.9,
    zIndex: 2,
    cursor: 'grab',
    boxShadow: '0 2px 8px rgba(0,0,0,.25)',
  },
  buttonsRow: {
    width: '100%',
    maxWidth: 980,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    padding: '4px 0 4px',
  },
  btn: {
    flex: 1,
    minHeight: 56,
    fontSize: 20,
    borderRadius: 14,
    border: 'none',
    letterSpacing: 0.2,
  },
  btnNeutral: { background: '#e7e2da', color: '#1f1f1f' },
  btnPrimary: { background: '#9d8d71', color: '#fff' },
  backSpacer: { height: 'min(22vh, 260px)' },
  backRow: {
    width: '100%',
    maxWidth: 980,
    display: 'flex',
    justifyContent: 'center',
  },
  btnBack: {
    padding: '10px 16px',
    fontSize: 16,
    borderRadius: 10,
    background: '#efefef',
    color: '#4a4a4a',
    border: '1px solid #ddd',
    opacity: 0.9,
  },
  btnBackDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  footer: {
    width: '100%',
    maxWidth: 980,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '6px 0 10px',
    color: '#707070',
    fontSize: 14,
  },
  resetLink: {
    fontSize: 14,
    color: '#9b9b9b',
    background: 'none',
    border: 'none',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  footerText: { whiteSpace: 'nowrap' },
};
