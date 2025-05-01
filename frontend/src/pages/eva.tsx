import { useState, useRef, useEffect } from 'react';

const testQuestion = 'Testlauf Beispiel: Holzhacken';
const realQuestions = [
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

const version = 'Version 7.1, 03.04.2025';

export default function HealthSlider() {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [showSummary, setShowSummary] = useState(false);
  const [testMode, setTestMode] = useState(true);
  const [patientId, setPatientId] = useState('');
  const spectrumRef = useRef(null);

  const handleSliderMove = (clientY) => {
    const spectrum = spectrumRef.current;
    const bounds = spectrum.getBoundingClientRect();
    let y = clientY - bounds.top;
    y = Math.max(0, Math.min(bounds.height, y));
    let percentage = Math.round(100 - (y / bounds.height) * 100);
    percentage = Math.min(98, Math.max(2, percentage));
    setSliderPosition(percentage);
  };

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);

  const handleMouseMove = (e) => {
    if (isDragging) handleSliderMove(e.clientY);
  };

  const handleTouchMove = (e) => {
    if (isDragging && e.touches.length === 1) {
      e.preventDefault();
      handleSliderMove(e.touches[0].clientY);
    }
  };

  useEffect(() => {
    const storedId = localStorage.getItem('patient_id');
    if (storedId) {
      setPatientId(storedId);
    } else {
      const id = window.prompt('Bitte geben Sie Ihre Patienten-ID ein:');
      if (id && id.trim()) {
        const cleaned = id.trim();
        setPatientId(cleaned);
        localStorage.setItem('patient_id', cleaned);
      }
    }

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
  }, [isDragging]);

  const exportResults = (answers) => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const fileName = `SUBJ_${patientId || 'Unbekannt'}-${version.replace(/\W+/g, '_')}-Date_${dateStr}.csv`;

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

    const updatedAnswers = [...answers, [realQuestions[questionIndex], sliderPosition]];
    if (questionIndex < realQuestions.length - 1) {
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
    setQuestionIndex(0);
    setSliderPosition(50);
    setAnswers([]);
    setShowSummary(false);
    setTestMode(true);
    localStorage.removeItem('patient_id');
    window.location.reload();
  };

  const currentQuestion = testMode ? testQuestion : realQuestions[questionIndex];
  const progressPercent = testMode ? 0 : ((questionIndex + 1) / realQuestions.length) * 100;

  return (
    <div
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
          <h2 style={{ fontSize: '2rem' }}>Vielen Dank für die Beantwortung der Fragen</h2>
          <button onClick={confirmAndExport} style={{ padding: '1rem 2rem', fontSize: '1.5rem' }}>
            Bestätigen & Exportieren
          </button>
        </div>
      ) : (
        <>
          {/* Progress */}
          <div
            style={{ width: '100%', backgroundColor: '#ddd', height: '10px', borderRadius: '4px' }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                backgroundColor: '#4caf50',
                borderRadius: '4px',
              }}
            />
          </div>

          {/* Question */}
          <div
            style={{
              maxWidth: '900px',
              width: '100%',
              textAlign: 'center',
              fontSize: '2rem',
              fontWeight: 'bold',
              lineHeight: 1.4,
              marginTop: '1rem',
            }}
          >
            {testMode ? 'Testfrage' : `Frage ${questionIndex + 1}`}
            <div style={{ marginTop: '0.5rem' }}>{currentQuestion}</div>
          </div>

          {/* Slider Section */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div
              style={{ color: '#80e0c2', fontWeight: 'bold', fontSize: 'clamp(1rem, 2vw, 1.3rem)' }}
            >
              Sehr gut
            </div>
            {/* Top Cap */}
            <div
              style={{
                height: '10px',
                width: '120px',
                backgroundColor: '#80e0c2',
                borderRadius: '20px 20px 20px 20px',
              }}
            />

            {/* Spectrum with tap-to-set */}
            <div
              ref={spectrumRef}
              onClick={(e) => handleSliderMove(e.clientY)}
              style={{
                position: 'relative',
                height: '400px',
                width: '80px',
                background: 'linear-gradient(180deg, #80e0c2, #efece7 50%, #c1839d)',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
              }}
            >
              {/* Slider Handle */}
              <div
                onMouseDown={handleMouseDown}
                role="slider"
                onTouchStart={(e) => {
                  e.stopPropagation();
                  setIsDragging(true);
                }}
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

            {/* Bottom Cap */}
            <div
              style={{
                height: '10px',
                width: '120px',
                backgroundColor: '#c1839d',
                borderRadius: '20px 20px 20px 20px',
              }}
            />
            <div
              style={{ color: '#c1839d', fontWeight: 'bold', fontSize: 'clamp(1rem, 2vw, 1.3rem)' }}
            >
              Sehr schlecht
            </div>
            {/* Next Button */}
          </div>
          <button
            onClick={exportAndNext}
            style={{
              padding: '1.2rem 3rem',
              fontSize: '1.6rem',
              backgroundColor: '#9d8d71',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
            }}
          >
            {testMode ? 'Interview starten' : 'Nächste Frage'}
          </button>
        </>
      )}

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          fontSize: '1rem',
          color: '#707070',
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '0.5rem 1.5rem',
          background: '#f6f4f0', // optional for contrast
          zIndex: 10,
        }}
      >
        <button
          onClick={() => {
            localStorage.removeItem('patient_id');
            window.location.reload();
          }}
          style={{
            fontSize: '1rem',
            color: '#aaa',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          ID zurücksetzen
        </button>

        <div>{patientId ? `Teilnehmer:in: ${patientId}` : 'No ID gesetzt'}</div>

        <div>{version}</div>
      </div>
    </div>
  );
}
