import React, { useState, useRef, useEffect } from "react";
import { Modal, Button, ProgressBar, Form, Row, Col, Alert } from "react-bootstrap";
import { FaMicrophone, FaKeyboard, FaStop, FaTrash } from "react-icons/fa";
import apiClient from "../api/client";
import { t } from 'i18next';

const FeedbackPopup = ({ show, interventionId, questions, onClose }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [inputMode, setInputMode] = useState("text");
  const [recording, setRecording] = useState(false);
  const [audioURL, setAudioURL] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunks = useRef([]);
  const currentQuestion = questions[currentQuestionIndex];
  const [recordingTime, setRecordingTime] = useState(0);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const timerRef = useRef(null);
  const userId = localStorage.getItem("id");
  

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
      [questions[currentQuestionIndex].be_name]: e.target.value,
    });
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

  const requestMicrophonePermission = async () => {
    try {
      const permission = await navigator.permissions.query({ name: "microphone" });
      if (permission.state === "denied") {
        setMicPermissionDenied(true);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Error checking microphone permissions", error);
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
        const audioBlob = new Blob(audioChunks.current, { type: "audio/wav" });
        const audioURL = URL.createObjectURL(audioBlob);
        setAudioURL(audioURL);
        setAnswers(prev => ({ ...prev, [currentQuestion.be_name]: audioBlob }));
        setRecordingTime(0);
        clearInterval(timerRef.current);
      };
      
      mediaRecorder.start();
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prevTime => prevTime + 1);
      }, 1000);
    } catch (error) {
      console.error("Error accessing microphone", error);
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
    setAnswers(prev => ({ ...prev, [currentQuestion.be_name]: null }));
  };

  const handleSubmit = async () => {
    
    try {
      await apiClient.post("patients/feedback/questionaire", {
        interventionId: interventionId,
        userId: userId,
        responses: questions.map((question) => ({
          question: question.label,
          answer: answers[question.be_name] || "",
        }))
      });

      onClose(); // Close the modal after submission
    } catch (error) {
      console.error("Error submitting feedback:", error);
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{t("Feedback")}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <ProgressBar
          now={((currentQuestionIndex + 1) / questions.length) * 100}
          label={`${currentQuestionIndex + 1}/${questions.length}`}
          className="mb-3 text-center"
        />
        {micPermissionDenied && (
          <Alert variant="danger" className="text-center">
            {t("Microphone access is denied. Please enable it in your browser settings.")}
          </Alert>
        )}
        <h5 className="text-center mb-4">{currentQuestion.label}</h5>
        <Row className="justify-content-center">
          <Col md={10}>
            {currentQuestion.type === "multi-select" && (
              <div className="d-flex flex-wrap gap-2 justify-content-center">
                {currentQuestion.options.map((option, index) => (
                  <Button
                    key={index}
                    variant={answers[currentQuestion.be_name]?.includes(option) ? "primary" : "outline-primary"}
                    onClick={() => handleOptionSelect(option, currentQuestion.be_name, true)}
                  >
                    {t(option)}
                  </Button>
                ))}
              </div>
            )}
            {currentQuestion.type === "dropdown" && (
              <div className="d-flex flex-wrap gap-2 justify-content-center">
                {currentQuestion.options.map((option, index) => (
                  <Button
                    key={index}
                    variant={answers[currentQuestion.be_name]?.includes(option) ? "primary" : "outline-primary"}
                    onClick={() => handleOptionSelect(option, currentQuestion.be_name, false)}
                  >
                    {t(option)}
                  </Button>
                ))}
              </div>
            )}
            {currentQuestion.type === "text" && (
              <>
                <div className="d-flex justify-content-center mb-3">
                  <Button
                    variant={inputMode === "text" ? "primary" : "outline-primary"}
                    className="mx-2"
                    onClick={() => setInputMode("text")}
                  >
                    <FaKeyboard /> {t("Type")}
                  </Button>
                  <Button
                    variant={inputMode === "audio" ? "primary" : "outline-primary"}
                    className="mx-2"
                    onClick={() => setInputMode("audio")}
                  >
                    <FaMicrophone /> {t("Record")}
                  </Button>
                </div>
                {inputMode === "text" && (
                  <Form.Control
                    as="textarea"
                    rows={4}
                    id={currentQuestion.be_name}
                    placeholder={t("Type your response")}
                    className="mb-3"
                    value={answers[questions[currentQuestionIndex].be_name] || ""}
                    onChange={handleAnswerChange}
                  />
                )}
                {inputMode === "audio" && (
                  <div className="d-flex flex-column align-items-center">
                    {recording ? (
                      <Button variant="danger" onClick={stopRecording}><FaStop /> {t("Stop")} ({recordingTime}s)</Button>
                    ) : (
                      <Button variant="primary" onClick={startRecording}><FaMicrophone /> {t("Start Recording")}</Button>
                    )}
                    {audioURL && (
                      <div className="mt-3">
                        <audio controls src={audioURL}></audio>
                        <Button variant="warning" onClick={deleteRecording} className="ms-2"><FaTrash /> {t("Delete")}</Button>
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
          <Button variant="secondary" onClick={handleBack}>{t("Back")}</Button>
        )}
        {currentQuestionIndex + 1 < questions.length ? (
          <Button variant="primary" onClick={handleNext} className="ms-auto">{t("Next")}</Button>
        ) : (
          <Button variant="success" onClick={handleSubmit} className="ms-auto">{t("Submit")}</Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default FeedbackPopup;
