import React, { useEffect, useState, useMemo } from 'react';
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

const colorDot = (bg: string) => ({
  display: 'inline-block',
  width: 12,
  height: 12,
  borderRadius: 2,
  marginRight: 8,
  background: bg,
});

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
    interventionData?.dates?.filter((d: any) => d.status === 'completed')?.length || 0;
  const feedbackCount =
    interventionData?.dates?.filter((d: any) => (d.feedback?.length || 0) > 0)?.length || 0;

  // If your BE doesn’t send this, consider computing it from dates <= today.
  const currentTotalCount = interventionData?.currentTotalCount ?? totalCount;

  const remainingCurrent = Math.max(currentTotalCount - completedCount, 0);
  const notStarted = Math.max(totalCount - currentTotalCount, 0);
  const feedbackMissing = Math.max(currentTotalCount - feedbackCount, 0);

  useEffect(() => {
    const translateTitle = async () => {
      try {
        const { translatedText, detectedSourceLanguage } = await translateText(exercise?.title || '');
        setTranslatedTitle(translatedText || exercise?.title || '');
        setDetectedSourceLanguage(detectedSourceLanguage || '');
      } catch {
        setTranslatedTitle(exercise?.title || '');
        setDetectedSourceLanguage('');
      }
    };
    if (show) translateTitle();
  }, [exercise?.title, show]);

  const pct = (value: number, base: number) => (base > 0 ? Math.round((value / base) * 100) : 0);

  // Pre-compute percentages for clarity
  const p = useMemo(
    () => ({
      completedOfTotal: pct(completedCount, totalCount),
      remainingOfTotal: pct(remainingCurrent, totalCount),
      notStartedOfTotal: pct(notStarted, totalCount),
      completedOfCurrent: pct(completedCount, currentTotalCount),
      remainingOfCurrent: pct(remainingCurrent, currentTotalCount),
      answeredOfCurrent: pct(feedbackCount, currentTotalCount),
      missingOfCurrent: pct(feedbackMissing, currentTotalCount),
    }),
    [completedCount, remainingCurrent, notStarted, totalCount, currentTotalCount, feedbackCount, feedbackMissing]
  );

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
        {/* ===== Legend ===== */}
        <div className="mb-3" aria-label={t('Legend')}>
          <div className="d-flex flex-wrap gap-3">
            <span>
              <span style={colorDot('#198754')} aria-hidden /> {t('Completed')} ({completedCount})
            </span>
            <span>
              <span style={colorDot('#dc3545')} aria-hidden /> {t('Remaining')} ({remainingCurrent})
            </span>
            <span>
              <span style={colorDot('#ffc107')} aria-hidden /> {t('Not started')} ({notStarted})
            </span>
            <span>
              <span style={colorDot('#0d6efd')} aria-hidden /> {t('Total')} ({totalCount})
            </span>
          </div>
        </div>

        {/* ===== Overall Progress ===== */}
        <section aria-label={t('Overall Progress')} className="mb-4">
          <div className="d-flex justify-content-between align-items-center">
            <strong>{t('Total Sessions')}:</strong>
            <span className="text-muted">
              {t('Completed')}: {completedCount} ({p.completedOfTotal}%){' • '}
              {t('Remaining')}: {remainingCurrent} ({p.remainingOfTotal}%){' • '}
              {t('Not started')}: {notStarted} ({p.notStartedOfTotal}%)
            </span>
          </div>

          <div className="progress mt-2" style={{ height: '1.75rem' }}>
            <div
              className="progress-bar bg-success"
              role="progressbar"
              aria-label={t('Completed')}
              style={{ width: `${p.completedOfTotal}%` }}
              aria-valuenow={completedCount}
              aria-valuemin={0}
              aria-valuemax={totalCount}
              title={`${t('Completed')}: ${completedCount} (${p.completedOfTotal}%)`}
            >
              {completedCount} ({p.completedOfTotal}%)
            </div>
            <div
              className="progress-bar bg-danger"
              role="progressbar"
              aria-label={t('Remaining')}
              style={{ width: `${p.remainingOfTotal}%` }}
              aria-valuenow={remainingCurrent}
              aria-valuemin={0}
              aria-valuemax={totalCount}
              title={`${t('Remaining')}: ${remainingCurrent} (${p.remainingOfTotal}%)`}
            >
              {remainingCurrent} ({p.remainingOfTotal}%)
            </div>
            <div
              className="progress-bar bg-warning"
              role="progressbar"
              aria-label={t('Not Yet Started')}
              style={{ width: `${p.notStartedOfTotal}%` }}
              aria-valuenow={notStarted}
              aria-valuemin={0}
              aria-valuemax={totalCount}
              title={`${t('Not started')}: ${notStarted} (${p.notStartedOfTotal}%)`}
            >
              {notStarted} ({p.notStartedOfTotal}%)
            </div>
          </div>
        </section>

        {/* ===== Current Sessions ===== */}
        <section aria-label={t('Current Sessions')} className="mb-4">
          <div className="d-flex justify-content-between align-items-center">
            <strong>{t('Current Sessions')}:</strong>
            <span className="text-muted">
              {t('Completed')}: {completedCount} ({p.completedOfCurrent}%){' • '}
              {t('Remaining')}: {remainingCurrent} ({p.remainingOfCurrent}%)
            </span>
          </div>

          <div className="progress mt-2" style={{ height: '1.75rem' }}>
            <div
              className="progress-bar bg-success"
              role="progressbar"
              aria-label={t('Completed')}
              style={{ width: `${p.completedOfCurrent}%` }}
              aria-valuenow={completedCount}
              aria-valuemin={0}
              aria-valuemax={currentTotalCount}
              title={`${t('Completed')}: ${completedCount} (${p.completedOfCurrent}%)`}
            >
              {completedCount} ({p.completedOfCurrent}%)
            </div>
            <div
              className="progress-bar bg-danger"
              role="progressbar"
              aria-label={t('Remaining')}
              style={{ width: `${p.remainingOfCurrent}%` }}
              aria-valuenow={remainingCurrent}
              aria-valuemin={0}
              aria-valuemax={currentTotalCount}
              title={`${t('Remaining')}: ${remainingCurrent} (${p.remainingOfCurrent}%)`}
            >
              {remainingCurrent} ({p.remainingOfCurrent}%)
            </div>
          </div>
        </section>

        {/* ===== Feedback Progress ===== */}
        <section aria-label={t('Feedback Progress')}>
          <div className="d-flex justify-content-between align-items-center">
            <strong>{t('Current Feedback Answered')}:</strong>
            <span className="text-muted">
              {t('Answered')}: {feedbackCount} ({p.answeredOfCurrent}%){' • '}
              {t('Missing')}: {feedbackMissing} ({p.missingOfCurrent}%)
            </span>
          </div>

          <div className="progress mt-2" style={{ height: '1.75rem' }}>
            <div
              className="progress-bar bg-success"
              role="progressbar"
              aria-label={t('Feedback received')}
              style={{ width: `${p.answeredOfCurrent}%` }}
              aria-valuenow={feedbackCount}
              aria-valuemin={0}
              aria-valuemax={currentTotalCount}
              title={`${t('Answered')}: ${feedbackCount} (${p.answeredOfCurrent}%)`}
            >
              {feedbackCount} ({p.answeredOfCurrent}%)
            </div>
            <div
              className="progress-bar bg-danger"
              role="progressbar"
              aria-label={t('Feedback missing')}
              style={{ width: `${p.missingOfCurrent}%` }}
              aria-valuenow={feedbackMissing}
              aria-valuemin={0}
              aria-valuemax={currentTotalCount}
              title={`${t('Missing')}: ${feedbackMissing} (${p.missingOfCurrent}%)`}
            >
              {feedbackMissing} ({p.missingOfCurrent}%)
            </div>
          </div>
        </section>
      </Modal.Body>
    </Modal>
  );
};

export default InterventionStatsModal;
