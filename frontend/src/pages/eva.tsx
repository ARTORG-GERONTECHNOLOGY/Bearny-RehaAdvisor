import { useState, useRef, useEffect } from 'react';

const questions = [
  'Allgemeine Gesundheit',
  'Körperliche Aktivität',
  'Schlafqualität',
  'Stresslevel',
  'Emotionale Verfassung'
];

export default function HealthSlider() {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [showSummary, setShowSummary] = useState(false);
  const spectrumRef = useRef(null);

  const handleSliderMove = (clientY) => {
    const spectrum = spectrumRef.current;
    const bounds = spectrum.getBoundingClientRect();
    let y = clientY - bounds.top;
    y = Math.max(0, Math.min(bounds.height, y));
    const percentage = Math.round(100 - (y / bounds.height) * 100);
    setSliderPosition(percentage);
  };

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);
  const handleMouseMove = (e) => {
    if (isDragging) {
      handleSliderMove(e.clientY);
    }
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
  });

  const exportResults = (answers) => {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.-]/g, '_');
    const csvRows = ['Frage,Prozent', ...answers.map(([q, a]) => `"${q}",${a}`)];
    const csvContent = `data:text/csv;charset=utf-8,${csvRows.join('\n')}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `fragebogen_export_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportAndNext = () => {
    const updatedAnswers = [...answers, [questions[questionIndex], sliderPosition]];
    if (questionIndex < questions.length - 1) {
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
  };

  const isSmallScreen = window.innerWidth < 900;
  const fontSizeLarge = isSmallScreen ? '5vw' : '3vw';
  const fontSizeMedium = isSmallScreen ? '4vw' : '2vw';
  const fontSizeSmall = isSmallScreen ? '3vw' : '1.5vw';
  const barWidth = isSmallScreen ? '15%' : '10%';
  const buttonFontSize = isSmallScreen ? '3vw' : '1.5vw';
  const progressPercent = Math.round(((questionIndex) / questions.length) * 100);
  const slider = isSmallScreen ? '20%' : '15%';
  const ends =  isSmallScreen ? '17%' : '12%';

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100vh', backgroundColor: '#f6f4f0', fontFamily: 'Inter, sans-serif', overflow: 'hidden', touchAction: 'none', transition: 'all 0.5s ease-in-out' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
    >
      {showSummary ? (
        <div style={{ padding: '5%', textAlign: 'center' }}>
          {/*<h2>Zusammenfassung</h2>
          <ul style={{ listStyle: 'none', padding: 0, fontSize: fontSizeMedium }}>
            {answers.map(([q, a], idx) => (
              <li key={idx} style={{ marginBottom: '1em' }}><strong>{q}:</strong> {a}%</li>
            ))}
          </ul>*/}
          <h2>Vielen Dank für die Beantwortung der Fragen</h2>
          <button onClick={confirmAndExport} style={{ padding: '1rem 2rem', fontSize: buttonFontSize }}>Bestätigen & Exportieren</button>
        </div>
      ) : (
        <>
          {/* Progress Bar */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '8px', backgroundColor: '#ddd' }}>
            <div style={{ width: `${progressPercent}%`, height: '100%', backgroundColor: '#4caf50', transition: 'width 0.3s ease' }} />
          </div>

          <div
            style={{ position: 'absolute', top: '25%', left: '50%', transform: 'translateX(-50%)', width: barWidth, height: '50%', background: 'linear-gradient(180deg, #80e0c2, #efece7 50%, #c1839d)' }}
            ref={spectrumRef}
            onClick={(e) => handleSliderMove(e.clientY)}
          />

          <div style={{ position: 'absolute', top: '75%', left: '50%', transform: 'translateX(-50%)', width: `${ends}`, borderTop: '6px solid #c1839d', borderRadius: '5px' }} />
          <div style={{ position: 'absolute', top: '25%', left: '50%', transform: 'translateX(-50%)', width: `${ends}`, borderBottom: '6px solid #80e0c2', borderRadius: '5px' }} />

          <div
            style={{
              position: 'absolute',
              top: `calc(25% + ${(100 - sliderPosition) * 0.5}%)`,
              left: '50%',
              opacity: '50%',
              transform: 'translateX(-50%)',
              width: `${slider}`,
              height: '2%',
              backgroundColor: isDragging ? '#000' : '#a6a394',
              borderRadius: '10px',
              cursor: 'grab',
              transition: 'background-color 0.3s ease'
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={() => setIsDragging(true)}
          />

          <div style={{ position: 'absolute', top: '5%', left: '5%', fontSize: fontSizeLarge, fontWeight: 'bold' }}>{questionIndex + 1}</div>
          <div style={{ position: 'absolute', top: '5%', left: '12%', fontSize: fontSizeLarge, fontWeight: 'bold' }}>{questions[questionIndex]}</div>

          <div style={{ position: 'absolute', top: '24%', left: 'calc(50% - 22%)', fontSize: fontSizeSmall, color: '#80e0c2', fontWeight: 'bold' }}>Sehr gut</div>
          <div style={{ position: 'absolute', top: '76%', left: 'calc(50% - 22%)', fontSize: fontSizeSmall, color: '#c1839d', fontWeight: 'bold' }}>Sehr schlecht</div>

          <div style={{ position: 'absolute', bottom: '2%', right: '2%', fontSize: '0.8vw', color: '#707070' }}>Version 7.1, 03.04.2025</div>
          {/*<div style={{ position: 'absolute', top: '50%', right: '5%', fontSize: fontSizeMedium, color: '#333', fontWeight: 'bold' }}>{sliderPosition}%</div>*/}

          <button
            onClick={exportAndNext}
            style={{
              position: 'absolute',
              bottom: '5%',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: isSmallScreen ? '1.5rem 3rem' : '1rem 2rem',
              fontSize: buttonFontSize,
              backgroundColor: '#333',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
            Nächste Frage
          </button>
        </>
      )}
    </div>
  );
}
