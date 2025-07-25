import { useState, useRef, useEffect, useCallback } from 'react';

const TEST_QUESTION = 'Testlauf Beispiel: Holzhacken';
const REAL_QUESTIONS = [
  'Allgemeine Gesundheit',
  'Essen und Trinken',
  'Sich selber und den Körper pflegen, sich waschen und kleiden',
  'Die Toilette benutzen, das Blasenmanagement, die Urinausscheidung, die Verdauung und das Management vom Stuhlgang',
  'Muskelfunktion und -kraft',
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

export default function HealthSlider() {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [answers, setAnswers] = useState<[string, number][]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [testMode, setTestMode] = useState(true);
  const [patientId, setPatientId] = useState('');
  const spectrumRef = useRef<HTMLDivElement | null>(null);

  const currentQuestion = testMode ? TEST_QUESTION : REAL_QUESTIONS[questionIndex];
  const progressPercent = testMode ? 0 : ((questionIndex + 1) / REAL_QUESTIONS.length) * 100;

  const handleSliderMove = useCallback((clientY: number) => {
    const spectrum = spectrumRef.current;
    if (!spectrum) return;
    const bounds = spectrum.getBoundingClientRect();
    let y = clientY - bounds.top;
    y = Math.max(0, Math.min(bounds.height, y));
    let percentage = Math.round(100 - (y / bounds.height) * 100);
    percentage = Math.min(98, Math.max(2, percentage));
    setSliderPosition(percentage);
  }, []);

  useEffect(() => {
    const storedId = localStorage.getItem('patient_id');
    if (storedId) {
      setPatientId(storedId);
    } else {
      const input = window.prompt('Bitte geben Sie Ihre Patienten-ID ein:');
      if (input && input.trim()) {
        const cleaned = input.trim();
        localStorage.setItem('patient_id', cleaned);
        setPatientId(cleaned);
      }
    }

    const handleMouseMove = (e: MouseEvent) => isDragging && handleSliderMove(e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches.length === 1) {
        e.preventDefault();
        handleSliderMove(e.touches[0].clientY);
      }
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleSliderMove]);

  const exportResults = (answers: [string, number][]) => {
    const now = new Date().toISOString().split('T')[0];
    const fileName = `SUBJ_${patientId || 'Unbekannt'}-${VERSION.replace(/\W+/g, '_')}-Date_${now}.csv`;
    const csvRows = ['Frage,Prozent', ...answers.map(([q, a]) => `"${q}",${a}`)];
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

  const exportAndNext = () => {
    if (testMode) {
      setTestMode(false);
      setQuestionIndex(0);
      setSliderPosition(50);
      return;
    }

    const updatedAnswers = [...answers, [REAL_QUESTIONS[questionIndex], sliderPosition]];
    if (questionIndex < REAL_QUESTIONS.length - 1) {
      setAnswers(updatedAnswers);
      setQuestionIndex(questionIndex + 1);
      setSliderPosition(50);
    } else {
      setAnswers(updatedAnswers);
      setShowSummary(true);
    }
  };

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
    <main
      style={{
        height: '100vh',
        padding: '2rem 1rem 3rem 1rem',
        fontFamily: '"Atkinson Hyperlegible", sans-serif',
        backgroundColor: '#f6f4f0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: showSummary ? 'center' : 'flex-start',
        gap: '1.5rem',
        position: 'relative',
      }}
    >
      {showSummary ? (
        <div style={{ textAlign: 'center' }}>
          <h2>Vielen Dank für die Beantwortung der Fragen</h2>
          <button onClick={confirmAndExport} style={{ fontSize: '1.5rem', padding: '1rem 2rem' }}>
            Bestätigen & Exportieren
          </button>
        </div>
      ) : (
        <>
          {/* Progress Bar */}
          <div style={{ width: '100%', height: '10px', background: '#ddd', borderRadius: '4px' }}>
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: '#4caf50',
                borderRadius: '4px',
              }}
            />
          </div>

          {/* Question */}
          <section style={{ maxWidth: '900px', textAlign: 'center' }}>
            <h2>{testMode ? 'Testfrage' : `Frage ${questionIndex + 1}`}</h2>
            <p style={{ fontSize: '1.5rem' }}>{currentQuestion}</p>
          </section>

          {/* Slider UI */}
          <section style={{ textAlign: 'center' }}>
            <div style={{ color: '#80e0c2', fontWeight: 'bold' }}>Sehr gut</div>
            <div style={{ height: '10px', width: '120px', background: '#80e0c2', borderRadius: 20 }} />
            <div
              ref={spectrumRef}
              onClick={(e) => handleSliderMove(e.clientY)}
              style={{
                position: 'relative',
                height: '400px',
                width: '80px',
                margin: '0 auto',
                background: 'linear-gradient(180deg, #80e0c2, #efece7 50%, #c1839d)',
              }}
            >
              <div
                onMouseDown={() => setIsDragging(true)}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                role="slider"
                style={{
                  position: 'absolute',
                  bottom: `${sliderPosition}%`,
                  transform: 'translateY(50%)',
                  width: '140%',
                  height: '20px',
                  backgroundColor: isDragging ? '#000' : '#9d8d71',
                  borderRadius: '10px',
                  opacity: 0.7,
                  cursor: 'grab',
                }}
              />
            </div>
            <div style={{ height: '10px', width: '120px', background: '#c1839d', borderRadius: 20 }} />
            <div style={{ color: '#c1839d', fontWeight: 'bold' }}>Sehr schlecht</div>
          </section>

          <button
            onClick={exportAndNext}
            style={{
              padding: '1rem 3rem',
              fontSize: '1.5rem',
              background: '#9d8d71',
              color: '#fff',
              borderRadius: '10px',
              border: 'none',
            }}
          >
            {testMode ? 'Interview starten' : 'Nächste Frage'}
          </button>
        </>
      )}

      <footer
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '1rem',
          position: 'fixed',
          bottom: 0,
          width: '100%',
          padding: '0.5rem 1.5rem',
          background: '#f6f4f0',
          color: '#707070',
        }}
      >
        <button
          onClick={() => {
            localStorage.removeItem('patient_id');
            window.location.reload();
          }}
          style={{ fontSize: '1rem', color: '#aaa', background: 'none', border: 'none' }}
        >
          ID zurücksetzen
        </button>
        <div>{patientId ? `Teilnehmer:in: ${patientId}` : 'No ID gesetzt'}</div>
        <div>{VERSION}</div>
      </footer>
    </main>
  );
}
