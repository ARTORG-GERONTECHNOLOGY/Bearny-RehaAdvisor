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

import RestingHRChart, {
  averageRestingHR,
  filterRestingHRInRange,
} from '@/components/Health/charts/RestingHRChart';
import type { FitbitEntry } from '@/types/health';

const makeEntry = (date: string, restingHR: number | null): FitbitEntry => ({
  date,
  resting_heart_rate: restingHR ?? undefined,
});

describe('RestingHRChart', () => {
  it('shows the empty state when data is empty', () => {
    const { container } = render(<RestingHRChart data={[]} />);
    expect(screen.getByText('No resting heart rate data')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('shows the empty state when all entries fall outside the date range', () => {
    const data = [makeEntry('2026-01-01', 60)];
    render(
      <RestingHRChart data={data} start={new Date('2026-02-01')} end={new Date('2026-02-28')} />
    );
    expect(screen.getByText('No resting heart rate data')).toBeInTheDocument();
  });

  it('renders the chart when in-range data is present', () => {
    const data = [makeEntry('2026-01-01', 58), makeEntry('2026-01-02', 62)];
    const { container } = render(
      <RestingHRChart data={data} start={new Date('2026-01-01')} end={new Date('2026-01-31')} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('No resting heart rate data')).not.toBeInTheDocument();
  });

  it('forwards the underlying container element via ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    const data = [makeEntry('2026-01-01', 60)];
    render(<RestingHRChart ref={ref} data={data} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('shows the device hint when Fitbit entries exist but none report resting heart rate', () => {
    const data = [makeEntry('2026-01-01', null), makeEntry('2026-01-02', null)];
    render(<RestingHRChart data={data} />);
    expect(screen.getByText('No resting heart rate data')).toBeInTheDocument();
    expect(screen.getByText('hint_resting_hr_empty')).toBeInTheDocument();
  });

  it('does not show the device hint when there is no Fitbit data at all', () => {
    render(<RestingHRChart data={[]} />);
    expect(screen.queryByText('hint_resting_hr_empty')).not.toBeInTheDocument();
  });
});

describe('filterRestingHRInRange', () => {
  it('returns an empty array for empty input with no start/end', () => {
    expect(filterRestingHRInRange([])).toEqual([]);
  });

  it('fills in every day between start and end, even without a reading', () => {
    const data = [makeEntry('2026-01-01', 58), makeEntry('2026-01-03', 62)];
    const rows = filterRestingHRInRange(data, new Date('2026-01-01'), new Date('2026-01-04'));
    expect(rows).toEqual([
      { date: '2026-01-01', restingHR: 58 },
      { date: '2026-01-02', restingHR: null },
      { date: '2026-01-03', restingHR: 62 },
      { date: '2026-01-04', restingHR: null },
    ]);
  });

  it('excludes entries outside the start/end range', () => {
    const data = [makeEntry('2026-01-01', 58), makeEntry('2026-01-20', 62)];
    const rows = filterRestingHRInRange(data, new Date('2026-01-05'), new Date('2026-01-07'));
    expect(rows).toEqual([
      { date: '2026-01-05', restingHR: null },
      { date: '2026-01-06', restingHR: null },
      { date: '2026-01-07', restingHR: null },
    ]);
  });
});

describe('averageRestingHR', () => {
  it('returns null for empty input', () => {
    expect(averageRestingHR([])).toBeNull();
  });

  it('returns null when every day in range has no reading', () => {
    const data = [makeEntry('2026-01-01', null)];
    expect(averageRestingHR(data, new Date('2026-01-01'), new Date('2026-01-02'))).toBeNull();
  });

  it('averages only the non-null readings, ignoring filled gap days', () => {
    const data = [makeEntry('2026-01-01', 58), makeEntry('2026-01-03', 62)];
    const avg = averageRestingHR(data, new Date('2026-01-01'), new Date('2026-01-03'));
    expect(avg).toBe(60);
  });

  it('only averages entries within the start/end range', () => {
    const data = [
      makeEntry('2026-01-01', 10),
      makeEntry('2026-01-10', 58),
      makeEntry('2026-01-20', 62),
    ];
    const avg = averageRestingHR(data, new Date('2026-01-05'), new Date('2026-01-31'));
    expect(avg).toBe(60);
  });
});
