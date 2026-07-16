/* eslint-disable */
import React, { useMemo } from 'react';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FitbitEntry } from '@/types/health';
import { isInRange } from '@/utils/healthCharts';
import { formatDurationMs } from '@/utils/dateFormat';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Props = {
  data: FitbitEntry[];
  date: Date;
};

const formatDurationHM = (ms?: number | null): string => {
  if (!ms || ms <= 0) return '-';
  return formatDurationMs(ms);
};

const getPeakZone = (zones?: any[]): { range: string | null; minutes: number | null } => {
  if (!Array.isArray(zones)) return { range: null, minutes: null };

  const peak = zones.find((z) => z.name?.toLowerCase() === 'peak');
  if (!peak) return { range: null, minutes: null };

  const range =
    typeof peak.min === 'number' && typeof peak.max === 'number' ? `${peak.min}–${peak.max}` : null;

  return {
    range,
    minutes: typeof peak.minutes === 'number' ? peak.minutes : null,
  };
};

const ExerciseSessionsTable: React.FC<Props> = ({ data, date }) => {
  const { t } = useTranslation();
  const rows = useMemo(() => {
    const result: {
      name: string;
      duration: string;
      avgHR: number | null;
      peakRange: string | null;
      peakMinutes: number | null;
      calories: number | null;
    }[] = [];

    data
      .filter((d) => isInRange(d.date, date, date))
      .forEach((d) => {
        const sessions = d.exercise?.sessions || [];

        sessions.forEach((s: any) => {
          const peak = getPeakZone(s.heartRateZones);

          result.push({
            name: s.name || '-',
            duration: formatDurationHM(s.duration),
            avgHR: typeof s.averageHeartRate === 'number' ? s.averageHeartRate : null,
            peakRange: peak.range,
            peakMinutes: peak.minutes,
            calories: typeof s.calories === 'number' ? s.calories : null,
          });
        });
      });

    return result;
  }, [data, date]);

  if (!rows.length) {
    return <div className="text-muted small">{t('No exercise sessions in this period.')}</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('Exercise')}</TableHead>
          <TableHead>{t('Duration')}</TableHead>
          <TableHead>{t('Avg HR')}</TableHead>
          <TableHead>
            <OverlayTrigger
              overlay={<Tooltip>{t('Fitbit Peak heart-rate zone range (bpm)')}</Tooltip>}
            >
              <span>{t('Peak zone (bpm)')}</span>
            </OverlayTrigger>
          </TableHead>
          <TableHead>{t('Peak minutes')}</TableHead>
          <TableHead>{t('Calories')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, idx) => (
          <TableRow key={idx}>
            <TableCell>{r.name}</TableCell>
            <TableCell>{r.duration}</TableCell>
            <TableCell>{r.avgHR ?? '-'}</TableCell>
            <TableCell>{r.peakRange ?? '-'}</TableCell>
            <TableCell>{r.peakMinutes ?? '-'}</TableCell>
            <TableCell>{r.calories ?? '-'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default ExerciseSessionsTable;
