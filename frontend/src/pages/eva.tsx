import { useState, useRef, useEffect } from 'react';

const testQuestion = 'Testlauf Beispiel: Holzhacken';
const realQuestions = [
  'Allgemeine Gesundheit',
  'Essen und Trinken',
  'Körperpflege, Waschen, Anziehen',
  'Toilettennutzung, Blasen- und Darmmanagement',
  'Muskelfunktion und -kraft',
  'Beweglichkeit, Gelenke und Knochen',
  'Liegen, Sitzen, Aufstehen, Gehen',
  'Fortbewegung mit Verkehrsmitteln',
  'Herzfunktion, Atmung, Belastbarkeit',
  'Kommunikation und Verstehen',
  'Soziale Kontakte, Familie, Freunde',
  'Sexualleben',
  'Schlaf',
  'Problemlösen und Wissen anwenden',
  'Gedächtnis und Denken',
  'Umgang mit Emotionen',
  'Antrieb und Energie',
  'Schmerz',
  'Aufgaben im Alltag, Beruf, Freizeit',
  'Professionelle Unterstützung',
  'Anderen helfen',
  'Medikamentenverwendung',
  'Hilfsmittel und Technologien',
  'Gesundheitsversorgung',
  'Zugang zu Gebäuden',
  'Umwelteinflüsse',
  'Gesundheitsbewusstsein',
];

export default function HealthSlider() {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [showSummary, setShowSummary] = useState(false);
  const [testMode, setTestMode] = useState(true);
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
    if (e.touches.length === 1) {
      e.preventDefault();
      handleSliderMove(e.touches[0].clientY);
    }
  };

  useEffect(() => {
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
    const timestamp = now.toISOString().replace(/[:.-]/g, '_');
    const csvRows = ['Frage,Prozent', ...answers.map(([q, a]) => `"${q}",${a}`)];
    const csvContent = `data:text/csv;charset=utf-8,${csvRows.join('\n')}`;
    const encodedUri = encodeURI(csvContent);
    const newTab = window.open();
    if (newTab) {
      newTab.document.body.innerHTML = `<a href="${encodedUri}" download="fragebogen_export_${timestamp}.csv">Download</a>
        <script>document.querySelector('a').click();</script>`;
    } else {
      alert('Bitte erlauben Sie Popups für diese Seite, um den Download zu ermöglichen.');
    }
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
  };

  const currentQuestion = testMode ? testQuestion : realQuestions[questionIndex];

  return (
    <div style={{
      height: '100vh',
      padding: '3rem 2rem',
      fontFamily: '"Atkinson Hyperlegible", sans-serif',
      backgroundColor: '#f6f4f0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: showSummary ? 'center' : 'space-between',
      gap: '2rem'
    }}>
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
          <div style={{ width: '100%', backgroundColor: '#ddd', height: '10px', borderRadius: '4px' }}>
            <div
              style={{
                width: `${testMode ? 0 : ((questionIndex + 1) / realQuestions.length) * 100}%`,
                height: '100%',
                backgroundColor: '#4caf50',
                borderRadius: '4px'
              }}
            />
          </div>

          {/* Question */}
          <div style={{ maxWidth: '900px', textAlign: 'center', fontSize: '2.2rem', fontWeight: 'bold', lineHeight: 1.4 }}>
            {testMode ? 'Testfrage' : `Frage ${questionIndex + 1}`}<br />
            <span style={{ display: 'inline-block', marginTop: '1rem' }}>{currentQuestion}</span>
          </div>

          {/* Slider Section */}
          {/* Spectrum container with top & bottom caps */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Top Cap */}
            <div style={{
              height: '10px',
              width: '120px',
              backgroundColor: '#80e0c2',
              borderRadius: '20px 20px 20px 20px'
            }} />

            {/* Gradient Bar */}
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
                justifyContent: 'center'
              }}
            >
              {/* Slider Handle */}
              <div
                onMouseDown={handleMouseDown}
                onTouchStart={() => setIsDragging(true)}
                style={{
                  position: 'absolute',
                  bottom: `${sliderPosition}%`,
                  transform: 'translateY(50%)',
                  width: '140%',
                  height: '20px',
                  opacity: '65%',
                  backgroundColor: isDragging ? '#000' : '#9d8d71',
                  borderRadius: '10px',
                  cursor: 'grab'
                }}
              />
            </div>

            {/* Bottom Cap */}
            <div style={{
              height: '10px',
              width: '120px',
              backgroundColor: '#c1839d',
              borderRadius: '20px 20px 20px 20px'
            }} />
          </div>


          {/* Next Button */}
          <button
            onClick={exportAndNext}
            style={{
              padding: '1.2rem 3rem',
              fontSize: '1.6rem',
              backgroundColor: '#9d8d71',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer'
            }}
          >
            {testMode ? 'Interview starten' : 'Nächste Frage'}
          </button>
        </>
      )}
    </div>
  );
}
