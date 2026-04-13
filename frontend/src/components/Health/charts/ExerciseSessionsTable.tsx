/* eslint-disable */
import React, { useMemo } from 'react';
import { Table, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FitbitEntry } from '../../../types/health';
import { isInRange } from '../../../utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start: Date;
  end: Date;
};

const formatDurationHM = (ms?: number | null): string => {
  if (!ms || ms <= 0) return '-';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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

const ExerciseSessionsTable: React.FC<Props> = ({ data, start, end }) => {
  const { t } = useTranslation();
  const rows = useMemo(() => {
    const result: {
      date: string;
      name: string;
      duration: string;
      avgHR: number | null;
      peakRange: string | null;
      peakMinutes: number | null;
      calories: number | null;
    }[] = [];

    data
      .filter((d) => isInRange(d.date, start, end))
      .forEach((d) => {
        const dateStr = d.date.slice(0, 10);
        const sessions = d.exercise?.sessions || [];

        sessions.forEach((s: any) => {
          const peak = getPeakZone(s.heartRateZones);

          result.push({
            date: dateStr,
            name: s.name || '-',
            duration: formatDurationHM(s.duration),
            avgHR: typeof s.averageHeartRate === 'number' ? s.averageHeartRate : null,
            peakRange: peak.range,
            peakMinutes: peak.minutes,
            calories: typeof s.calories === 'number' ? s.calories : null,
          });
        });
      });

    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  }, [data, start, end]);

  if (!rows.length) {
    return <div className="text-muted small">{t('No exercise sessions in this period.')}</div>;
  }

  return (
    <div style={{ maxHeight: 260, overflowY: 'auto' }}>
      <Table striped bordered hover size="sm" className="mb-0">
        <thead>
          <tr>
            <th>{t('Date')}</th>
            <th>{t('Exercise')}</th>
            <th>{t('Duration')}</th>
            <th>{t('Avg HR')}</th>

            {/* HEADLINE shows peak zone range */}
            <th>
              <OverlayTrigger
                overlay={<Tooltip>{t('Fitbit Peak heart-rate zone range (bpm)')}</Tooltip>}
              >
                <span>{t('Peak zone (bpm)')}</span>
              </OverlayTrigger>
            </th>

            {/* ROW shows minutes */}
            <th>{t('Peak minutes')}</th>

            <th>{t('Calories')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={`${r.date}-${idx}`}>
              <td>{r.date}</td>
              <td>{r.name}</td>
              <td>{r.duration}</td>
              <td>{r.avgHR ?? '-'}</td>
              <td>{r.peakRange ?? '-'}</td>
              <td>{r.peakMinutes ?? '-'}</td>
              <td>{r.calories ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};

export default ExerciseSessionsTable;
