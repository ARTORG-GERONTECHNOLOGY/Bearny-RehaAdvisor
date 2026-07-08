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

import ActiveMinutesChart, {
  averageActiveMinutes,
  filterActiveMinutesInRange,
} from '@/components/Health/charts/ActiveMinutesChart';
import type { FitbitEntry } from '@/types/health';

const makeEntry = (date: string, activeMinutes: number | null): FitbitEntry => ({
  date,
  active_minutes: activeMinutes ?? undefined,
});

describe('ActiveMinutesChart', () => {
  it('shows the empty state when data is empty', () => {
    const { container } = render(<ActiveMinutesChart data={[]} />);
    expect(screen.getByText('No active minutes data')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('shows the empty state when all entries fall outside the date range', () => {
    const data = [makeEntry('2026-01-01', 40)];
    render(
      <ActiveMinutesChart data={data} start={new Date('2026-02-01')} end={new Date('2026-02-28')} />
    );
    expect(screen.getByText('No active minutes data')).toBeInTheDocument();
  });

  it('shows the empty state when every day in range has no reading', () => {
    const data = [makeEntry('2026-01-01', null)];
    render(
      <ActiveMinutesChart data={data} start={new Date('2026-01-01')} end={new Date('2026-01-03')} />
    );
    expect(screen.getByText('No active minutes data')).toBeInTheDocument();
  });

  it('renders the chart when in-range data is present', () => {
    const data = [makeEntry('2026-01-01', 20), makeEntry('2026-01-02', 45)];
    const { container } = render(
      <ActiveMinutesChart
        data={data}
        start={new Date('2026-01-01')}
        end={new Date('2026-01-31')}
        goal={30}
      />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('No active minutes data')).not.toBeInTheDocument();
  });

  it('forwards the underlying container element via ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    const data = [makeEntry('2026-01-01', 40)];
    render(<ActiveMinutesChart ref={ref} data={data} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('filterActiveMinutesInRange', () => {
  it('returns an empty array for empty input with no start/end', () => {
    expect(filterActiveMinutesInRange([])).toEqual([]);
  });

  it('fills in every day between start and end, even without a reading', () => {
    const data = [makeEntry('2026-01-01', 20), makeEntry('2026-01-03', 45)];
    const rows = filterActiveMinutesInRange(data, new Date('2026-01-01'), new Date('2026-01-04'));
    expect(rows).toEqual([
      { date: '2026-01-01', activeMinutes: 20 },
      { date: '2026-01-02', activeMinutes: null },
      { date: '2026-01-03', activeMinutes: 45 },
      { date: '2026-01-04', activeMinutes: null },
    ]);
  });

  it('excludes entries outside the start/end range', () => {
    const data = [makeEntry('2026-01-01', 20), makeEntry('2026-01-20', 45)];
    const rows = filterActiveMinutesInRange(data, new Date('2026-01-05'), new Date('2026-01-07'));
    expect(rows).toEqual([
      { date: '2026-01-05', activeMinutes: null },
      { date: '2026-01-06', activeMinutes: null },
      { date: '2026-01-07', activeMinutes: null },
    ]);
  });
});

describe('averageActiveMinutes', () => {
  it('returns null for empty input', () => {
    expect(averageActiveMinutes([])).toBeNull();
  });

  it('returns null when every day in range has no reading', () => {
    const data = [makeEntry('2026-01-01', null)];
    expect(averageActiveMinutes(data, new Date('2026-01-01'), new Date('2026-01-02'))).toBeNull();
  });

  it('averages only the non-null active minutes values, ignoring filled gap days', () => {
    const data = [makeEntry('2026-01-01', 20), makeEntry('2026-01-03', 40)];
    const avg = averageActiveMinutes(data, new Date('2026-01-01'), new Date('2026-01-03'));
    expect(avg).toBe(30);
  });

  it('only averages entries within the start/end range', () => {
    const data = [
      makeEntry('2026-01-01', 5),
      makeEntry('2026-01-10', 25),
      makeEntry('2026-01-20', 35),
    ];
    const avg = averageActiveMinutes(data, new Date('2026-01-05'), new Date('2026-01-31'));
    expect(avg).toBe(30);
  });
});
