import React, { useState, useRef, useEffect } from 'react';
import { Modal, Button, ProgressBar, Form, Row, Col, Alert } from 'react-bootstrap';
import { FaMicrophone, FaKeyboard, FaStop, FaTrash } from 'react-icons/fa';
import apiClient from '../../api/client';
import { useTranslation } from 'react-i18next';
import ErrorAlert from '../common/ErrorAlert';
import ReactPlayer from 'react-player';
import { FaUpload } from 'react-icons/fa';

const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

const FeedbackPopup = ({ show, interventionId, questions, onClose }) => {
  const { t, i18n } = useTranslation();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [inputMode, setInputMode] = useState('text');
  const [recording, setRecording] = useState(false);
  const [audioURL, setAudioURL] = useState(null);
  const [videoURL, setVideoURL] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunks = useRef([]);
  const currentQuestion = questions[currentQuestionIndex];
  const [recordingTime, setRecordingTime] = useState(0);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const videoChunks = useRef([]);
  const previewRef = useRef(null);
  const timerRef = useRef(null);
  const userId = localStorage.getItem('id');
  const [error, setError] = useState<string | null>(null);
  // INSIDE COMPONENT STATE
  const [countdown, setCountdown] = useState<number | null>(null);
  const [uploadVideoFile, setUploadVideoFile] = useState(null);

  useEffect(() => {
    if (!show) {
      setAnswers({});
      setAudioURL(null);
      setRecordingTime(0);
      setVideoURL(null);
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

  // COUNTDOWN + VIDEO RECORDING
  const startVideoRecording = async () => {
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    previewRef.current.srcObject = stream;

    // Countdown
    let sec = 10;
    setCountdown(sec);
    const interval = setInterval(() => {
      sec--;
      setCountdown(sec);
      if (sec === 0) {
        clearInterval(interval);
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        videoChunks.current = [];
        recorder.ondataavailable = (event) => videoChunks.current.push(event.data);
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          const videoBlob = new Blob(videoChunks.current, { type: 'video/webm' });
          if (videoBlob.size > MAX_VIDEO_SIZE) {
            setError(t('Video too large (max 50MB)'));
            return;
          }
          const url = URL.createObjectURL(videoBlob);
          setVideoURL(url);
          setAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: videoBlob }));
        };
        recorder.start();
        setRecording(true);
        setCountdown(null);
      }
    }, 1000);
  };

  // VIDEO UPLOAD
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_VIDEO_SIZE) {
      setError(t('Video too large (max 50MB)'));
      return;
    }
    const url = URL.createObjectURL(file);
    setUploadVideoFile(file);
    setVideoURL(url);
    setAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: file }));
  };

  const stopVideoRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const deleteVideo = () => {
    setVideoURL(null);
    setAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: null }));
  };

  const handleSubmit = async () => {
    try {
      const formData = new FormData();

      // Required IDs
      formData.append('userId', userId);
      formData.append('interventionId', interventionId);

      questions.forEach((q) => {
        const key = q.questionKey;
        const answer = answers[key];

        if (answer instanceof Blob) {
          const isVideo = answer.type?.startsWith('video/') ?? false;
          const extension = isVideo ? 'webm' : 'wav';
          const fieldName = isVideo ? `${key}_video` : key;

          formData.append(fieldName, answer, `${key}.${extension}`);
        } else if (typeof answer === 'string' || typeof answer === 'number') {
          formData.append(key, answer.toString());
        } else if (Array.isArray(answer)) {
          // Multi-select answers are stringified
          formData.append(key, JSON.stringify(answer));
        } else {
          // Fallback for undefined or null
          formData.append(key, '');
        }
      });

      // Submit form
      await apiClient.post('/patients/feedback/questionaire/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      onClose();
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError(err.message || 'Error submitting feedback. Please try again.');
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
            {currentQuestion.type === 'video' && (
              <div className="d-flex flex-column align-items-center">
                {videoURL ? (
                  <>
                    <ReactPlayer
                      url={videoURL}
                      controls
                      width="100%"
                      height="300px"
                      className="mb-3"
                    />
                    <Button variant="warning" onClick={deleteVideo} className="mb-3">
                      <FaTrash className="me-1" /> {t('Delete')}
                    </Button>
                  </>
                ) : (
                  <>
                    {/* Live preview */}
                    <video
                      ref={previewRef}
                      autoPlay
                      muted
                      style={{ width: '100%', maxHeight: 200, background: '#000' }}
                    />

                    {/* Countdown */}
                    {countdown !== null && (
                      <div className="my-2 text-center fs-5">
                        {t('Starting in')} {countdown}s...
                      </div>
                    )}

                    {/* Buttons: only shown if not recording */}
                    {!recording && countdown === null && (
                      <>
                        <div className="d-flex gap-2 mt-2">
                          <Button onClick={startVideoRecording}>{t('Record Video')}</Button>
                          <Form.Label className="btn btn-outline-secondary mb-0">
                            <FaUpload className="me-1" />
                            {t('Upload')}
                            <Form.Control
                              type="file"
                              accept="video/*"
                              onChange={handleUpload}
                              hidden
                            />
                          </Form.Label>
                        </div>

                        {/* Message row */}
                        <div className="mt-2 text-center small text-muted">
                          <div>{t('This will start a 10-second countdown before recording.')}</div>
                          <div>
                            {t('This video will be destroyed after 14 days automatically.')}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Stop button shown only during recording */}
                    {recording && (
                      <Button variant="danger" onClick={stopVideoRecording} className="mt-2">
                        {t('Stop Recording')}
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer className="d-flex justify-content-between align-items-center">
        <div>
          {currentQuestionIndex > 0 && (
            <Button variant="secondary" onClick={handleBack} aria-label="Back">
              {t('Back')}
            </Button>
          )}
        </div>

        <div>
          {currentQuestionIndex + 1 < questions.length ? (
            <Button variant="primary" onClick={handleNext} aria-label="Next">
              {t('Next')}
            </Button>
          ) : (
            <Button variant="success" onClick={handleSubmit} aria-label="Submit">
              {t('Submit')}
            </Button>
          )}
        </div>

        {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
      </Modal.Footer>
    </Modal>
  );
};

export default FeedbackPopup;
