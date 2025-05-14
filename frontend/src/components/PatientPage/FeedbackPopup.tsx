import React, { useState, useRef, useEffect } from 'react';
import { Modal, Button, ProgressBar, Form, Row, Col, Alert } from 'react-bootstrap';
import { FaMicrophone, FaKeyboard, FaStop, FaTrash } from 'react-icons/fa';
import apiClient from '../../api/client';
import { useTranslation } from 'react-i18next';
const FeedbackPopup = ({ show, interventionId, questions, onClose }) => {
  const { t, i18n } = useTranslation();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [inputMode, setInputMode] = useState('text');
  const [recording, setRecording] = useState(false);
  const [audioURL, setAudioURL] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunks = useRef([]);
  const currentQuestion = questions[currentQuestionIndex];
  const [recordingTime, setRecordingTime] = useState(0);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const timerRef = useRef(null);
  const userId = localStorage.getItem('id');

  useEffect(() => {
    if (!show) {
      setAnswers({});
      setAudioURL(null);
      setRecordingTime(0);
      setMicPermissionDenied(false);
      setCurrentQuestionIndex(0);
    }
  }, [show]);

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setMicPermissionDenied(false);
    }
  };

  const handleBack = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleAnswerChange = (e) => {
    setAnswers({
      ...answers,
      [questions[currentQuestionIndex].questionKey]: e.target.value,
    });
  };

  const handleOptionSelect = (option, field, multiple = false) => {
    console.log(answers);
    setAnswers((prev) => {
      let newValues = multiple ? [...(prev[field] || [])] : [];
      if (multiple) {
        if (newValues.includes(option)) {
          newValues = newValues.filter((item) => item !== option);
        } else {
          newValues.push(option);
        }
      } else {
        newValues = [option];
      }
      return { ...prev, [field]: newValues };
    });
  };

  const requestMicrophonePermission = async () => {
    try {
      const permission = await navigator.permissions.query({ name: 'microphone' });
      if (permission.state === 'denied') {
        setMicPermissionDenied(true);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error checking microphone permissions', error);
      return false;
    }
  };

  const startRecording = async () => {
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunks.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.current.push(event.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop()); // <-- Stops the microphone
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
        const audioURL = URL.createObjectURL(audioBlob);
        setAudioURL(audioURL);
        setAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: audioBlob }));
        setRecordingTime(0);
        clearInterval(timerRef.current);
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordingTime(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (typeof setRecordingTime === 'function') {
        timerRef.current = setInterval(() => {
          setRecordingTime((prevTime) => prevTime + 1);
        }, 1000);
      }
    } catch (error) {
      console.error('Error accessing microphone', error);
      setMicPermissionDenied(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const deleteRecording = () => {
    setAudioURL(null);
    setRecordingTime(0);
    setAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: null }));
  };

  const handleSubmit = async () => {
    try {
      const formData = new FormData();
  
      // 1) required IDs
      formData.append("userId", userId);
      formData.append("interventionId", interventionId);
  
      // 2) loop over your questions…
      questions.forEach((q) => {
        const key = q.questionKey;
        const answer = answers[key];
  
        if (answer instanceof Blob) {
          // an audio recording
          formData.append(key, answer, `${key}.wav`);
        } else {
          // plain‐text answer
          formData.append(key, answer || "");
        }
      });
  
      // 3) POST as multipart/form-data
      await apiClient.post(
        "/patients/feedback/questionaire/",
        formData,
        {
          headers: {
            // let axios set the boundary for you
            "Content-Type": "multipart/form-data",
          },
        }
      );
  
      onClose();
    } catch (err) {
      console.error("Error submitting feedback:", err);
    }
  };
  
  

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{t('Feedback')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <ProgressBar
          now={((currentQuestionIndex + 1) / questions.length) * 100}
          label={`${currentQuestionIndex + 1}/${questions.length}`}
          className="mb-3 text-center"
        />
        {micPermissionDenied && (
          <Alert variant="danger" className="text-center" data-testid="microphone-alert">
            {t('Microphone access is denied. Please enable it in your browser settings.')}
          </Alert>
        )}

        <h5 className="text-center mb-4">{currentQuestion.label}</h5>
        <Row className="justify-content-center">
          <Col md={10}>
            {currentQuestion.type === 'multi-select' && (
              <div className="d-flex flex-wrap gap-2 justify-content-center">
                {(currentQuestion.type === 'multi-select' ||
                  currentQuestion.type === 'dropdown') && (
                  <div className="d-flex flex-wrap gap-2 justify-content-center">
                    {currentQuestion.options.map((option, index) => {
                      const language = localStorage.getItem('language') || 'en';
                      const label =
                        option.translations?.find((t) => t.language === language)?.text ||
                        option.translations?.find((t) => t.language === 'en')?.text ||
                        option.key;

                      return (
                        <Button
                          key={index}
                          variant={
                            answers[currentQuestion.questionKey]?.includes(option.key)
                              ? 'primary'
                              : 'outline-primary'
                          }
                          onClick={() =>
                            handleOptionSelect(option.key, currentQuestion.questionKey, true)
                          }
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {currentQuestion.type === 'dropdown' && (
              <div className="d-flex flex-wrap gap-2 justify-content-center">
                {(currentQuestion.type === 'multi-select' ||
                  currentQuestion.type === 'dropdown') && (
                  <div className="d-flex flex-wrap gap-2 justify-content-center">
                    {currentQuestion.options.map((option, index) => {
                      const language = localStorage.getItem('language') || 'en';
                      const label =
                        option.translations?.find((t) => t.language === language)?.text ||
                        option.translations?.find((t) => t.language === 'en')?.text ||
                        option.key;

                      return (
                        <Button
                          key={index}
                          variant={
                            answers[currentQuestion.questionKey]?.includes(option.key)
                              ? 'primary'
                              : 'outline-primary'
                          }
                          onClick={() =>
                            handleOptionSelect(option.key, currentQuestion.questionKey, false)
                          }
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {currentQuestion.type === 'text' && (
              <>
                <div className="d-flex justify-content-center mb-3">
                  <Button variant="primary" onClick={() => setInputMode('text')} aria-label="Type">
                    <FaKeyboard /> {t('Type')}
                  </Button>

                  <Button
                    variant="outline-primary"
                    onClick={() => setInputMode('audio')}
                    aria-label="Record"
                  >
                    <FaMicrophone /> {t('Record')}
                  </Button>
                </div>
                {inputMode === 'text' && (
                  <Form.Control
                    as="textarea"
                    rows={4}
                    aria-label="Text Area"
                    id={currentQuestion.questionKey}
                    placeholder={t('Type your response')}
                    className="mb-3"
                    value={answers[questions[currentQuestionIndex].questionKey] || ''}
                    onChange={handleAnswerChange}
                  />
                )}
                {inputMode === 'audio' && (
                  <div className="d-flex flex-column align-items-center">
                    {recording ? (
                      <Button variant="danger" aria-label="Stop" onClick={stopRecording}>
                        <FaStop /> {t('Stop')} ({recordingTime}s)
                      </Button>
                    ) : (
                      <Button variant="primary" aria-label="Start Record" onClick={startRecording}>
                        <FaMicrophone /> {t('Start Recording')}
                      </Button>
                    )}
                    {audioURL && (
                      <div className="mt-3">
                        <audio controls src={audioURL}></audio>
                        <Button
                          variant="warning"
                          aria-label="Delete"
                          onClick={deleteRecording}
                          className="ms-2"
                        >
                          <FaTrash /> {t('Delete')}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer className="d-flex justify-content-between">
        {currentQuestionIndex > 0 && (
          <Button variant="secondary" onClick={handleBack} aria-label="Back">
            {t('Back')}
          </Button>
        )}
        {currentQuestionIndex + 1 < questions.length ? (
          <Button variant="primary" onClick={handleNext} aria-label="Next">
            {t('Next')}
          </Button>
        ) : (
          <Button variant="success" onClick={handleSubmit} aria-label="Submit">
            {t('Submit')}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default FeedbackPopup;
