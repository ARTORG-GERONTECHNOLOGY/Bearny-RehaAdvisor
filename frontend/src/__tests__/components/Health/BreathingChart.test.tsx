import React from 'react';
import { render, screen } from '@testing-library/react';

// D3 is ESM-only — mock before any import that pulls in utils/healthCharts.
jest.mock('d3', () => ({ timeParse: () => (s: string) => new Date(s) }));

jest.mock('recharts', () => ({
  Area: () => null,
  AreaChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
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

import BreathingChart, {
  averageBreathingRate,
  filterBreathingInRange,
} from '@/components/Health/charts/BreathingChart';
import type { FitbitEntry } from '@/types/health';

const makeEntry = (date: string, breathingRate: number | null): FitbitEntry => ({
  date,
  breathing_rate: breathingRate != null ? { breathingRate } : undefined,
});

describe('BreathingChart', () => {
  it('shows the empty state when data is empty', () => {
    const { container } = render(<BreathingChart data={[]} />);
    expect(screen.getByText('No breathing rate data')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('shows the empty state when all entries fall outside the date range', () => {
    const data = [makeEntry('2026-01-01', 15)];
    render(
      <BreathingChart data={data} start={new Date('2026-02-01')} end={new Date('2026-02-28')} />
    );
    expect(screen.getByText('No breathing rate data')).toBeInTheDocument();
  });

  it('renders the chart when in-range data is present', () => {
    const data = [makeEntry('2026-01-01', 14), makeEntry('2026-01-02', 16)];
    const { container } = render(
      <BreathingChart data={data} start={new Date('2026-01-01')} end={new Date('2026-01-31')} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('No breathing rate data')).not.toBeInTheDocument();
  });

  it('forwards the underlying svg element via ref', () => {
    const ref = React.createRef<SVGSVGElement>();
    const data = [makeEntry('2026-01-01', 15)];
    render(<BreathingChart ref={ref} data={data} />);
    expect(ref.current).toBeInstanceOf(SVGSVGElement);
  });

  it('shows the device hint when Fitbit entries exist but none report breathing rate', () => {
    const data = [makeEntry('2026-01-01', null), makeEntry('2026-01-02', null)];
    render(<BreathingChart data={data} />);
    expect(screen.getByText('No breathing rate data')).toBeInTheDocument();
    expect(screen.getByText('hint_breathing_rate_empty')).toBeInTheDocument();
  });

  it('does not show the device hint when there is no Fitbit data at all', () => {
    render(<BreathingChart data={[]} />);
    expect(screen.queryByText('hint_breathing_rate_empty')).not.toBeInTheDocument();
  });
});

describe('filterBreathingInRange', () => {
  it('returns an empty array for empty input with no start/end', () => {
    expect(filterBreathingInRange([])).toEqual([]);
  });

  it('fills in every day between start and end, even without a reading', () => {
    const data = [makeEntry('2026-01-01', 14), makeEntry('2026-01-03', 16)];
    const rows = filterBreathingInRange(data, new Date('2026-01-01'), new Date('2026-01-04'));
    expect(rows).toEqual([
      { date: '2026-01-01', breathingRate: 14 },
      { date: '2026-01-02', breathingRate: null },
      { date: '2026-01-03', breathingRate: 16 },
      { date: '2026-01-04', breathingRate: null },
    ]);
  });

  it('excludes entries outside the start/end range', () => {
    const data = [makeEntry('2026-01-01', 14), makeEntry('2026-01-20', 16)];
    const rows = filterBreathingInRange(data, new Date('2026-01-05'), new Date('2026-01-07'));
    expect(rows).toEqual([
      { date: '2026-01-05', breathingRate: null },
      { date: '2026-01-06', breathingRate: null },
      { date: '2026-01-07', breathingRate: null },
    ]);
  });
});

describe('averageBreathingRate', () => {
  it('returns null for empty input', () => {
    expect(averageBreathingRate([])).toBeNull();
  });

  it('returns null when every day in range has no reading', () => {
    const data = [makeEntry('2026-01-01', null)];
    expect(averageBreathingRate(data, new Date('2026-01-01'), new Date('2026-01-02'))).toBeNull();
  });

  it('averages only the non-null readings, ignoring filled gap days', () => {
    const data = [makeEntry('2026-01-01', 14), makeEntry('2026-01-03', 16)];
    const avg = averageBreathingRate(data, new Date('2026-01-01'), new Date('2026-01-03'));
    expect(avg).toBe(15);
  });

  it('only averages entries within the start/end range', () => {
    const data = [
      makeEntry('2026-01-01', 5),
      makeEntry('2026-01-10', 14),
      makeEntry('2026-01-20', 16),
    ];
    const avg = averageBreathingRate(data, new Date('2026-01-05'), new Date('2026-01-31'));
    expect(avg).toBe(15);
  });
});
