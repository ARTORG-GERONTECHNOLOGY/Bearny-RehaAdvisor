import React, { useEffect, useState } from 'react';
import { Modal } from 'react-bootstrap';
import { Intervention } from '../../types';
import { translateText } from '../../utils/translate';

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
  const completedCount = interventionData?.dates?.filter((d) => d.status === 'completed')?.length || 0;
  const feedbackCount = interventionData?.dates?.filter((d) => d.feedback?.length > 0)?.length || 0;
  const currentTotalCount = interventionData?.currentTotalCount || 0;

  useEffect(() => {
    const translateTitle = async () => {
      try {
        const { translatedText, detectedSourceLanguage } = await translateText(exercise?.title || '');
        setTranslatedTitle(translatedText);
        setDetectedSourceLanguage(detectedSourceLanguage);
      } catch {
        setTranslatedTitle(exercise?.title || '');
        setDetectedSourceLanguage('');
      }
    };

    if (show) translateTitle();
  }, [exercise?.title, show]);

  const calcPercentage = (value: number, base: number): number =>
    base > 0 ? Math.round((value / base) * 100) : 0;

  return (
    <Modal show={show} onHide={onClose} centered aria-labelledby="intervention-stats-modal-title">
      <Modal.Header closeButton>
        <Modal.Title id="intervention-stats-modal-title">
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
        <section aria-label={t('Overall Progress')}>
          <strong>{t('Total Sessions')}:</strong> {totalCount}
          <div className="progress mt-2 mb-4" style={{ height: '1.5rem' }}>
            <div
              className="progress-bar bg-success"
              role="progressbar"
              aria-label={t('Completed')}
              style={{ width: `${calcPercentage(completedCount, totalCount)}%` }}
              aria-valuenow={completedCount}
              aria-valuemin={0}
              aria-valuemax={totalCount}
            >
              {t('Completed')}
            </div>
            <div
              className="progress-bar bg-danger"
              role="progressbar"
              aria-label={t('Remaining')}
              style={{ width: `${calcPercentage(currentTotalCount - completedCount, totalCount)}%` }}
              aria-valuenow={currentTotalCount - completedCount}
              aria-valuemin={0}
              aria-valuemax={totalCount}
            >
              {t('Remaining')}
            </div>
            <div
              className="progress-bar bg-warning"
              role="progressbar"
              aria-label={t('Not Yet Started')}
              style={{ width: `${calcPercentage(totalCount - currentTotalCount, totalCount)}%` }}
              aria-valuenow={totalCount - currentTotalCount}
              aria-valuemin={0}
              aria-valuemax={totalCount}
            >
              {t('Not started')}
            </div>
          </div>
        </section>

        <section aria-label={t('Current Sessions')}>
          <strong>{t('Current Sessions')}:</strong>
          <div className="progress mt-2 mb-4" style={{ height: '1.5rem' }}>
            <div
              className="progress-bar bg-success"
              role="progressbar"
              aria-label={t('Completed')}
              style={{ width: `${calcPercentage(completedCount, currentTotalCount)}%` }}
              aria-valuenow={completedCount}
              aria-valuemin={0}
              aria-valuemax={currentTotalCount}
            >
              {t('Completed')}
            </div>
            <div
              className="progress-bar bg-danger"
              role="progressbar"
              aria-label={t('Remaining')}
              style={{ width: `${calcPercentage(currentTotalCount - completedCount, currentTotalCount)}%` }}
              aria-valuenow={currentTotalCount - completedCount}
              aria-valuemin={0}
              aria-valuemax={currentTotalCount}
            >
              {t('Remaining')}
            </div>
          </div>
        </section>

        <section aria-label={t('Feedback Progress')}>
          <strong>{t('Current Feedback Answered')}:</strong>
          <div className="progress mt-2" style={{ height: '1.5rem' }}>
            <div
              className="progress-bar bg-success"
              role="progressbar"
              aria-label={t('Feedback received')}
              style={{ width: `${calcPercentage(feedbackCount, currentTotalCount)}%` }}
              aria-valuenow={feedbackCount}
              aria-valuemin={0}
              aria-valuemax={currentTotalCount}
            >
              {t('Answered')}
            </div>
            <div
              className="progress-bar bg-danger"
              role="progressbar"
              aria-label={t('Feedback missing')}
              style={{ width: `${calcPercentage(currentTotalCount - feedbackCount, currentTotalCount)}%` }}
              aria-valuenow={currentTotalCount - feedbackCount}
              aria-valuemin={0}
              aria-valuemax={currentTotalCount}
            >
              {t('Missing')}
            </div>
          </div>
        </section>
      </Modal.Body>
    </Modal>
  );
};

export default InterventionStatsModal;
