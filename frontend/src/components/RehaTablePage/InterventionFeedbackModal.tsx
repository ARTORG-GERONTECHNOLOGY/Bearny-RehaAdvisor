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
      translateText(exercise.title)
        .then(({ translatedText, detectedSourceLanguage }) => {
          setTranslatedTitle(translatedText);
          setDetectedLang(detectedSourceLanguage);
        })
        .catch(() => {
          setTranslatedTitle(exercise.title);
          setDetectedLang('');
        });
    }
  }, [exercise?.title, show]);

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>
          {translatedTitle}{' '}
          {detectedLang && (
            <span className="text-muted">
              ({t('Original language:')} {detectedLang})
            </span>
          )}{' '}
          ({date})
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <h5>{t('Feedback')}</h5>

        {/* Video feedback section */}
        {video && (
          <>
            <hr />
            <p>
              <strong>{t('Video feedback')}</strong>
            </p>
            {video.comment && <p className="fst-italic">{video.comment}</p>}
            {!video.video_expired ? (
              <div className="rounded shadow-sm overflow-hidden mt-3">
                <ReactPlayer url={video.video_url} width="100%" height="400px" controls />
              </div>
            ) : (
              <p className="text-muted mt-3">{t('Video feedback has expired.')}</p>
            )}
          </>
        )}

        {/* Other feedback entries */}
        {feedbackEntries.length > 0 ? (
          feedbackEntries.map((entry, idx) => {
            const questionText =
              entry.question.translations.find((t) => t.language === userLang)?.text ||
              entry.question.translations.find((t) => t.language === 'en')?.text ||
              '';

            return (
              <div key={idx} className="mb-4">
                <hr />
                <p>
                  <strong>{questionText}</strong>
                </p>
                <ul className="mb-2">
                  {entry.answer.map((ans, i) => {
                    const translation =
                      ans.translations.find((t) => t.language === userLang)?.text ||
                      ans.translations.find((t) => t.language === 'en')?.text ||
                      ans.key;
                    return <li key={i}>{translation}</li>;
                  })}
                </ul>
                {entry.comment && <p className="fst-italic">{entry.comment}</p>}
              </div>
            );
          })
        ) : (
          <p>{t('No feedback available')}</p>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default InterventionFeedbackModal;
