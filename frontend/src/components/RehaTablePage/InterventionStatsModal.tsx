import React from 'react';
import { Modal } from 'react-bootstrap';
import { Intervention } from '../../types'; // adjust path as needed
interface Props {
  show: boolean;
  onClose: () => void;
  exercise: Intervention;
  interventionData: Intervention; // or create a more specific type if needed
  t: (key: string) => string;
}

const InterventionStatsModal: React.FC<Props> = ({
  show,
  onClose,
  exercise,
  interventionData,
  t,
}) => {
  const totalCount = interventionData?.dates?.length || 0;
  const completedCount =
    interventionData?.dates?.filter((d) => d.status === 'completed')?.length || 0;
  const feedbackCount = interventionData?.dates?.filter((d) => d.feedback?.length > 0)?.length || 0;
  const currentTotalCount = interventionData?.currentTotalCount || 0;

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>
          {exercise?.title} {t('Information')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <strong>{t('Total Sessions')}:</strong> {totalCount}
        <br />
        <div className="mb-4">
          {/* Total Stats */}
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
              style={{ width: `${((totalCount - currentTotalCount) / totalCount) * 100 || 0}%` }}
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
