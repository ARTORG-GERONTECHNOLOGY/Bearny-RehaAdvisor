import React, { useEffect, useState } from 'react';
import { Modal } from 'react-bootstrap';
import { Intervention } from '../../types';
import { translateText } from '../../utils/translate'; // Adjust path if needed

interface Props {
  show: boolean;
  onClose: () => void;
  exercise: Intervention;
  interventionData: Intervention;
  t: (key: string) => string;
}

const InterventionStatsModal: React.FC<Props> = ({
  show,
  onClose,
  exercise,
  interventionData,
  t,
}) => {
  const [translatedTitle, setTranslatedTitle] = useState('');
  const [detectedSourceLanguage, setDetectedSourceLanguage] = useState('');

  const totalCount = interventionData?.dates?.length || 0;
  const completedCount =
    interventionData?.dates?.filter((d) => d.status === 'completed')?.length || 0;
  const feedbackCount = interventionData?.dates?.filter((d) => d.feedback?.length > 0)?.length || 0;
  const currentTotalCount = interventionData?.currentTotalCount || 0;

  useEffect(() => {
    const translateTitle = async () => {
      try {
        const { translatedText, detectedSourceLanguage } = await translateText(
          exercise?.title || ''
        );
        setTranslatedTitle(translatedText);
        setDetectedSourceLanguage(detectedSourceLanguage);
      } catch (err) {
        setTranslatedTitle(exercise?.title || '');
        setDetectedSourceLanguage('');
      }
    };

    if (show) translateTitle();
  }, [exercise?.title, show]);

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>
          {translatedTitle}{' '}
          {detectedSourceLanguage && (
            <span className="text-muted">
              ({t('Original language:')} {detectedSourceLanguage})
            </span>
          )}{' '}
          – {t('Information')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <strong>{t('Total Sessions')}:</strong> {totalCount}
        <br />
        <div className="mb-4">
          <div className="progress">
            <div
              className="progress-bar bg-success"
              style={{ width: `${(completedCount / totalCount) * 100 || 0}%` }}
            />
            <div
              className="progress-bar bg-danger"
              style={{
                width: `${((currentTotalCount - completedCount) / totalCount) * 100 || 0}%`,
              }}
            />
            <div
              className="progress-bar bg-warning"
              style={{
                width: `${((totalCount - currentTotalCount) / totalCount) * 100 || 0}%`,
              }}
            />
          </div>
        </div>
        <strong>{t('Current Sessions')}:</strong>
        <div className="mb-4">
          <div className="progress">
            <div
              className="progress-bar bg-success"
              style={{ width: `${(completedCount / currentTotalCount) * 100 || 0}%` }}
            />
            <div
              className="progress-bar bg-danger"
              style={{
                width: `${((currentTotalCount - completedCount) / currentTotalCount) * 100 || 0}%`,
              }}
            />
          </div>
        </div>
        <strong>{t('Current Feedback Answered')}:</strong>
        <div className="mb-4">
          <div className="progress">
            <div
              className="progress-bar bg-success"
              style={{ width: `${(feedbackCount / currentTotalCount) * 100 || 0}%` }}
            />
            <div
              className="progress-bar bg-danger"
              style={{
                width: `${((currentTotalCount - feedbackCount) / currentTotalCount) * 100 || 0}%`,
              }}
            />
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
};

export default InterventionStatsModal;
