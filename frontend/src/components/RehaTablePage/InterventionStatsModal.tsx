import React, { useMemo } from 'react';
import { Badge } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import StarRating from './StarRating';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableRow, TableCell } from '@/components/ui/table';

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
    <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {safeT(t, 'Statistics')}: {title}
          </DialogTitle>
        </DialogHeader>

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

        <Table>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium w-1/3">{safeT(t, 'Average rating')}</TableCell>
              <TableCell>
                {stats.avgRating > 0 ? <StarRating value={stats.avgRating} showNumber /> : '-'}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">{safeT(t, 'Feedback entries')}</TableCell>
              <TableCell>{stats.feedbackCount}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">{safeT(t, 'Video feedback')}</TableCell>
              <TableCell>{stats.videoCount}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">{safeT(t, 'Duration')}</TableCell>
              <TableCell>{stats.duration ? `${stats.duration} min` : '-'}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">{safeT(t, 'Frequency')}</TableCell>
              <TableCell>{stats.frequency || '-'}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">{safeT(t, 'Notes')}</TableCell>
              <TableCell style={{ whiteSpace: 'pre-wrap' }}>{stats.notes || '-'}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <DialogFooter>
          <Button size="dashboard" variant="secondary" onClick={onHide}>
            {safeT(t, 'Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InterventionStatsModal;
