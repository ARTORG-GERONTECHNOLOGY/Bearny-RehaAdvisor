// src/components/patient/FeedbackPopup.tsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Modal, Button, ProgressBar, Form, Row, Col, Alert, OverlayTrigger, Tooltip,
} from 'react-bootstrap';
import { FaMicrophone, FaKeyboard, FaStop, FaTrash, FaUpload } from 'react-icons/fa';
import ReactPlayer from 'react-player';
import apiClient from '../../api/client';
import { useTranslation } from 'react-i18next';
import ErrorAlert from '../common/ErrorAlert';

const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

type Translation = { language: string; text: string };
type PossibleAnswer = { key: string; translations: Translation[] };
type RawQuestion = {
  questionKey: string;
  answerType: 'dropdown' | 'multi-select' | 'text' | 'video';
  translations: Translation[];
  possibleAnswers?: PossibleAnswer[];
};

type NormalizedQuestion = {
  questionKey: string;
  type: 'dropdown' | 'multi-select' | 'text' | 'video';
  label: string;
  options: PossibleAnswer[];
};

const normalizeLang = (lang?: string) => (lang || 'en').split('-')[0];

const pickText = (trs: Translation[] | undefined, lang: string, fallbackKey?: string) => {
  if (!trs || trs.length === 0) return fallbackKey || '';
  const exact = trs.find(t => t.language === lang)?.text;
  if (exact) return exact;
  const base = trs.find(t => t.language.split('-')[0] === lang)?.text;
  if (base) return base;
  const en = trs.find(t => t.language === 'en')?.text;
  if (en) return en;
  return fallbackKey || trs[0].text || '';
};

const toNormalized = (q: RawQuestion, lang: string): NormalizedQuestion => ({
  questionKey: q.questionKey,
  type: q.answerType,
  label: pickText(q.translations, lang, q.questionKey),
  options: q.possibleAnswers || [],
});

/** Localized privacy note shown in audio/video sections */
const PRIVACY_NOTE: Record<string, string> = {
  de: 'Hinweis: Aufnahmen und Videos sind nur für Ihre Therapeutin/Ihren Therapeuten sichtbar und werden nach 14 Tagen gelöscht.',
  fr: 'Remarque : les enregistrements et vidéos ne sont visibles que par votre thérapeute et seront supprimés après 14 jours.',
  it: 'Nota: le registrazioni e i video sono visibili solo al/la terapeuta e verranno eliminati dopo 14 giorni.',
  en: 'Note: Recordings and videos are only visible to your therapist and will be deleted after 14 days.',
};

const GAP_PX = 12; // keep in sync with CSS .answer-grid gap

const FeedbackPopup = ({
  show,
  interventionId,
  questions,
  onClose,
}: {
  show: boolean;
  interventionId: string;
  questions: Array<RawQuestion | NormalizedQuestion>;
  onClose: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = normalizeLang(i18n.language);
  const privacyNote = PRIVACY_NOTE[currentLang] || PRIVACY_NOTE.en;

  // Normalize questions to a single shape for rendering
  const normalizedQuestions: NormalizedQuestion[] = useMemo(
    () =>
      questions.map((q: any) =>
        q.label && q.type && q.options
          ? (q as NormalizedQuestion)
          : toNormalized(q as RawQuestion, currentLang)
      ),
    [questions, currentLang]
  );

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [inputMode, setInputMode] = useState<'text' | 'audio'>('text');
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const [uploadVideoFile, setUploadVideoFile] = useState<File | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<BlobPart[]>([]);
  const videoChunks = useRef<BlobPart[]>([]);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<any>(null);
  const userId = localStorage.getItem('id') || '';

  const currentQuestion = normalizedQuestions[currentQuestionIndex];

  useEffect(() => {
    if (!show) resetAll();
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

  const handleChangeText = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setAnswers(prev => ({ ...prev, [currentQuestion.questionKey]: e.target.value }));
  };

  const handleOptionSelect = (optionKey: string, fieldKey: string, multiple = false) => {
    setAnswers(prev => {
      if (multiple) {
        const current: string[] = prev[fieldKey] || [];
        const next = current.includes(optionKey)
          ? current.filter(k => k !== optionKey)
          : [...current, optionKey];
        return { ...prev, [fieldKey]: next };
      }
      // single-select
      return { ...prev, [fieldKey]: [optionKey] };
    });

    // Auto-advance for single-select
    if (!multiple) {
      setTimeout(() => {
        setCurrentQuestionIndex((idx) =>
          idx + 1 < normalizedQuestions.length ? idx + 1 : idx
        );
      }, 120);
    }
  };

  const requestMicrophonePermission = async () => {
    try {
      const permission: any = await (navigator as any).permissions.query({ name: 'microphone' });
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

    recorder.ondataavailable = e => audioChunks.current.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());
      const blob = new Blob(audioChunks.current, { type: 'audio/wav' });
      setAudioURL(URL.createObjectURL(blob));
      setAnswers(prev => ({ ...prev, [currentQuestion.questionKey]: blob }));
      setRecording(false);
      clearInterval(timerRef.current);
    };

    recorder.start();
    setRecording(true);
    timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const deleteAudio = () => {
    setAudioURL(null);
    setRecordingTime(0);
    setAnswers(prev => ({ ...prev, [currentQuestion.questionKey]: null }));
  };

  const startVideoRecording = async () => {
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (previewRef.current) previewRef.current.srcObject = stream as any;
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
        recorder.ondataavailable = e => videoChunks.current.push(e.data);
        recorder.onstop = () => {
          stream.getTracks().forEach(track => track.stop());
          const blob = new Blob(videoChunks.current, { type: 'video/webm' });
          if (blob.size > MAX_VIDEO_SIZE) {
            setError(t('Video too large (max 50MB)'));
            return;
          }
          setVideoURL(URL.createObjectURL(blob));
          setAnswers(prev => ({ ...prev, [currentQuestion.questionKey]: blob }));
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
    setAnswers(prev => ({ ...prev, [currentQuestion.questionKey]: null }));
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_VIDEO_SIZE) {
      setError(t('Video too large (max 50MB)'));
      return;
    }
    setVideoURL(URL.createObjectURL(file));
    setUploadVideoFile(file);
    setAnswers(prev => ({ ...prev, [currentQuestion.questionKey]: file }));
  };

  /** Layout helper for options: 2x2 (≤4) or 2x3 (5–6). */
  const getGridLayout = (count: number) => {
    const cols = count <= 4 ? 2 : 3;
    const rows = Math.min(2, Math.ceil(count / cols)); // cap to two rows
    return { cols, rows };
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('userId', userId);
      formData.append('interventionId', interventionId);

      normalizedQuestions.forEach(q => {
        const key = q.questionKey;
        const answer = answers[key];
        if (answer instanceof Blob) {
          const isVideo = (answer as any).type?.startsWith('video/');
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
    } catch {
      setError(t('Error submitting feedback. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmClose = () => {
    const hasAny = Object.values(answers).some(a => a);
    if (hasAny && !window.confirm(t('Are you sure you want to close? Unsaved data will be lost.'))) return;
    onClose();
  };

  /** Answers area (no scrolling; auto-fit grid) */
  const renderOptions = (multiple = false) => {
    const selected: string[] = answers[currentQuestion.questionKey] || [];
    const options = currentQuestion.options || [];
    const { cols, rows } = getGridLayout(options.length);

    return (
      <div className="bottom-answers">
        <div
          className="feedback-box answers p-3"
          style={
            {
              // expose rows to CSS for button height calculation
              ['--rows' as any]: rows,
              ['--cols' as any]: cols,
            } as React.CSSProperties
          }
        >
          <div
            className="answer-grid"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
            role="group"
            aria-label={t('Answer options')}
          >
            {options.map((opt, i) => {
              const label = pickText(opt.translations, currentLang, opt.key);
              const active = selected.includes(opt.key);
              return (
                <Button
                  key={i}
                  variant={active ? 'primary' : 'outline-primary'}
                  className="answer-btn"
                  onClick={() => handleOptionSelect(opt.key, currentQuestion.questionKey, multiple)}
                  aria-pressed={active}
                  aria-label={label}
                  title={label}
                >
                  <span className="answer-label">{label}</span>
                </Button>
              );
            })}
            {/* If fewer items than grid cells, we add invisible fillers to keep
                consistent sizing (so each row has exactly `cols` items). */}
            {Array.from({ length: Math.max(0, rows * cols - options.length) }).map((_, i) => (
              <div className="answer-filler" key={`f-${i}`} />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal show={show} onHide={confirmClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{t('Feedback')}</Modal.Title>
      </Modal.Header>

      <Modal.Body className="feedback-body">
        <ProgressBar
          now={((currentQuestionIndex + 1) / normalizedQuestions.length) * 100}
          label={`${currentQuestionIndex + 1}/${normalizedQuestions.length}`}
        />

        {micPermissionDenied && (
          <Alert variant="danger" className="mt-2">
            {t('Microphone access denied.')}
          </Alert>
        )}

        <div className="feedback-layout">
          <div className="question-area">
            <h5 className="text-center my-3">{currentQuestion.label}</h5>

            <Row className="w-100 justify-content-center m-0">
              <Col md={10} className="p-0">
                {/* options */}
                {['dropdown', 'multi-select'].includes(currentQuestion.type) &&
                  renderOptions(currentQuestion.type === 'multi-select')}

                {/* text vs audio (same fixed-height box) */}
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
                      <div className="feedback-box">
                        <Form.Control
                          as="textarea"
                          aria-label="Text Feedback"
                          value={answers[currentQuestion.questionKey] || ''}
                          onChange={handleChangeText}
                          style={{ height: '100%', resize: 'none' }}
                        />
                      </div>
                    ) : (
                      <div className="feedback-box d-flex flex-column align-items-center justify-content-start p-3">
                        {recording ? (
                          <Button variant="danger" onClick={stopRecording} className="mb-2">
                            <FaStop /> {t('Stop')} ({recordingTime}s)
                          </Button>
                        ) : (
                          <Button onClick={startRecording} className="mb-2">
                            <FaMicrophone /> {t('Start Recording')}
                          </Button>
                        )}

                        {audioURL && (
                          <div className="mt-2">
                            <audio controls src={audioURL} />
                            <Button variant="warning" onClick={deleteAudio} className="ms-2">
                              <FaTrash /> {t('Delete')}
                            </Button>
                          </div>
                        )}

                        <p className="text-muted small mt-auto mb-0 text-center">
                          {privacyNote}
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* video (same fixed-height box) */}
                {currentQuestion.type === 'video' && (
                  <div className="feedback-box d-flex flex-column align-items-center justify-content-start p-3">
                    {videoURL ? (
                      <>
                        <ReactPlayer url={videoURL} controls width="100%" height="100%" />
                        <Button variant="warning" onClick={deleteVideo} className="mt-2">
                          <FaTrash /> {t('Delete')}
                        </Button>
                        <p className="text-muted small mt-auto mb-0 text-center">
                          {privacyNote}
                        </p>
                      </>
                    ) : (
                      <>
                        <video
                          ref={previewRef}
                          autoPlay
                          muted
                          style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
                        />
                        {countdown !== null ? (
                          <div className="my-2 text-center fs-5">
                            {t('Starting in')} {countdown}s...
                          </div>
                        ) : (
                          <div className="d-flex gap-2 mt-2">
                            <Button onClick={startVideoRecording}>{t('Record Video')}</Button>
                            <Form.Label className="btn btn-outline-secondary mb-0">
                              <FaUpload className="me-1" /> {t('Upload')}
                              <Form.Control type="file" accept="video/*" hidden onChange={handleUpload} />
                            </Form.Label>
                          </div>
                        )}
                        <p className="text-muted small mt-auto mb-0 text-center">
                          {privacyNote}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </Col>
            </Row>
          </div>
        </div>

        {error && <ErrorAlert message={error} onClose={() => setError(null)} className="mt-3" />}
      </Modal.Body>

      <Modal.Footer>
        {currentQuestionIndex > 0 && (
          <Button variant="secondary" onClick={() => setCurrentQuestionIndex(i => i - 1)}>
            {t('Back')}
          </Button>
        )}
        {currentQuestionIndex + 1 < normalizedQuestions.length ? (
          <Button variant="primary" onClick={() => setCurrentQuestionIndex(i => i + 1)}>
            {t('Next')}
          </Button>
        ) : (
          <Button variant="success" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('Submitting...') : t('Submit')}
          </Button>
        )}
      </Modal.Footer>

      {/* Inline styles: stable layout + NON-scrolling answers area that fits in window */}
      <style>{`
        :root{
          --footer-safe: 84px;            /* keeps sticky area clear of footer */
          --feedback-min-h: 56vh;         /* stable content height */
          --feedback-box-h: 236px;        /* text/audio/video box height */
          --answers-area-h: clamp(180px, 36vh, 360px); /* height reserved for answers grid */
        }
        @media (max-width: 576px){
          :root{
            --footer-safe: 84px;
            --feedback-min-h: 52vh;
            --feedback-box-h: 210px;
            --answers-area-h: clamp(160px, 34vh, 320px);
          }
        }

        .feedback-body{ display:flex; flex-direction:column; }
        .feedback-layout{ display:flex; flex-direction:column; min-height:var(--feedback-min-h); }
        .question-area{ display:flex; flex-direction:column; }

        .feedback-box{
          width:100%;
          height:var(--feedback-box-h);
          border:1px solid rgba(0,0,0,0.08);
          border-radius:8px;
          background:#fff;
        }

        /* Answers version — fixed height, NO scrolling, fits 2 rows */
        .feedback-box.answers{
          height: var(--answers-area-h);
          overflow: hidden;               /* no scrollbars */
          display: flex;
          align-items: stretch;
        }
        .bottom-answers{
          position: sticky;
          bottom: var(--footer-safe);
          margin-top: auto;
          background: #fff;
          padding-top: .5rem;
          z-index: 1;
        }

        .answer-grid{ 
          display:grid; 
          gap:${GAP_PX}px; 
          width: 100%;
        }
        .answer-filler{ visibility: hidden; }

        /* Buttons fill exactly the available rows height */
        .answer-btn{
          height: calc(
            (var(--answers-area-h) - ( (var(--rows, 2) - 1) * ${GAP_PX}px ) - 2px) / var(--rows, 2)
          );
          /* the -2px compensates the container border so last row doesn't clip */
          width: 100%;
          display:flex; align-items:center; justify-content:center;
          border-radius: 12px;
          padding: .75rem;
          line-height: 1.25;
          white-space: normal;
          word-break: break-word;
        }
        .answer-label{ display:block; font-size: 1rem; }
      `}</style>
    </Modal>
  );
};

export default FeedbackPopup;
