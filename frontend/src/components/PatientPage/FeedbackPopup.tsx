// src/components/patient/FeedbackPopup.tsx

import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  Button,
  ProgressBar,
  Form,
  Row,
  Col,
  Alert,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap';
import {
  FaMicrophone,
  FaKeyboard,
  FaStop,
  FaTrash,
  FaUpload,
} from 'react-icons/fa';
import ReactPlayer from 'react-player';
import apiClient from '../../api/client';
import { useTranslation } from 'react-i18next';
import ErrorAlert from '../common/ErrorAlert';

const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

const FeedbackPopup = ({ show, interventionId, questions, onClose }) => {
  const { t, i18n } = useTranslation();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [inputMode, setInputMode] = useState('text');
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioURL, setAudioURL] = useState(null);
  const [videoURL, setVideoURL] = useState(null);
  const [uploadVideoFile, setUploadVideoFile] = useState(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunks = useRef([]);
  const videoChunks = useRef([]);
  const previewRef = useRef(null);
  const timerRef = useRef(null);
  const userId = localStorage.getItem('id');

  const currentQuestion = questions[currentQuestionIndex];

  useEffect(() => {
    if (!show) {
      resetAll();
    }
  }, [show]);

  const resetAll = () => {
    setCurrentQuestionIndex(0);
    setAnswers({});
    setAudioURL(null);
    setVideoURL(null);
    setUploadVideoFile(null);
    setRecording(false);
    setRecordingTime(0);
    setCountdown(null);
    setMicPermissionDenied(false);
    setInputMode('text');
    clearInterval(timerRef.current);
  };

  const handleChangeText = (e) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.questionKey]: e.target.value,
    }));
  };

  const handleOptionSelect = (optionKey, fieldKey, multiple = false) => {
    setAnswers((prev) => {
      if (multiple) {
        const current = prev[fieldKey] || [];
        const newArray = current.includes(optionKey)
          ? current.filter((item) => item !== optionKey)
          : [...current, optionKey];
        return { ...prev, [fieldKey]: newArray };
      }
      return { ...prev, [fieldKey]: [optionKey] };
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
    } catch {
      return true;
    }
  };

  const startRecording = async () => {
    if (!(await requestMicrophonePermission())) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    audioChunks.current = [];

    recorder.ondataavailable = (e) => audioChunks.current.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(audioChunks.current, { type: 'audio/wav' });
      setAudioURL(URL.createObjectURL(blob));
      setAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: blob }));
      setRecording(false);
      clearInterval(timerRef.current);
    };

    recorder.start();
    setRecording(true);
    timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const deleteAudio = () => {
    setAudioURL(null);
    setRecordingTime(0);
    setAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: null }));
  };

  const startVideoRecording = async () => {
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    previewRef.current.srcObject = stream;
    setCountdown(10);
    let sec = 10;
    const interval = setInterval(() => {
      sec--;
      setCountdown(sec);
      if (sec === 0) {
        clearInterval(interval);
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        videoChunks.current = [];
        recorder.ondataavailable = (e) => videoChunks.current.push(e.data);
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          const blob = new Blob(videoChunks.current, { type: 'video/webm' });
          if (blob.size > MAX_VIDEO_SIZE) {
            setError(t('Video too large (max 50MB)'));
            return;
          }
          setVideoURL(URL.createObjectURL(blob));
          setAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: blob }));
        };
        recorder.start();
        setRecording(true);
        setCountdown(null);
      }
    }, 1000);
  };

  const stopVideoRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const deleteVideo = () => {
    setVideoURL(null);
    setAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: null }));
  };

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_VIDEO_SIZE) {
      setError(t('Video too large (max 50MB)'));
      return;
    }
    setVideoURL(URL.createObjectURL(file));
    setUploadVideoFile(file);
    setAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: file }));
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('userId', userId);
      formData.append('interventionId', interventionId);

      questions.forEach((q) => {
        const key = q.questionKey;
        const answer = answers[key];
        if (answer instanceof Blob) {
          const isVideo = answer.type?.startsWith('video/');
          formData.append(isVideo ? `${key}_video` : key, answer, `${key}.${isVideo ? 'webm' : 'wav'}`);
        } else if (typeof answer === 'string' || typeof answer === 'number') {
          formData.append(key, answer.toString());
        } else if (Array.isArray(answer)) {
          formData.append(key, JSON.stringify(answer));
        }
      });

      await apiClient.post('/patients/feedback/questionaire/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      onClose();
    } catch (err) {
      setError(t('Error submitting feedback. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmClose = () => {
    const hasUnanswered = Object.values(answers).some((a) => a);
    if (hasUnanswered && !window.confirm(t('Are you sure you want to close? Unsaved data will be lost.')))
      return;
    onClose();
  };

  const renderOptions = (multiple = false) => {
    const selected = answers[currentQuestion.questionKey] || [];
    return (
      <div className="d-flex flex-wrap gap-2 justify-content-center">
        {currentQuestion.options.map((opt, i) => {
          const lang = localStorage.getItem('language') || 'en';
          const label =
            opt.translations?.find((t) => t.language === lang)?.text ||
            opt.translations?.find((t) => t.language === 'en')?.text ||
            opt.key;
          return (
            <Button
              key={i}
              variant={selected.includes(opt.key) ? 'primary' : 'outline-primary'}
              onClick={() => {
              handleOptionSelect(opt.key, currentQuestion.questionKey, multiple);
              setCurrentQuestionIndex((i) => i + 1);
              }}
              aria-label={label}
              title={label}
            >
              {label}
            </Button>
          );
        })}
      </div>
    );
  };

  return (
    <Modal show={show} onHide={confirmClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{t('Feedback')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <ProgressBar
          now={((currentQuestionIndex + 1) / questions.length) * 100}
          label={`${currentQuestionIndex + 1}/${questions.length}`}
        />
        {micPermissionDenied && (
          <Alert variant="danger">{t('Microphone access denied.')}</Alert>
        )}
        <h5 className="text-center my-3">{currentQuestion.label}</h5>
        <Row className="justify-content-center">
          <Col md={10}>
            {['dropdown', 'multi-select'].includes(currentQuestion.type) &&
              renderOptions(currentQuestion.type === 'multi-select')}

            {currentQuestion.type === 'text' && (
              <>
                <div className="d-flex justify-content-center gap-2 mb-3">
                  <OverlayTrigger overlay={<Tooltip>{t('Text mode')}</Tooltip>}>
                    <Button
                      variant={inputMode === 'text' ? 'primary' : 'outline-primary'}
                      onClick={() => setInputMode('text')}
                    >
                      <FaKeyboard /> {t('Type')}
                    </Button>
                  </OverlayTrigger>
                  <OverlayTrigger overlay={<Tooltip>{t('Audio mode')}</Tooltip>}>
                    <Button
                      variant={inputMode === 'audio' ? 'primary' : 'outline-primary'}
                      onClick={() => setInputMode('audio')}
                    >
                      <FaMicrophone /> {t('Record')}
                    </Button>
                  </OverlayTrigger>
                </div>
                {inputMode === 'text' ? (
                  <Form.Control
                    as="textarea"
                    rows={4}
                    aria-label="Text Feedback"
                    value={answers[currentQuestion.questionKey] || ''}
                    onChange={handleChangeText}
                  />
                ) : (
                  <div className="d-flex flex-column align-items-center">
                    {recording ? (
                      <Button variant="danger" onClick={stopRecording}>
                        <FaStop /> {t('Stop')} ({recordingTime}s)
                      </Button>
                    ) : (
                      <Button onClick={startRecording}>
                        <FaMicrophone /> {t('Start Recording')}
                      </Button>
                    )}
                    {audioURL && (
                      <div className="mt-3">
                        <audio controls src={audioURL} />
                        <Button variant="warning" onClick={deleteAudio} className="ms-2">
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
                    <ReactPlayer url={videoURL} controls width="100%" height="240px" />
                    <Button variant="warning" onClick={deleteVideo} className="mt-2">
                      <FaTrash /> {t('Delete')}
                    </Button>
                  </>
                ) : (
                  <>
                    <video
                      ref={previewRef}
                      autoPlay
                      muted
                      style={{ width: '100%', height: 200, backgroundColor: '#000' }}
                    />
                    {countdown !== null ? (
                      <div className="my-2 text-center fs-5">{t('Starting in')} {countdown}s...</div>
                    ) : (
                      <div className="d-flex gap-2 mt-2">
                        <Button onClick={startVideoRecording}>{t('Record Video')}</Button>
                        <Form.Label className="btn btn-outline-secondary mb-0">
                          <FaUpload className="me-1" /> {t('Upload')}
                          <Form.Control type="file" accept="video/*" hidden onChange={handleUpload} />
                        </Form.Label>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </Col>
        </Row>
        {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
      </Modal.Body>
      <Modal.Footer>
        {currentQuestionIndex > 0 && (
          <Button variant="secondary" onClick={() => setCurrentQuestionIndex((i) => i - 1)}>
            {t('Back')}
          </Button>
        )}
        {currentQuestionIndex + 1 < questions.length ? (
          <Button variant="primary" onClick={() => setCurrentQuestionIndex((i) => i + 1)}>
            {t('Next')}
          </Button>
        ) : (
          <Button variant="success" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('Submitting...') : t('Submit')}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default FeedbackPopup;
