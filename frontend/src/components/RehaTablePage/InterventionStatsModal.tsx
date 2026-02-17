import React, { useMemo } from 'react';
import { Modal, Button, Table, Badge } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

type AnyObj = Record<string, any>;

interface Props {
  show: boolean;
  onHide: () => void;
  intervention: AnyObj; // merged intervention (catalog + assigned)
  patientData: AnyObj; // plan payload
}

const safeT = (t: any, key: string) => {
  const v = t(key);
  return typeof v === 'string' ? v : key;
};

const asArray = (v: any) => (Array.isArray(v) ? v : []);

const InterventionStatsModal: React.FC<Props> = ({ show, onHide, intervention, patientData }) => {
  const { t } = useTranslation();

  const stats = useMemo(() => {
    const id = intervention?._id;
    const assigned =
      asArray(patientData?.interventions).find((x: any) => x?._id === id) || intervention;

    const dates = asArray(assigned?.dates);

    let completed = 0;
    let missed = 0;
    let today = 0;
    let upcoming = 0;

    let feedbackCount = 0;
    let videoCount = 0;

    dates.forEach((d: any) => {
      const st = String(d?.status || '').toLowerCase();
      if (st === 'completed') completed += 1;
      else if (st === 'missed') missed += 1;
      else if (st === 'today') today += 1;
      else upcoming += 1;

      feedbackCount += asArray(d?.feedback).length;
      if (d?.video?.video_url) videoCount += 1;
    });

    const total = dates.length;

    const avgRating =
      typeof assigned?.averageRating === 'number'
        ? assigned.averageRating
        : typeof intervention?.averageRating === 'number'
          ? intervention.averageRating
          : 0;

    const duration = assigned?.duration ?? intervention?.duration ?? 0;

    return {
      total,
      completed,
      missed,
      today,
      upcoming,
      feedbackCount,
      videoCount,
      avgRating,
      duration,
      frequency: assigned?.frequency || '',
      notes: assigned?.notes || '',
    };
  }, [intervention, patientData]);

  const title = intervention?.title || safeT(t, 'Intervention');

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          {safeT(t, 'Statistics')}: {title}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <div className="d-flex flex-wrap gap-2 mb-3">
          <Badge bg="secondary">
            {safeT(t, 'Total')}: {stats.total}
          </Badge>
          <Badge bg="success">
            {safeT(t, 'Completed')}: {stats.completed}
          </Badge>
          <Badge bg="danger">
            {safeT(t, 'Missed')}: {stats.missed}
          </Badge>
          <Badge bg="primary">
            {safeT(t, 'Today')}: {stats.today}
          </Badge>
          <Badge bg="warning" text="dark">
            {safeT(t, 'Upcoming')}: {stats.upcoming}
          </Badge>
        </div>

        <Table bordered responsive className="mb-0">
          <tbody>
            <tr>
              <th style={{ width: 220 }}>{safeT(t, 'Average rating')}</th>
              <td>{stats.avgRating}</td>
            </tr>
            <tr>
              <th>{safeT(t, 'Feedback entries')}</th>
              <td>{stats.feedbackCount}</td>
            </tr>
            <tr>
              <th>{safeT(t, 'Video feedback')}</th>
              <td>{stats.videoCount}</td>
            </tr>
            <tr>
              <th>{safeT(t, 'Duration')}</th>
              <td>{stats.duration ? `${stats.duration} min` : '-'}</td>
            </tr>
            <tr>
              <th>{safeT(t, 'Frequency')}</th>
              <td>{stats.frequency || '-'}</td>
            </tr>
            <tr>
              <th>{safeT(t, 'Notes')}</th>
              <td style={{ whiteSpace: 'pre-wrap' }}>{stats.notes || '-'}</td>
            </tr>
          </tbody>
        </Table>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          {safeT(t, 'Close')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default InterventionStatsModal;
