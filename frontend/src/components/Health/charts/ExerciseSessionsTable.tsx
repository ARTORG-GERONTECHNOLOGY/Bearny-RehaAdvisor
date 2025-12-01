/* eslint-disable */
import React, { useMemo } from 'react';
import { Table } from 'react-bootstrap';
import { FitbitEntry } from '../../../types/health';
import { isInRange } from '../../../utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start: Date;
  end: Date;
};

const ExerciseSessionsTable: React.FC<Props> = ({ data, start, end }) => {
  const rows = useMemo(() => {
    const result: {
      date: string;
      name: string;
      durationMin: number | null;
      avgHR: number | null;
      maxHR: number | null;
      calories: number | null;
    }[] = [];

    data
      .filter((d) => isInRange(d.date, start, end))
      .forEach((d) => {
        const dateStr = d.date.slice(0, 10);
        const sessions = d.exercise?.sessions || [];
        sessions.forEach((s: any) => {
          const durMin =
            typeof s.duration === 'number'
              ? +(s.duration / 60000).toFixed(1)
              : null;
          result.push({
            date: dateStr,
            name: s.name || '',
            durationMin: durMin,
            avgHR:
              typeof s.averageHeartRate === 'number'
                ? s.averageHeartRate
                : null,
            maxHR:
              typeof s.maxHeartRate === 'number'
                ? s.maxHeartRate
                : null,
            calories:
              typeof s.calories === 'number' ? s.calories : null,
          });
        });
      });

    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  }, [data, start, end]);

  if (!rows.length) {
    return <div className="text-muted small">No exercise sessions in this period.</div>;
  }

  return (
    <div style={{ maxHeight: 260, overflowY: 'auto' }}>
      <Table striped bordered hover size="sm" className="mb-0">
        <thead>
          <tr>
            <th>Date</th>
            <th>Exercise</th>
            <th>Duration (min)</th>
            <th>Avg HR</th>
            <th>Max HR</th>
            <th>Calories</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={`${r.date}-${idx}`}>
              <td>{r.date}</td>
              <td>{r.name || '-'}</td>
              <td>{r.durationMin ?? '-'}</td>
              <td>{r.avgHR ?? '-'}</td>
              <td>{r.maxHR ?? '-'}</td>
              <td>{r.calories ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};

export default ExerciseSessionsTable;
