import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';
import { Modal } from 'react-bootstrap';
import ReactPlayer from 'react-player';
import { Intervention } from '../../types';
import { translateText } from '../../utils/translate';

interface FeedbackEntry {
  question: {
    translations: { language: string; text: string }[];
  };
  answer: {
    key: string;
    translations: { language: string; text: string }[];
  }[];
  comment?: string;
}

interface VideoFeedback {
  video_url: string;
  video_expired: boolean;
  comment?: string;
}

interface Props {
  show: boolean;
  onClose: () => void;
  exercise: Intervention;
  feedbackEntries?: FeedbackEntry[];
  date: string;
  userLang: string;
  video?: VideoFeedback;
}

// Helper to get translated text with fallback to English
const getTranslation = (
  translations: { language: string; text: string }[],
  lang: string
): string => {
  return (
    translations.find((t) => t.language === lang)?.text ||
    translations.find((t) => t.language === 'en')?.text ||
    ''
  );
};

const InterventionFeedbackModal: React.FC<Props> = ({
  show,
  onClose,
  exercise,
  feedbackEntries = [],
  date,
  userLang,
  video,
}) => {
  const { t } = useTranslation();
  const [translatedTitle, setTranslatedTitle] = useState('');
  const [detectedLang, setDetectedLang] = useState('');

  useEffect(() => {
    if (show && exercise?.title) {
      translateText(exercise.title, userLang)
        .then(({ translatedText, detectedSourceLanguage }) => {
          setTranslatedTitle(translatedText);
          setDetectedLang(detectedSourceLanguage);
        })
        .catch(() => {
          setTranslatedTitle(exercise.title);
          setDetectedLang('');
        });
    }
  }, [exercise?.title, show, userLang]);

  return (
    <Modal show={show} onHide={onClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>
          {translatedTitle}{' '}
          {detectedLang && (
            <span className="text-muted">
              ({t('Original language:')} {detectedLang})
            </span>
          )}{' '}
          <span className="ms-2 text-secondary">({date})</span>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <section className="mb-4">
          <h6 className="fw-bold">{t('Feedback')}</h6>
        </section>

        {/* Video feedback section */}
        {video && (
          <section className="mb-4">
            <hr />
            <p className="fw-bold mb-1">{t('Video feedback')}</p>
            {video.comment && <p className="fst-italic">{video.comment}</p>}
            {!video.video_expired ? (
              <div className="rounded shadow-sm overflow-hidden mt-3">
                <ReactPlayer url={video.video_url} width="100%" height="400px" controls />
              </div>
            ) : (
              <p className="text-muted mt-2">{t('Video feedback has expired.')}</p>
            )}
          </section>
        )}

        {/* Text/audio/multiselect feedback */}
        {feedbackEntries.length > 0 ? (
          feedbackEntries.map((entry, idx) => {
            const questionText = getTranslation(entry.question.translations, userLang);

            return (
              <section key={idx} className="mb-4">
                <hr />
                <p className="fw-bold">{questionText}</p>
                {entry.answer.length > 0 && (
                  <ul className="mb-2">
                    {entry.answer.map((ans, i) => {
                      const answerText = getTranslation(ans.translations, userLang) || ans.key;
                      return <li key={i}>{answerText}</li>;
                    })}
                  </ul>
                )}
                {entry.comment && <p className="fst-italic">{entry.comment}</p>}
              </section>
            );
          })
        ) : (
          <p className="text-muted">{t('No feedback available')}</p>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default InterventionFeedbackModal;
