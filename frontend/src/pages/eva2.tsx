import { useState, useRef, useEffect, useCallback } from 'react';
import { zipSync, strToU8 } from 'fflate';

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

/** ===== Helpers ===== */
const safeFilePart = (s: string) =>
  (s || '').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 60);

const downloadBlob = (blob: Blob, filename: string): boolean => {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return true;
  } catch { return false; }
};

export default function HealthSlider() {
  // --- PERSISTENCE & MODES ---
  const [sliderPosition, setSliderPosition] = useState(50);
  const [sliderMoved, setSliderMoved] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(() => {
    const saved = localStorage.getItem('survey_index');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isPracticeMode, setIsPracticeMode] = useState(() => localStorage.getItem('survey_index') === null);
  const [testMode, setTestMode] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [patientId, setPatientId] = useState('');

  // --- UI LOCK & AUDIO TOGGLE ---
  const [isLocked, setIsLocked] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [showSliderAlert, setShowSliderAlert] = useState(false);
  const [audioActive, setAudioActive] = useState(true);

  // --- RECORDING ---
  const [isRecording, setIsRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [micError, setMicError] = useState('');
  const spectrumRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sessionIdRef = useRef<string>(localStorage.getItem('survey_sessionId') || '');
  const chunkBufferRef = useRef<Blob[]>([]);
  const cutIndexRef = useRef(0);
  const firstChunkReadyRef = useRef<Promise<void> | null>(null);
  const firstChunkResolveRef = useRef<(() => void) | null>(null);

  const total = REAL_QUESTIONS.length;
  const progressPercent = isPracticeMode ? 0 : ((questionIndex + 1) / total) * 100;
  const progressText = isPracticeMode ? '' : `Frage ${questionIndex + 1} von ${total}`;

  /** --- AUDIO GENERATOR --- */
  const playDing = useCallback((freq = 550) => {
    if (!audioActive) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) { console.error(e); }
  }, [audioActive]);

  /** --- TEXT TO SPEECH --- */
  const readItemText = useCallback(() => {
    // We don't check audioActive inside here because we want to be able to 
    // trigger it manually during the toggle button's onClick.
    window.speechSynthesis.cancel();
    const text = isPracticeMode ? PRACTICE_QUESTION : REAL_QUESTIONS[questionIndex];
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    window.speechSynthesis.speak(utterance);
  }, [isPracticeMode, questionIndex]);

  /** --- CUE SYNC --- */
  useEffect(() => {
    if (testMode || showSummary) return;
    
    setShowFlash(true);
    setIsLocked(true);
    
    if (audioActive) {
      playDing(550);
      readItemText();
    }

    const flashTimer = setTimeout(() => setShowFlash(false), 300);
    const lockTimer = setTimeout(() => setIsLocked(false), 5000); 

    return () => {
      clearTimeout(flashTimer);
      clearTimeout(lockTimer);
    };
  }, [questionIndex, isPracticeMode, testMode, showSummary, audioActive, playDing, readItemText]); 

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

  useEffect(() => {
    if (!isPracticeMode) {
      localStorage.setItem('survey_index', questionIndex.toString());
      if (sessionIdRef.current) localStorage.setItem('survey_sessionId', sessionIdRef.current);
    }
  }, [questionIndex, isPracticeMode]);

  // --- PATIENT ID PROMPT ---
  useEffect(() => {
    const stored = localStorage.getItem('patient_id');
    if (stored) {
      setPatientId(stored);
    } else {
      let input = '';
      const idPattern = /^P\d+$/;
      while (!input.match(idPattern)) {
        const val = window.prompt('Bitte Patienten-ID eingeben (Format: P01, P02...):');
        if (val === null) break;
        input = val.trim();
        if (!input.match(idPattern)) alert('ID muss mit P beginnen (z.B. P01).');
      }
      if (input) {
        localStorage.setItem('patient_id', input);
        setPatientId(input);
      }
    }
  }, []);

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunkBufferRef.current = [];
      cutIndexRef.current = 0;
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunkBufferRef.current.push(ev.data); };
      recorderRef.current = rec;
      rec.start(750);
      setIsRecording(true);
      setTestMode(false);
    } catch (e) {
      setMicError('Mikrofon-Zugriff verweigert.');
    }
  };

  const cutAudioChunk = async (): Promise<Blob | null> => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== 'recording') return null;
    const start = cutIndexRef.current;
    const end = chunkBufferRef.current.length;
    if (end <= start) return null;
    const slice = chunkBufferRef.current.slice(start, end);
    cutIndexRef.current = end;
    return new Blob(slice, { type: slice[0]?.type || 'audio/webm' });
  };

  const stopAll = () => {
    try { recorderRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setIsRecording(false);
  };

  /** --- BACKEND UPLOAD --- */
  const uploadItem = async (payload: { questionIndex: number; questionText: string; answerValue: number; audio: Blob | null }) => {
    const fd = new FormData();
    fd.append('participantId', patientId);
    fd.append('sessionId', sessionIdRef.current);
    fd.append('questionIndex', String(payload.questionIndex)); // Q Number
    fd.append('questionText', payload.questionText);           // Q Full Text
    fd.append('answerValue', String(payload.answerValue));
    fd.append('answeredAt', new Date().toISOString());         // Timestamp

    if (payload.audio) {
      const ext = payload.audio.type.includes('mp4') ? 'mp4' : 'webm';
      fd.append('audioMime', payload.audio.type || '');
      fd.append('audio', new File([payload.audio], `rec_q${payload.questionIndex+1}.${ext}`, { type: payload.audio.type }));
    }

    const res = await fetch('/api/healthslider/submit-item/', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  };

  const handleNext = async (val: number | 'NA') => {
    if (val !== 'NA' && !sliderMoved && sliderPosition === 50) {
      setShowSliderAlert(true);
      return;
    }
    await executeNext(val);
  };

  const executeNext = async (val: number | 'NA') => {
    setShowSliderAlert(false);
    if (isPracticeMode) {
      setIsPracticeMode(false);
      setQuestionIndex(0); 
      setSliderPosition(50);
      setSliderMoved(false);
      return;
    }
    setSaving(true);
    try {
      if (!sessionIdRef.current) sessionIdRef.current = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const audio = await cutAudioChunk();
      await uploadItem({ 
        questionIndex, 
        questionText: REAL_QUESTIONS[questionIndex], 
        answerValue: val === 'NA' ? -1 : val, 
        audio 
      });
      advanceToNextQuestion();
    } catch (e) {
      alert("Fehler beim Speichern.");
    } finally { setSaving(false); }
  };

  const handleSliderMove = useCallback((clientY: number) => {
    const el = spectrumRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let y = clientY - rect.top;
    y = Math.max(0, Math.min(rect.height, y));
    const pct = Math.round(100 - (y / rect.height) * 100);
    setSliderPosition(Math.min(97, Math.max(3, pct)));
    setSliderMoved(true);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => isDragging && handleSliderMove(e.clientY);
    const stop = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stop);
    };
  }, [isDragging, handleSliderMove]);

  if (testMode) {
    return (
      <main style={styles.app}>
        <h1 style={styles.title}>Willkommen</h1>
        <div style={{ marginTop: 24, textAlign: 'center', maxWidth: 600 }}>
          <p style={{ fontSize: 18, color: '#444' }}>Bitte erlauben Sie den Mikrofon-Zugriff.</p>
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={startMic}>Übungslauf starten</button>
        </div>
      </main>
    );
  }

  return (
    <main style={{...styles.app, backgroundColor: showFlash ? '#ffffff' : '#f6f4f0', transition: 'background 0.2s'}}>
      {isPracticeMode && <div style={styles.practiceBanner}>ÜBUNGSMODUS</div>}

      {!isPracticeMode && (
        <div style={styles.progressRow}>
          <div style={styles.progressText}>{progressText}</div>
          <div style={styles.progressTrack}><div style={{ ...styles.progressFill, width: `${progressPercent}%` }} /></div>
        </div>
      )}

      <div style={styles.questionHeader}>
        <h1 style={styles.title}>{isPracticeMode ? PRACTICE_QUESTION : REAL_QUESTIONS[questionIndex]}</h1>
        <button 
          onClick={() => {
            const nextVal = !audioActive;
            setAudioActive(nextVal);
            // Feature: If turned ON, read the current question immediately
            if (nextVal) {
               readItemText();
            } else {
               window.speechSynthesis.cancel();
            }
          }} 
          style={{...styles.audioBtn, background: audioActive ? '#9d8d71' : '#fff', color: audioActive ? '#fff' : '#000'}} 
        >
          {audioActive ? '🔊' : '🔇'}
        </button>
      </div>

      {!showSummary ? (
        <>
          <section style={styles.centerArea}>
            <div style={styles.endLabelTop}>Sehr gut</div>
            <div ref={spectrumRef} style={styles.trackBox} onClick={(e) => handleSliderMove(e.clientY)}>
              <div style={styles.gradientBar} />
              <div style={{ ...styles.cap, ...styles.capTop }} />
              <div style={{ ...styles.cap, ...styles.capBottom }} />
              <div
                role="slider"
                aria-valuenow={sliderPosition}
                onMouseDown={() => setIsDragging(true)}
                onTouchStart={(e) => { e.stopPropagation(); setIsDragging(true); }}
                style={{ ...styles.knob, bottom: `${sliderPosition}%` }}
              />
            </div>
            <div style={styles.endLabelBottom}>Sehr schlecht</div>
          </section>

          {showSliderAlert && (
            <div style={styles.modalOverlay}>
              <div style={styles.modal}>
                <p style={{fontSize: 18, marginBottom: 20}}>Möchten Sie den Schieber in der Mitte belassen oder eine andere Position wählen?</p>
                <button style={{...styles.btn, ...styles.btnPrimary, marginBottom: 10}} onClick={() => executeNext(sliderPosition)}>Belassen und weiter</button>
                <button style={{...styles.btn, ...styles.btnNeutral}} onClick={() => setShowSliderAlert(false)}>Schieber anpassen</button>
              </div>
            </div>
          )}

          <div style={styles.buttonsRow}>
            {isPracticeMode ? (
              <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => executeNext(50)}>Start</button>
            ) : (
              <>
                <button style={{ ...styles.btn, ...styles.btnNeutral, opacity: isLocked ? 0.5 : 1 }} disabled={saving || isLocked} onClick={() => handleNext('NA')}>
                  Kann ich nicht beantworten
                </button>
                <button style={{ ...styles.btn, ...styles.btnPrimary, opacity: isLocked ? 0.5 : 1 }} disabled={saving || isLocked} onClick={() => handleNext(sliderPosition)}>
                  {isLocked ? 'Gesperrt' : 'Weiter'}
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <div style={styles.buttonsRow}>
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => { localStorage.clear(); window.location.reload(); }}>Beenden</button>
        </div>
      )}

      <footer style={styles.footer}>
        <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={styles.resetLink}>ID zurücksetzen</button>
        <div style={styles.footerText}>{patientId ? `ID: ${patientId}` : 'No ID'}</div>
        <div style={styles.footerText}>{VERSION}</div>
      </footer>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: { minHeight: '100dvh', background: '#f6f4f0', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 16px 24px', fontFamily: 'sans-serif', color: '#1f1f1f' },
  practiceBanner: { background: '#ffcc00', padding: '8px 20px', borderRadius: '20px', fontWeight: 'bold', marginTop: 10, fontSize: 14 },
  progressRow: { width: '100%', maxWidth: 980, marginTop: 8 },
  progressText: { fontSize: 14, color: '#4a4a4a', marginBottom: 6 },
  progressTrack: { width: '100%', height: 8, background: '#e2e2e2', borderRadius: 8 },
  progressFill: { height: '100%', background: '#2fb463', borderRadius: 8, transition: 'width .2s ease' },
  questionHeader: { display: 'flex', alignItems: 'center', gap: 15, width: '100%', maxWidth: 980, justifyContent: 'center' },
  title: { margin: '16px 0', fontSize: 32, lineHeight: 1.2, textAlign: 'center' },
  audioBtn: { background: '#fff', border: '1px solid #ccc', borderRadius: '50%', width: 50, height: 50, fontSize: 24, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
  centerArea: { flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 },
  endLabelTop: { fontSize: 20, color: '#222' },
  endLabelBottom: { fontSize: 20, color: '#222' },
  trackBox: { position: 'relative', width: 180, height: 'min(72vh, 640px)', touchAction: 'none' },
  gradientBar: { position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 0, width: '100%', height: '100%', background: 'linear-gradient(180deg, #71dfc6 0%, #eef0ec 50%, #c47993 100%)', borderRadius: 18 },
  cap: { position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: '145%', height: 18, borderRadius: 8 },
  capTop: { top: -5, background: '#67d7be' },
  capBottom: { bottom: -5, background: '#c47993' },
  knob: { position: 'absolute', left: '50%', transform: 'translate(-50%, 50%)', width: '135%', height: 34, background: '#1f1f1f', borderRadius: 18, boxShadow: '0 2px 8px rgba(0,0,0,.25)' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modal: { background: '#fff', padding: 30, borderRadius: 20, maxWidth: 400, width: '90%', textAlign: 'center' },
  buttonsRow: { width: '100%', maxWidth: 980, display: 'flex', justifyContent: 'space-between', gap: 16 },
  btn: { flex: 1, minHeight: 60, fontSize: 20, borderRadius: 14, border: 'none', cursor: 'pointer', fontWeight: 'bold' },
  btnNeutral: { background: '#e7e2da', color: '#1f1f1f' },
  btnPrimary: { background: '#9d8d71', color: '#fff' },
  footer: { width: '100%', maxWidth: 980, display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 14, color: '#707070' },
  resetLink: { color: '#9b9b9b', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' },
  footerText: { whiteSpace: 'nowrap' }
};