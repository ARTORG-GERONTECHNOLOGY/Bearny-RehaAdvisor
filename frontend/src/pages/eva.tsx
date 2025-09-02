import { useState, useRef, useEffect, useCallback } from 'react';

/** ====== DATA ====== */
const TEST_QUESTION = 'Testlauf Beispiel: Holzhacken';
const REAL_QUESTIONS = [
  'Allgemeine Gesundheit',
  'Essen und Trinken',
  'Sich selber und den Körper pflegen, sich waschen und kleiden',
  'Die Toilette benutzen, das Blasenmanagement, die Urinausscheidung, die Verdauung und das Management vom Stuhlganges',
  'Muskelfunktion und Muskelkraft',
  'Beweglichkeit, Gelenke und Knochen',
  'Liegen, sitzen, aufstehen, gehen, die Position wechseln und sich fortbewegen',
  'Sich mit Transportmitteln fortbewegen, z.B. Velo, Auto, ÖV oder Rollstuhl',
  'Herzfunktion, Atmung, Leistungsfähigkeit und Belastbarkeit',
  'Mit anderen kommunizieren, sich ausdrücken und verstehen können',
  'Pflege von sozialen Kontakten und Umgang mit anderen, Familie und Freunde',
  'Sexual Leben und sexuelle Funktionen',
  'Schlaf',
  'Problemlösen und Wissen anwenden',
  'Gedächtnis und Denken',
  'Umgang mit Emotionen und Gefühlen',
  'Psychische Energie und Antrieb',
  'Schmerz',
  'Ausführen von Aufgaben in Haushalt und Beruf, Freizeit und Erholung',
  'Einstellungen und Unterstützung von professionellen Personen',
  'Anderen helfen',
  'Verwendung von Produkten und Substanzen, z. B. Medikamenten',
  'Verwendung von Hilfsmittel und Technologien',
  'Versorgung durch das Gesundheitswesen',
  'Zugang zu private oder öffentlichen Gebäuden',
  'Umwelteinflüsse und Klima',
  'Auf Gesundheit achten',
];
const VERSION = 'Version 7.1, 03.04.2025';

/** ====== COMPONENT ====== */
export default function HealthSlider() {
  // slider state (0–100)
  const [sliderPosition, setSliderPosition] = useState(50);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [answers, setAnswers] = useState<[string, number][]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [testMode, setTestMode] = useState(true);
  const [patientId, setPatientId] = useState('');

  const spectrumRef = useRef<HTMLDivElement | null>(null);

  const total = REAL_QUESTIONS.length;
  const currentQuestion = testMode ? TEST_QUESTION : REAL_QUESTIONS[questionIndex];
  const progressText = testMode ? '' : `Frage ${questionIndex + 1} von ${total}`;
  const progressPercent = testMode ? 0 : ((questionIndex + 1) / total) * 100;

  /** position the slider by pointer Y within the track */
  const handleSliderMove = useCallback((clientY: number) => {
    const el = spectrumRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let y = clientY - rect.top;
    y = Math.max(0, Math.min(rect.height, y));
    // 0 at top -> 100 at bottom, but we use "bottom" positioning
    let pct = Math.round(100 - (y / rect.height) * 100);
    pct = Math.min(97, Math.max(3, pct)); // keep knob within caps
    setSliderPosition(pct);
  }, []);

  /** global event listeners for dragging */
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

    const val = answerValue === 'NA' ? -1 : answerValue; // NA as -1
    const updated = [...answers, [REAL_QUESTIONS[questionIndex], val]];
    if (questionIndex < total - 1) {
      setAnswers(updated);
      setQuestionIndex((i) => i + 1);
      setSliderPosition(50);
    } else {
      setAnswers(updated);
      setShowSummary(true);
    }
  };

  /** confirm export */
  const confirmAndExport = () => {
    exportResults(answers);
    alert('Fragebogen abgeschlossen!');
    setAnswers([]);
    setQuestionIndex(0);
    setSliderPosition(50);
    setShowSummary(false);
    setTestMode(true);
    localStorage.removeItem('patient_id');
    window.location.reload();
  };

  return (
    <main style={styles.app}>
      {/* small progress in top left */}
      {!testMode && (
        <div style={styles.progressRow}>
          <div style={styles.progressText}>{progressText}</div>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      {/* big keyword / title */}
      <h1 style={styles.title}>{currentQuestion}</h1>

      {/* center column with vertical slider */}
      <section style={styles.centerArea}>
        {/* top label tight to bar */}
        <div style={styles.endLabelTop} aria-hidden>Sehr gut</div>

        {/* track container */}
        <div
          ref={spectrumRef}
          style={styles.trackBox}
          onClick={(e) => handleSliderMove(e.clientY)}
          aria-label="Schieberegler vertikal"
          role="group"
        >
          {/* gradient bar (visible again) */}
          <div style={styles.gradientBar} />

          {/* wider caps, touching the bar */}
          <div style={{ ...styles.cap, ...styles.capTop }} />
          <div style={{ ...styles.cap, ...styles.capBottom }} />

          {/* big horizontal knob */}
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

        {/* bottom label tight to bar */}
        <div style={styles.endLabelBottom} aria-hidden>Sehr schlecht</div>
      </section>

      {/* buttons row — large hit targets, spaced */}
      {!showSummary ? (
        <div style={styles.buttonsRow}>
          <button
            style={{ ...styles.btn, ...styles.btnNeutral }}
            onClick={() => goNext('NA')}
          >
            Kann ich nicht beantworten
          </button>

          <button
            style={{ ...styles.btn, ...styles.btnPrimary }}
            onClick={() => goNext(sliderPosition)}
          >
            {testMode ? 'Interview starten' : 'Weiter'}
          </button>
        </div>
      ) : (
        <div style={styles.buttonsRow}>
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={confirmAndExport}>
            Bestätigen & Exportieren
          </button>
        </div>
      )}

      {/* footer with ID / version — compact to avoid scrolling */}
      <footer style={styles.footer}>
        <button
          onClick={() => {
            localStorage.removeItem('patient_id');
            window.location.reload();
          }}
          style={styles.resetLink}
        >
          ID zurücksetzen
        </button>
        <div style={styles.footerText}>
          {patientId ? `Teilnehmer:in: ${patientId}` : 'No ID gesetzt'}
        </div>
        <div style={styles.footerText}>{VERSION}</div>
      </footer>
    </main>
  );
}

/** ====== STYLES (inline for single-file drop-in) ====== */
const styles: Record<string, React.CSSProperties> = {
  app: {
    height: '100dvh', // iPad Safari safe viewport
    background: '#f6f4f0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'hidden', // no scrolling
    padding: '0 16px',
    fontFamily: '"Atkinson Hyperlegible", system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    color: '#1f1f1f',
  },

  /* progress (top-left, small) */
  progressRow: {
    width: '100%',
    maxWidth: 980,
    marginTop: 8,
  },
  progressText: {
    fontSize: 14,
    color: '#4a4a4a',
    marginBottom: 6,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    background: '#e2e2e2',
    borderRadius: 8,
  },
  progressFill: {
    height: '100%',
    background: '#2fb463',
    borderRadius: 8,
    transition: 'width .2s ease',
  },

  /* big keyword */
  title: {
    margin: '8px 0 0',
    fontSize: '36px', // larger, per request
    lineHeight: 1.2,
    textAlign: 'center',
    maxWidth: 980,
  },

  /* center column with bar — sized to avoid scroll on iPad */
  centerArea: {
    flex: 1,
    maxWidth: 980,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    // reserve room so buttons/footer fit without scroll
    paddingBottom: 12,
  },

  /* labels right above/below the bar */
  endLabelTop: { fontSize: 20, color: '#222', marginBottom: 6 },
  endLabelBottom: { fontSize: 20, color: '#222', marginTop: 6 },

  /* vertical track container */
  trackBox: {
    position: 'relative',
    width: 140,                 // bar width baseline
    height: 'min(60vh, calc(100dvh - 260px))',             // tuned for iPad to fit buttons
    touchAction: 'none',
  },

  /* visible gradient bar (z-index 0 so it never disappears) */
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

  /* end caps: slightly wider than the bar, touching it */
  cap: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '140%',          // wider than the bar
    height: 15,
    borderRadius: 6,
    zIndex: 1,
  },
  capTop: {
    top: -5,               // touches the bar visually
    background: '#67d7be',
  },
  capBottom: {
    bottom: -5,            // touches the bar visually
    background: '#c47993',
  },

  /* big horizontal knob for easy touch */
  knob: {
    position: 'absolute',
    left: '50%',
    transform: 'translate(-50%, 50%)',
    width: '130%',            // extends a bit beyond the bar
    height: 28,               // >= 44px in at least one dimension (horizontal)
    background: '#1f1f1f',
    borderRadius: 16,
    opacity: 0.9,
    zIndex: 2,
    cursor: 'grab',
    boxShadow: '0 2px 8px rgba(0,0,0,.25)',
  },

  /* buttons */
  buttonsRow: {
    width: '100%',
    maxWidth: 980,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,                 // big separation to reduce accidental taps
    padding: '4px 0 4px',
  },
  btn: {
    flex: 1,
    minHeight: 56,           // big hit target
    fontSize: 20,
    borderRadius: 14,
    border: 'none',
    letterSpacing: 0.2,
  },
  btnNeutral: { background: '#e7e2da', color: '#1f1f1f' },
  btnPrimary: { background: '#9d8d71', color: '#fff' },

  /* footer compact */
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
