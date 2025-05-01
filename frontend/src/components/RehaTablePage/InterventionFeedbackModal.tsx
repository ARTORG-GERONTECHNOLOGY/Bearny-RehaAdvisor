import { useTranslation } from 'react-i18next';
import React from 'react';
import { Modal } from 'react-bootstrap';
import { Intervention } from '../../types';

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

interface Props {
  show: boolean;
  onClose: () => void;
  exercise: Intervention;
  feedbackEntries?: FeedbackEntry[]; // ✅ Mark as optional
  date: string;
  userLang: string;
}

const InterventionFeedbackModal: React.FC<Props> = ({
  show,
  onClose,
  exercise,
  feedbackEntries = [], // ✅ Default to empty array
  date,
  userLang,
}) => {
  const { t } = useTranslation();

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>
          {exercise?.title} ({date})
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <h5>{t('Feedback')}</h5>
        {feedbackEntries.length > 0 ? (
          feedbackEntries.map((entry, idx) => {
            const questionText =
              entry.question?.translations?.find((t) => t.language === userLang)?.text ||
              entry.question?.translations?.find((t) => t.language === 'en')?.text ||
              '';

            return (
              <div key={idx} className="mb-3">
                <hr />
                <p>
                  <strong>{questionText}</strong>
                </p>
                <ul className="mb-0">
                  {entry.answer.map((ans, i) => {
                    const translation =
                      ans.translations.find((t) => t.language === userLang)?.text ||
                      ans.translations.find((t) => t.language === 'en')?.text ||
                      ans.key;
                    return <li key={i}>{translation}</li>;
                  })}
                </ul>
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
