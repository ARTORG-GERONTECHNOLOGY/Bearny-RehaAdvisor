import React from 'react';
import { render, screen } from '@testing-library/react';

// D3 is ESM-only — mock before any import that pulls in utils/healthCharts.
jest.mock('d3', () => ({ timeParse: () => (s: string) => new Date(s) }));

jest.mock('recharts', () => ({
  Bar: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  BarChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  CartesianGrid: () => null,
  Cell: () => null,
  ReferenceLine: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

jest.mock('@/components/ui/chart', () => {
  const ChartContainer = React.forwardRef<HTMLDivElement, { children: React.ReactNode }>(
    ({ children }, ref) => <div ref={ref}>{children}</div>
  );
  ChartContainer.displayName = 'ChartContainer';
  return {
    ChartContainer,
    ChartTooltip: () => null,
    ChartTooltipContent: () => null,
  };
});

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

import SleepChart, {
  averageSleepMinutes,
  filterSleepInRange,
  formatSleepDuration,
} from '@/components/Health/charts/SleepChart';
import type { FitbitEntry } from '@/types/health';

const makeEntry = (
  date: string,
  minutesAsleep: number | null,
  window?: { sleepStart: string; sleepEnd: string }
): FitbitEntry => ({
  date,
  sleep:
    minutesAsleep != null
      ? {
          minutes_asleep: minutesAsleep,
          sleep_start: window?.sleepStart,
          sleep_end: window?.sleepEnd,
        }
      : undefined,
});

describe('SleepChart', () => {
  it('shows the empty state when data is empty', () => {
    const { container } = render(<SleepChart data={[]} />);
    expect(screen.getByText('No sleep data')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('shows the empty state when all entries fall outside the date range', () => {
    const data = [makeEntry('2026-01-01', 420)];
    render(<SleepChart data={data} start={new Date('2026-02-01')} end={new Date('2026-02-28')} />);
    expect(screen.getByText('No sleep data')).toBeInTheDocument();
  });

  it('shows the empty state when every day in range has no reading', () => {
    const data = [makeEntry('2026-01-01', null)];
    render(<SleepChart data={data} start={new Date('2026-01-01')} end={new Date('2026-01-03')} />);
    expect(screen.getByText('No sleep data')).toBeInTheDocument();
  });

  it('renders the chart when in-range data is present', () => {
    const data = [makeEntry('2026-01-01', 420), makeEntry('2026-01-02', 390)];
    const { container } = render(
      <SleepChart
        data={data}
        start={new Date('2026-01-01')}
        end={new Date('2026-01-31')}
        goal={420}
      />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('No sleep data')).not.toBeInTheDocument();
  });

  it('forwards the underlying svg element via ref', () => {
    const ref = React.createRef<SVGSVGElement>();
    const data = [makeEntry('2026-01-01', 420)];
    render(<SleepChart ref={ref} data={data} />);
    expect(ref.current).toBeInstanceOf(SVGSVGElement);
  });
});

describe('filterSleepInRange', () => {
  it('returns an empty array for empty input with no start/end', () => {
    expect(filterSleepInRange([])).toEqual([]);
  });

  it('fills in every day between start and end, even without a reading', () => {
    const data = [makeEntry('2026-01-01', 420), makeEntry('2026-01-03', 390)];
    const rows = filterSleepInRange(data, new Date('2026-01-01'), new Date('2026-01-04'));
    expect(rows).toEqual([
      { date: '2026-01-01', minutesAsleep: 420, sleepStart: null, sleepEnd: null },
      { date: '2026-01-02', minutesAsleep: null, sleepStart: null, sleepEnd: null },
      { date: '2026-01-03', minutesAsleep: 390, sleepStart: null, sleepEnd: null },
      { date: '2026-01-04', minutesAsleep: null, sleepStart: null, sleepEnd: null },
    ]);
  });

  it('excludes entries outside the start/end range', () => {
    const data = [makeEntry('2026-01-01', 420), makeEntry('2026-01-20', 390)];
    const rows = filterSleepInRange(data, new Date('2026-01-05'), new Date('2026-01-07'));
    expect(rows).toEqual([
      { date: '2026-01-05', minutesAsleep: null, sleepStart: null, sleepEnd: null },
      { date: '2026-01-06', minutesAsleep: null, sleepStart: null, sleepEnd: null },
      { date: '2026-01-07', minutesAsleep: null, sleepStart: null, sleepEnd: null },
    ]);
  });

  it('falls back to sleep_duration (ms) when minutes_asleep is missing, as legacy records only have it', () => {
    const data: FitbitEntry[] = [{ date: '2026-01-01', sleep: { sleep_duration: 27000000 } }]; // 7.5h
    const rows = filterSleepInRange(data, new Date('2026-01-01'), new Date('2026-01-01'));
    expect(rows).toEqual([
      { date: '2026-01-01', minutesAsleep: 450, sleepStart: null, sleepEnd: null },
    ]);
  });

  it('prefers minutes_asleep over sleep_duration when both are present', () => {
    const data: FitbitEntry[] = [
      { date: '2026-01-01', sleep: { minutes_asleep: 400, sleep_duration: 27000000 } },
    ];
    const rows = filterSleepInRange(data, new Date('2026-01-01'), new Date('2026-01-01'));
    expect(rows).toEqual([
      { date: '2026-01-01', minutesAsleep: 400, sleepStart: null, sleepEnd: null },
    ]);
  });

  it('carries the sleep window (start/end) through for the tooltip', () => {
    const data = [
      makeEntry('2026-01-01', 420, {
        sleepStart: '2026-01-01T22:00:00.000',
        sleepEnd: '2026-01-02T06:00:00.000',
      }),
    ];
    const rows = filterSleepInRange(data, new Date('2026-01-01'), new Date('2026-01-01'));
    expect(rows).toEqual([
      {
        date: '2026-01-01',
        minutesAsleep: 420,
        sleepStart: '2026-01-01T22:00:00.000',
        sleepEnd: '2026-01-02T06:00:00.000',
      },
    ]);
  });
});

describe('averageSleepMinutes', () => {
  it('returns null for empty input', () => {
    expect(averageSleepMinutes([])).toBeNull();
  });

  it('returns null when every day in range has no reading', () => {
    const data = [makeEntry('2026-01-01', null)];
    expect(averageSleepMinutes(data, new Date('2026-01-01'), new Date('2026-01-02'))).toBeNull();
  });

  it('averages only the non-null readings, ignoring filled gap days', () => {
    const data = [makeEntry('2026-01-01', 420), makeEntry('2026-01-03', 390)];
    const avg = averageSleepMinutes(data, new Date('2026-01-01'), new Date('2026-01-03'));
    expect(avg).toBe(405);
  });
});

describe('formatSleepDuration', () => {
  it('formats minutes into hours and minutes', () => {
    expect(formatSleepDuration(450)).toBe('7h 30m');
  });

  it('formats sub-hour durations as minutes only', () => {
    expect(formatSleepDuration(45)).toBe('45m');
  });
});
