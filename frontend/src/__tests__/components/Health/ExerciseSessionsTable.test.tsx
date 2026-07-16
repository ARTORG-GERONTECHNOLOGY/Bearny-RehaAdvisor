import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// D3 is ESM-only — mock before any import that pulls in utils/healthCharts.
jest.mock('d3', () => ({ timeParse: () => (s: string) => new Date(s) }));

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

import ExerciseSessionsTable from '@/components/Health/charts/ExerciseSessionsTable';
import type { FitbitEntry } from '@/types/health';

const makeEntry = (date: string, sessions: any[]): FitbitEntry =>
  ({
    date,
    exercise: { sessions } as any,
  }) as FitbitEntry;

const session = (overrides: Record<string, any> = {}) => ({
  name: 'Run',
  duration: 30 * 60000,
  averageHeartRate: 120,
  calories: 250,
  heartRateZones: [{ name: 'Peak', min: 150, max: 220, minutes: 5 }],
  ...overrides,
});

describe('ExerciseSessionsTable', () => {
  it('shows a placeholder when there is no data', () => {
    render(<ExerciseSessionsTable data={[]} date={new Date('2026-01-05')} />);
    expect(screen.getByText('No exercise sessions in this period.')).toBeInTheDocument();
  });

  it('shows a placeholder when no entries match the selected date', () => {
    const data = [makeEntry('2026-02-01', [session()])];
    render(<ExerciseSessionsTable data={data} date={new Date('2026-01-05')} />);
    expect(screen.getByText('No exercise sessions in this period.')).toBeInTheDocument();
  });

  it('shows a placeholder when the matching entry has no sessions', () => {
    const data = [makeEntry('2026-01-05', [])];
    render(<ExerciseSessionsTable data={data} date={new Date('2026-01-05')} />);
    expect(screen.getByText('No exercise sessions in this period.')).toBeInTheDocument();
  });

  it('renders one row per session with formatted values', () => {
    const data = [makeEntry('2026-01-05', [session()])];
    render(<ExerciseSessionsTable data={data} date={new Date('2026-01-05')} />);

    expect(screen.getByText('Run')).toBeInTheDocument();
    expect(screen.getByText('30m')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('150–220')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('250')).toBeInTheDocument();
  });

  it('formats durations over an hour as hours and minutes', () => {
    const data = [makeEntry('2026-01-05', [session({ duration: 90 * 60000 })])];
    render(<ExerciseSessionsTable data={data} date={new Date('2026-01-05')} />);
    expect(screen.getByText('1h 30m')).toBeInTheDocument();
  });

  it('renders a dash for missing optional fields', () => {
    const data = [
      makeEntry('2026-01-05', [
        {
          name: undefined,
          duration: undefined,
          averageHeartRate: undefined,
          calories: undefined,
          heartRateZones: undefined,
        },
      ]),
    ];
    render(<ExerciseSessionsTable data={data} date={new Date('2026-01-05')} />);

    // name '-' , duration '-', avgHR '-', peakRange '-', peakMinutes '-', calories '-'
    const dashCells = screen.getAllByText('-');
    expect(dashCells.length).toBeGreaterThanOrEqual(6);
  });

  it('renders multiple sessions for the selected date only', () => {
    const data = [
      makeEntry('2026-01-05', [session({ name: 'Bike' }), session({ name: 'Swim' })]),
      makeEntry('2026-01-10', [session({ name: 'Run' })]),
    ];
    render(<ExerciseSessionsTable data={data} date={new Date('2026-01-05')} />);

    const rows = screen.getAllByRole('row').slice(1); // skip header row
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Bike');
    expect(rows[1]).toHaveTextContent('Swim');
    expect(screen.queryByText('Run')).not.toBeInTheDocument();
  });
});
