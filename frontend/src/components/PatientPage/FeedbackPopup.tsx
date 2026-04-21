// src/components/patient/FeedbackPopup.tsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Form, Alert } from 'react-bootstrap';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FaMicrophone, FaKeyboard, FaStop, FaTrash, FaUpload } from 'react-icons/fa';
import ReactPlayer from 'react-player';
import apiClient from '@/api/client';
import StarIcon from '@/assets/icons/interventions/star.svg?react';
import CircleCheckFill from '@/assets/icons/circle-check-fill.svg?react';
import { useTranslation } from 'react-i18next';
import ErrorAlert from '@/components/common/ErrorAlert';
import { Badge } from '@/components/ui/badge';

const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

type Translation = { language: string; text: string };
type PossibleAnswer = { key: string; translations: Translation[] };
type RawQuestion = {
  questionKey: string;
  answerType: 'select' | 'multi-select' | 'text' | 'video' | 'dropdown';
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
  const exact = trs.find((t) => t.language === lang)?.text;
  if (exact) return exact;
  const base = trs.find((t) => t.language.split('-')[0] === lang)?.text;
  if (base) return base;
  const en = trs.find((t) => t.language === 'en')?.text;
  if (en) return en;
  return fallbackKey || trs[0].text || '';
};

const normalizeType = (t: RawQuestion['answerType']): NormalizedQuestion['type'] => {
  if (t === 'select' || t === 'dropdown') return 'dropdown';
  if (t === 'multi-select') return 'multi-select';
  if (t === 'video') return 'video';
  return 'text';
};

const toNormalized = (q: RawQuestion, lang: string): NormalizedQuestion => ({
  questionKey: q.questionKey,
  type: normalizeType(q.answerType),
  label: pickText(q.translations, lang, q.questionKey),
  options: q.possibleAnswers || [],
});

type Props = {
  show: boolean;
  interventionId: string;
  questions: Array<RawQuestion | NormalizedQuestion>;
  onClose: () => void;
  date?: string; // YYYY-MM-DD
};

const FeedbackPopup: React.FC<Props> = ({ show, interventionId, questions, onClose, date }) => {
  const { t, i18n } = useTranslation();
  const currentLang = normalizeLang(i18n.language);

  const normalizedQuestions: NormalizedQuestion[] = useMemo(() => {
    const src = Array.isArray(questions) ? questions : [];
    return src
      .map((q: any) =>
        q?.label && q?.type && q?.options
          ? (q as NormalizedQuestion)
          : toNormalized(q as RawQuestion, currentLang)
      )
      .filter((q) => typeof q?.questionKey === 'string' && q.questionKey.trim().length > 0)
      .sort((a, b) => {
        if (a.type === 'text' && b.type !== 'text') return 1;
        if (a.type !== 'text' && b.type === 'text') return -1;
        return 0;
      });
  }, [questions, currentLang]);

  // show a safe sheet even if there are no questions
  if (show && normalizedQuestions.length === 0) {
    return (
      <Sheet open={show} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="flex flex-col">
          <SheetHeader>
            <SheetTitle>{t('Feedback')}</SheetTitle>
          </SheetHeader>
          <div className="flex-1">
            <Alert variant="info" className="mb-0">
              {t('No feedback questions available.')}
            </Alert>
          </div>
          <SheetFooter>
            <Button onClick={onClose}>{t('Close')}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [inputMode, setInputMode] = useState<'text' | 'audio'>('text');
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<BlobPart[]>([]);
  const videoChunks = useRef<BlobPart[]>([]);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const userId = localStorage.getItem('id') || '';

  const currentQuestion = normalizedQuestions[currentQuestionIndex];

  const stopTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const forceStopAllMedia = () => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch {
      /* empty */
    }

    try {
      const stream = previewRef.current?.srcObject as MediaStream | null;
      if (stream) {
        stream.getTracks().forEach((tt) => tt.stop());
        if (previewRef.current) previewRef.current.srcObject = null;
      }
    } catch {
      /* empty */
    }

    setRecording(false);
    setCountdown(null);
    stopTimer();
  };

  const resetAll = () => {
    setCurrentQuestionIndex(0);
    setAnswers({});
    setAudioURL(null);
    setVideoURL(null);
    setRecording(false);
    setRecordingTime(0);
    setCountdown(null);
    setMicPermissionDenied(false);
    setInputMode('text');
    setError(null);
    setIsSubmitting(false);
    stopTimer();
  };

  useEffect(() => {
    if (!show) resetAll();
  }, [show]);

  useEffect(() => {
    return () => {
      forceStopAllMedia();
      stopTimer();
    };
  }, []);

  // if questions changed while modal open, clamp index
  useEffect(() => {
    if (currentQuestionIndex >= normalizedQuestions.length) {
      setCurrentQuestionIndex(0);
    }
  }, [normalizedQuestions.length, currentQuestionIndex]);

  const handleChangeText = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: e.target.value }));
  };

  const handleOptionSelect = (optionKey: string, fieldKey: string, multiple = false) => {
    setAnswers((prev) => {
      if (multiple) {
        const current: string[] = Array.isArray(prev[fieldKey]) ? prev[fieldKey] : [];
        const next = current.includes(optionKey)
          ? current.filter((k) => k !== optionKey)
          : [...current, optionKey];
        return { ...prev, [fieldKey]: next };
      }
      return { ...prev, [fieldKey]: [optionKey] };
    });
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

    const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;
    audioChunks.current = [];

    recorder.ondataavailable = (e) => audioChunks.current.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());

      const blob = new Blob(audioChunks.current, { type: mimeType || 'audio/webm' });
      setAudioURL(URL.createObjectURL(blob));
      setAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: blob }));
      setRecording(false);
      stopTimer();
    };

    recorder.start();
    setRecording(true);
    setRecordingTime(0);
    stopTimer();
    timerRef.current = window.setInterval(() => setRecordingTime((tt) => tt + 1), 1000);
  };

  const stopRecording = () => {
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      /* empty */
    }
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
    if (previewRef.current) previewRef.current.srcObject = stream as any;

    setCountdown(10);
    let sec = 10;

    const interval = window.setInterval(() => {
      sec--;
      setCountdown(sec);

      if (sec === 0) {
        window.clearInterval(interval);

        const mimeCandidates = [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
        ];
        const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = recorder;
        videoChunks.current = [];

        recorder.ondataavailable = (e) => videoChunks.current.push(e.data);
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          try {
            if (previewRef.current) previewRef.current.srcObject = null as any;
          } catch {
            /* empty */
          }

          const blob = new Blob(videoChunks.current, { type: mimeType || 'video/webm' });
          if (blob.size > MAX_VIDEO_SIZE) {
            setError(String(t('Video too large (max 50MB)')));
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
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      /* empty */
    }
    setRecording(false);
    setCountdown(null);
  };

  const deleteVideo = () => {
    setVideoURL(null);
    setAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: null }));
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_VIDEO_SIZE) {
      setError(String(t('Video too large (max 50MB)')));
      return;
    }
    setVideoURL(URL.createObjectURL(file));
    setAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: file }));
  };

  const confirmClose = () => {
    const isBusy = recording || countdown !== null;
    const hasAny = Object.values(answers).some((a) => a);

    const msg = hasAny
      ? t('Are you sure you want to close? Unsaved data will be lost.')
      : t('Close this window?');

    if ((hasAny || isBusy) && !window.confirm(String(msg))) return;

    forceStopAllMedia();
    onClose();
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('userId', userId);
      formData.append('interventionId', interventionId || '');
      if (date) formData.append('date', date);

      normalizedQuestions.forEach((q) => {
        const key = q.questionKey;
        const answer = answers[key];

        if (answer instanceof Blob) {
          const isVideo = (answer as any).type?.startsWith('video/');
          formData.append(isVideo ? `${key}_video` : key, answer, `${key}.webm`);
        } else if (typeof answer === 'string' || typeof answer === 'number') {
          formData.append(key, answer.toString());
        } else if (Array.isArray(answer)) {
          formData.append(key, JSON.stringify(answer));
        }
      });

      await apiClient.post('/patients/feedback/questionaire/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      forceStopAllMedia();
      onClose();
    } catch (e) {
      console.error('Error submitting feedback:', e);
      setError(String(t('Error submitting feedback. Please try again.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStarRating = () => {
    const options = currentQuestion.options || [];
    const selectedValue = answers[currentQuestion.questionKey];
    const selectedRating = selectedValue ? parseInt(selectedValue[0], 10) : 0;

    return (
      <div className="mx-auto flex flex-col gap-2">
        <div
          className="flex justify-between items-center gap-2"
          role="group"
          aria-label={t('Star rating')}
        >
          {options.map((opt, i) => {
            const rating = parseInt(opt.key, 10);

            return (
              <button
                key={i}
                type="button"
                className={`p-3 rounded-full border-none transition-all ${rating <= selectedRating ? 'bg-[#EFA73B]/20' : 'bg-zinc-100'}`}
                onClick={() => handleOptionSelect(opt.key, currentQuestion.questionKey, false)}
                aria-pressed={rating === selectedRating}
                aria-label={`${rating} ${rating === 1 ? 'star' : 'stars'}`}
                title={`${rating}/5`}
              >
                <StarIcon
                  className={`w-8 h-8 ${rating <= selectedRating ? 'text-[#EFA73B]' : 'text-zinc-300'}`}
                />
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-3 font-normal text-sm text-zinc-500">
          <span>{t('Insufficient')}</span>
          <span className="text-center">{t('Good')}</span>
          <span className="text-right">{t('Very good')}</span>
        </div>
      </div>
    );
  };

  const renderOptions = (multiple = false) => {
    // Check if this is a star rating question
    if (currentQuestion.questionKey.startsWith('rating_stars_')) {
      return renderStarRating();
    }

    const selected: string[] = Array.isArray(answers[currentQuestion.questionKey])
      ? (answers[currentQuestion.questionKey] as string[])
      : [];

    const options = currentQuestion.options || [];

    return (
      <div
        className="flex flex-col gap-2 sm:max-w-96 w-full mx-auto"
        role="group"
        aria-label={t('Answer options')}
      >
        {options.map((opt, i) => {
          const label = pickText(opt.translations, currentLang, opt.key);
          const active = selected.includes(opt.key);
          return (
            <Button
              key={i}
              className={
                active
                  ? 'bg-[#00956C]/20 hover:bg-[#00956C]/20 text-[#00956C]'
                  : 'bg-white border border-zinc-200 text-zinc-800'
              }
              onClick={() => handleOptionSelect(opt.key, currentQuestion.questionKey, multiple)}
              aria-pressed={active}
              aria-label={label}
              title={label}
            >
              {label}
              {active && <CircleCheckFill className="w-[18px] h-[18px]" />}
            </Button>
          );
        })}
      </div>
    );
  };

  return (
    <Sheet
      open={show}
      onOpenChange={(open) => {
        if (!open) {
          confirmClose();
        }
      }}
    >
      <SheetContent side="bottom" className="min-h-[55vh] flex flex-col">
        <SheetHeader>
          <SheetDescription>{t('Feedback')}</SheetDescription>
          <SheetTitle>{currentQuestion.label}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-2 flex-1">
          {micPermissionDenied && <Alert variant="danger">{t('Microphone access denied.')}</Alert>}
          {error && <ErrorAlert message={error} onClose={() => setError(null)} className="m-0" />}

          <div className="flex flex-col gap-2 flex-1">
            {['dropdown', 'multi-select'].includes(currentQuestion.type) &&
              renderOptions(currentQuestion.type === 'multi-select')}

            {currentQuestion.type === 'text' && (
              <>
                <div className="flex justify-center gap-2">
                  <Badge
                    onClick={() => setInputMode('text')}
                    variant={inputMode === 'text' ? 'filter-active' : 'filter-inactive'}
                    role="button"
                    aria-pressed={inputMode === 'text'}
                    aria-label={t('Text mode')}
                  >
                    {t('Type')} <FaKeyboard />
                  </Badge>
                  <Badge
                    onClick={() => setInputMode('audio')}
                    variant={inputMode === 'audio' ? 'filter-active' : 'filter-inactive'}
                    role="button"
                    aria-pressed={inputMode === 'audio'}
                    aria-label={t('Audio mode')}
                  >
                    {t('Record')} <FaMicrophone />
                  </Badge>
                </div>

                {inputMode === 'text' ? (
                  <Textarea
                    aria-label={t('Text Feedback')}
                    value={answers[currentQuestion.questionKey] || ''}
                    onChange={handleChangeText}
                    className="p-4 flex-1 resize-none rounded-3xl border border-zinc-200 font-medium text-zinc-800 shadow-none"
                  />
                ) : (
                  <div className="flex flex-col items-center my-3 gap-2">
                    {recording ? (
                      <Button onClick={stopRecording} className="bg-[#EFA73B]">
                        {t('Stop')} ({recordingTime}s) <FaStop />
                      </Button>
                    ) : (
                      <Button onClick={startRecording} className="bg-[#EFA73B]">
                        {t('Start Recording')} <FaMicrophone />
                      </Button>
                    )}

                    {audioURL && (
                      <div className="flex justify-center items-center flex-wrap gap-2">
                        <audio controls src={audioURL} />
                        <Button onClick={deleteAudio} className="bg-[#F1ADCF]">
                          {t('Delete')} <FaTrash />
                        </Button>
                      </div>
                    )}

                    <p className="text-sm text-center text-zinc-500">
                      {t('privacy_note_recordings')}
                    </p>
                  </div>
                )}
              </>
            )}

            {currentQuestion.type === 'video' && (
              <div className="flex flex-col items-center my-3 gap-2">
                {videoURL ? (
                  <>
                    <ReactPlayer url={videoURL} controls width="100%" height="100%" />
                    <Button onClick={deleteVideo} className="bg-[#F1ADCF]">
                      {t('Delete')} <FaTrash />
                    </Button>
                    <p className="text-sm text-center text-zinc-500">
                      {t('privacy_note_recordings')}
                    </p>
                  </>
                ) : (
                  <div className="flex justify-center items-center flex-wrap gap-2">
                    <video
                      ref={previewRef}
                      autoPlay
                      muted
                      style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
                    />
                    {countdown !== null ? (
                      <div className="text-center text-lg font-medium text-zinc-800">
                        {t('Starting in')} {countdown}s...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {recording ? (
                          <Button onClick={stopVideoRecording} className="bg-[#EFA73B]">
                            {t('Stop')} <FaStop />
                          </Button>
                        ) : (
                          <Button onClick={startVideoRecording} className="bg-[#EFA73B]">
                            {t('Record Video')}
                          </Button>
                        )}
                        <div>{t('or')}</div>
                        <Form.Label className="btn btn-outline-secondary mb-0 !rounded-full">
                          <FaUpload /> {t('Upload')}
                          <Form.Control
                            type="file"
                            accept="video/*"
                            hidden
                            onChange={handleUpload}
                          />
                        </Form.Label>
                      </div>
                    )}
                    <p className="text-sm text-center text-zinc-500">
                      {t('privacy_note_recordings')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="flex gap-2">
          {currentQuestionIndex > 0 && (
            <Button variant="secondary" onClick={() => setCurrentQuestionIndex((i) => i - 1)}>
              {t('Back')}
            </Button>
          )}
          {currentQuestionIndex + 1 < normalizedQuestions.length ? (
            <Button onClick={() => setCurrentQuestionIndex((i) => i + 1)}>{t('Next')}</Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? t('Submitting...') : t('Submit')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default FeedbackPopup;
