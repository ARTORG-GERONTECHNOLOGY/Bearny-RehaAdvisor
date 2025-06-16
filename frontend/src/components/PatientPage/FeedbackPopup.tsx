import React, { useState, useRef, useEffect } from 'react';
import { Modal, Button, ProgressBar, Form, Row, Col, Alert } from 'react-bootstrap';
import { FaMicrophone, FaKeyboard, FaStop, FaTrash, FaUpload } from 'react-icons/fa';
import apiClient from '../../api/client';
import { useTranslation } from 'react-i18next';
import ErrorAlert from '../common/ErrorAlert';
import ReactPlayer from 'react-player';

const MAX_VIDEO_SIZE = 500 * 1024 * 1024;

const FeedbackPopup = ({ show, interventionId, questions, onClose }) => {
  const { t } = useTranslation();
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
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(null);

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
    setAnswers({ ...answers, [currentQuestion.questionKey]: e.target.value });
  };

  const handleOptionSelect = (option, field, multiple = false) => {
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

  const startRecording = async () => {
    try {
      const permission = await navigator.permissions.query({ name: 'microphone' });
      if (permission.state === 'denied') {
        setMicPermissionDenied(true);
        return;
      }
    } catch {}

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunks.current = [];

      mediaRecorder.ondataavailable = (event) => audioChunks.current.push(event.data);

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        setAudioURL(URL.createObjectURL(audioBlob));
        setAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: audioBlob }));
        setRecordingTime(0);
        clearInterval(timerRef.current);
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordingTime(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
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

  const startVideoRecording = async () => {
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    previewRef.current.srcObject = stream;

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
            setError(t('Video is too large (max 50MB)'));
            return;
          }
          setVideoURL(URL.createObjectURL(videoBlob));
          setAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: videoBlob }));
        };

        recorder.start();
        setRecording(true);
        setCountdown(null);
      }
    }, 1000);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_VIDEO_SIZE) {
      setError(t('File too large (max 50MB)'));
      return;
    }
    setVideoURL(URL.createObjectURL(file));
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
      formData.append("userId", userId);
      formData.append("interventionId", interventionId);
      questions.forEach((q) => {
        const key = q.questionKey;
        const answer = answers[key];
        if (answer instanceof Blob) {
          const isVideo = answer.type?.startsWith('video/');
          const extension = isVideo ? 'webm' : 'wav';
          const fieldName = isVideo ? `${key}_video` : key;
          formData.append(fieldName, answer, `${key}.${extension}`);
        } else if (typeof answer === 'string' || typeof answer === 'number') {
          formData.append(key, answer.toString());
        } else if (Array.isArray(answer)) {
          formData.append(key, JSON.stringify(answer));
        } else {
          formData.append(key, '');
        }
      });

      await apiClient.post("/patients/feedback/questionaire/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      onClose();
    } catch (err) {
      console.error("Error submitting feedback:", err);
      setError(err.message || 'Error submitting feedback. Please try again.');
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{t('Feedback')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* ...UI code unchanged... */}
      </Modal.Body>
      <Modal.Footer>
        {/* ...footer buttons unchanged... */}
      </Modal.Footer>
    </Modal>
  );
};

export default FeedbackPopup;
