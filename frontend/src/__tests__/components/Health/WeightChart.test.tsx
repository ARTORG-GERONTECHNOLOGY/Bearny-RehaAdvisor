import React from 'react';
import { render, screen } from '@testing-library/react';

// D3 is ESM-only — mock before any import that pulls in utils/healthCharts.
jest.mock('d3', () => ({ timeParse: () => (s: string) => new Date(s) }));

jest.mock('recharts', () => ({
  Bar: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  CartesianGrid: () => null,
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

import WeightChart, {
  averageWeight,
  filterWeightInRange,
} from '@/components/Health/charts/WeightChart';
import type { FitbitEntry } from '@/types/health';

const makeEntry = (date: string, weight: number | null): FitbitEntry => ({
  date,
  weight_kg: weight,
});

describe('WeightChart', () => {
  it('shows the empty state when data is empty', () => {
    const { container } = render(<WeightChart data={[]} />);
    expect(screen.getByText('No weight data')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('shows the empty state when all entries fall outside the date range', () => {
    const data = [makeEntry('2026-01-01', 70)];
    render(<WeightChart data={data} start={new Date('2026-02-01')} end={new Date('2026-02-28')} />);
    expect(screen.getByText('No weight data')).toBeInTheDocument();
  });

  it('shows the empty state when every day in range has no reading', () => {
    const data = [makeEntry('2026-01-01', null)];
    render(<WeightChart data={data} start={new Date('2026-01-01')} end={new Date('2026-01-03')} />);
    expect(screen.getByText('No weight data')).toBeInTheDocument();
  });

  it('renders the chart when in-range data is present', () => {
    const data = [makeEntry('2026-01-01', 70), makeEntry('2026-01-02', 71)];
    const { container } = render(
      <WeightChart data={data} start={new Date('2026-01-01')} end={new Date('2026-01-31')} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('No weight data')).not.toBeInTheDocument();
  });

  it('forwards the underlying container element via ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    const data = [makeEntry('2026-01-01', 70)];
    render(<WeightChart ref={ref} data={data} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('filterWeightInRange', () => {
  it('returns an empty array for empty input with no start/end', () => {
    expect(filterWeightInRange([])).toEqual([]);
  });

  it('fills in every day between start and end, even without a reading', () => {
    const data = [makeEntry('2026-01-01', 70), makeEntry('2026-01-03', 72)];
    const rows = filterWeightInRange(data, new Date('2026-01-01'), new Date('2026-01-04'));
    expect(rows).toEqual([
      { date: '2026-01-01', weight: 70 },
      { date: '2026-01-02', weight: null },
      { date: '2026-01-03', weight: 72 },
      { date: '2026-01-04', weight: null },
    ]);
  });

  it('excludes entries outside the start/end range', () => {
    const data = [makeEntry('2026-01-01', 70), makeEntry('2026-01-20', 75)];
    const rows = filterWeightInRange(data, new Date('2026-01-05'), new Date('2026-01-07'));
    expect(rows).toEqual([
      { date: '2026-01-05', weight: null },
      { date: '2026-01-06', weight: null },
      { date: '2026-01-07', weight: null },
    ]);
  });
});

describe('averageWeight', () => {
  it('returns null for empty input', () => {
    expect(averageWeight([])).toBeNull();
  });

  it('returns null when every day in range has no reading', () => {
    const data = [makeEntry('2026-01-01', null)];
    expect(averageWeight(data, new Date('2026-01-01'), new Date('2026-01-02'))).toBeNull();
  });

  it('averages only the non-null weight values, ignoring filled gap days', () => {
    const data = [makeEntry('2026-01-01', 70), makeEntry('2026-01-03', 72)];
    const avg = averageWeight(data, new Date('2026-01-01'), new Date('2026-01-03'));
    expect(avg).toBe(71);
  });
});
