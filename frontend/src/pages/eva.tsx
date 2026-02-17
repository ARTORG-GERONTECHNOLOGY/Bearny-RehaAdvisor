import React, { useState, useRef, useEffect, useCallback } from 'react';

/** ====== DATA ====== */
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
const VERSION = 'Version 8.1 (Auto-Save), 23.01.2026';

/** ====== safe storage helpers (NO setState inside) ====== */
function safeParseIndex(raw: string | null, fallback = 0) {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

function safeParseAnswers(raw: string | null, fallback: [string, number][] = []) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as [string, number][]) : fallback;
  } catch {
    return fallback;
  }
}

/** ====== COMPONENT ====== */
export default function HealthSlider() {
  const [storageWarning, setStorageWarning] = useState<string>('');

  // 1. Initialize state from LocalStorage if it exists (safe parsing)
  const [sliderPosition, setSliderPosition] = useState(50);

  const [questionIndex, setQuestionIndex] = useState(() => {
    const saved = localStorage.getItem('survey_index');
    return safeParseIndex(saved, 0);
  });

  const [isDragging, setIsDragging] = useState(false);

  const [answers, setAnswers] = useState<[string, number][]>(() => {
    const saved = localStorage.getItem('survey_answers');
    return safeParseAnswers(saved, []);
  });

  const [showSummary, setShowSummary] = useState(() => {
    return localStorage.getItem('survey_showSummary') === 'true';
  });

  const [testMode, setTestMode] = useState(() => {
    const saved = localStorage.getItem('survey_testMode');
    return saved === null ? true : saved === 'true';
  });

  const [patientId, setPatientId] = useState('');

  const spectrumRef = useRef<HTMLDivElement | null>(null);

  const total = REAL_QUESTIONS.length;

  // prevent out-of-range indexing if storage was weird
  const safeIndex = Number.isFinite(questionIndex)
    ? Math.min(Math.max(0, questionIndex), Math.max(0, total - 1))
    : 0;

  const currentQuestion = testMode ? TEST_QUESTION : REAL_QUESTIONS[safeIndex];
  const progressText = testMode ? '' : `Frage ${safeIndex + 1} von ${total}`;
  const progressPercent = testMode ? 0 : ((safeIndex + 1) / total) * 100;

  // ✅ 1b. Detect corrupted localStorage on mount, warn + reset keys + show banner.
  useEffect(() => {
    let corrupted = false;

    const rawIndex = localStorage.getItem('survey_index');
    if (rawIndex !== null) {
      const n = parseInt(rawIndex, 10);
      if (Number.isNaN(n)) {
        corrupted = true;
        console.warn('[HealthSlider] Corrupted localStorage value for survey_index:', rawIndex);
      }
    }

    const rawAnswers = localStorage.getItem('survey_answers');
    if (rawAnswers !== null) {
      try {
        const parsed = JSON.parse(rawAnswers);
        if (!Array.isArray(parsed)) {
          corrupted = true;
          console.warn(
            '[HealthSlider] Corrupted localStorage value for survey_answers (not an array):',
            rawAnswers
          );
        }
      } catch (e) {
        corrupted = true;
        console.warn(
          '[HealthSlider] Corrupted localStorage JSON for survey_answers:',
          rawAnswers,
          e
        );
      }
    }

    if (corrupted) {
      setStorageWarning('Stored survey progress was corrupted and has been reset.');
      // Clear the broken progress so user doesn’t stay in a crash loop
      localStorage.removeItem('survey_index');
      localStorage.removeItem('survey_answers');
      localStorage.removeItem('survey_testMode');
      localStorage.removeItem('survey_showSummary');

      // Reset state to clean defaults
      setQuestionIndex(0);
      setAnswers([]);
      setShowSummary(false);
      setTestMode(true);
      setSliderPosition(50);
    }
  }, []);

  // 2. Persistent Save Effect: Triggered whenever state changes
  useEffect(() => {
    localStorage.setItem('survey_index', String(questionIndex));
    localStorage.setItem('survey_answers', JSON.stringify(answers));
    localStorage.setItem('survey_testMode', String(testMode));
    localStorage.setItem('survey_showSummary', String(showSummary));
  }, [questionIndex, answers, testMode, showSummary]);

  /** position the slider by pointer Y within the track */
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

  /** global event listeners */
  useEffect(() => {
    const storedId = localStorage.getItem('patient_id');
    if (storedId) setPatientId(storedId);
    else {
      const input = window.prompt('Bitte geben Sie Ihre Patienten-ID ein:');
      if (input && input.trim()) {
        const cleaned = input.trim();
        localStorage.setItem('patient_id', cleaned);
        setPatientId(cleaned);
      }
    }

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

  /** export CSV */
  const exportResults = (rows: [string, number][]) => {
    const now = new Date().toISOString().split('T')[0];
    const fileName = `SUBJ_${patientId || 'Unbekannt'}-${VERSION.replace(/\W+/g, '_')}-Date_${now}.csv`;
    const csvRows = ['Frage,Prozent', ...rows.map(([q, a]) => `"${q}",${a}`)];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** advance */
  const goNext = (answerValue: number | 'NA') => {
    if (testMode) {
      setTestMode(false);
      setQuestionIndex(0);
      setSliderPosition(50);
      return;
    }

    const val = answerValue === 'NA' ? -1 : answerValue;
    const updated = [...answers, [REAL_QUESTIONS[safeIndex], val]];

    if (safeIndex < total - 1) {
      setAnswers(updated);
      setQuestionIndex((i) => i + 1);
      setSliderPosition(50);
    } else {
      setAnswers(updated);
      setShowSummary(true);
    }
  };

  /** go back */
  const goBack = () => {
    if (testMode || safeIndex === 0) return;

    setAnswers((prev) => {
      const newAnswers = prev.slice(0, -1);
      const lastVal = newAnswers[newAnswers.length - 1]?.[1];
      setSliderPosition(typeof lastVal === 'number' && lastVal >= 0 ? lastVal : 50);
      return newAnswers;
    });
    setQuestionIndex((i) => Math.max(0, i - 1));
  };

  /** Clear storage when finished */
  const confirmAndExport = () => {
    exportResults(answers);
    alert('Fragebogen abgeschlossen!');

    // Clear all survey progress
    localStorage.removeItem('survey_index');
    localStorage.removeItem('survey_answers');
    localStorage.removeItem('survey_testMode');
    localStorage.removeItem('survey_showSummary');
    localStorage.removeItem('patient_id');

    // Reset local state
    setAnswers([]);
    setQuestionIndex(0);
    setSliderPosition(50);
    setShowSummary(false);
    setTestMode(true);
    window.location.reload();
  };

  return (
    <main style={styles.app}>
      {storageWarning && (
        <div
          role="alert"
          style={{
            width: '100%',
            maxWidth: 980,
            background: '#fff3cd',
            border: '1px solid #ffeeba',
            color: '#856404',
            padding: '10px 12px',
            borderRadius: 10,
            marginTop: 10,
            marginBottom: 6,
            fontSize: 14,
          }}
        >
          {storageWarning}
        </div>
      )}

      {!testMode && (
        <div style={styles.progressRow}>
          <div style={styles.progressText}>{progressText}</div>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      <h1 style={styles.title}>{currentQuestion}</h1>

      <section style={styles.centerArea}>
        <div style={styles.endLabelTop} aria-hidden>
          Sehr gut
        </div>
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
            style={{ ...styles.knob, bottom: `${sliderPosition}%` }}
          />
        </div>
        <div style={styles.endLabelBottom} aria-hidden>
          Sehr schlecht
        </div>
      </section>

      {!showSummary ? (
        <>
          <div style={styles.buttonsRow}>
            <button style={{ ...styles.btn, ...styles.btnNeutral }} onClick={() => goNext('NA')}>
              Kann ich nicht beantworten
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={() => goNext(sliderPosition)}
            >
              {testMode ? 'Interview starten' : 'Weiter'}
            </button>
          </div>
          <div style={styles.backSpacer} />
          <div style={styles.backRow}>
            <button
              type="button"
              onClick={goBack}
              disabled={testMode || safeIndex === 0}
              style={{
                ...styles.btnBack,
                ...(testMode || safeIndex === 0 ? styles.btnBackDisabled : {}),
              }}
            >
              Zurück
            </button>
          </div>
        </>
      ) : (
        <div style={styles.buttonsRow}>
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={confirmAndExport}>
            Bestätigen & Exportieren
          </button>
        </div>
      )}

      <footer style={styles.footer}>
        <button
          onClick={() => {
            localStorage.clear(); // Complete reset
            window.location.reload();
          }}
          style={styles.resetLink}
        >
          Alle Daten löschen & Reset
        </button>
        <div style={styles.footerText}>{patientId ? `ID: ${patientId}` : 'No ID'}</div>
        <div style={styles.footerText}>{VERSION}</div>
      </footer>
    </main>
  );
}

// styles
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
    fontFamily: '"Atkinson Hyperlegible", system-ui, -apple-system, sans-serif',
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
  title: { margin: '8px 0 0', fontSize: 36, lineHeight: 1.2, textAlign: 'center', maxWidth: 980 },
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
  btn: { flex: 1, minHeight: 56, fontSize: 20, borderRadius: 14, border: 'none' },
  btnNeutral: { background: '#e7e2da', color: '#1f1f1f' },
  btnPrimary: { background: '#9d8d71', color: '#fff' },
  backSpacer: { height: 'min(22vh, 260px)' },
  backRow: { width: '100%', maxWidth: 980, display: 'flex', justifyContent: 'center' },
  btnBack: {
    padding: '10px 16px',
    fontSize: 16,
    borderRadius: 10,
    background: '#efefef',
    color: '#4a4a4a',
    border: '1px solid #ddd',
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
