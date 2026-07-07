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

import WearTimeChart, {
  averageWearTime,
  filterWearTimeInRange,
} from '@/components/Health/charts/WearTimeChart';
import type { FitbitEntry } from '@/types/health';

const makeEntry = (date: string, wearTime: number | null): FitbitEntry => ({
  date,
  wear_time_minutes: wearTime ?? undefined,
});

describe('WearTimeChart', () => {
  it('shows the empty state when data is empty', () => {
    const { container } = render(<WearTimeChart data={[]} />);
    expect(screen.getByText('No wear time data')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('shows the empty state when all entries fall outside the date range', () => {
    const data = [makeEntry('2026-01-01', 800)];
    render(
      <WearTimeChart data={data} start={new Date('2026-02-01')} end={new Date('2026-02-28')} />
    );
    expect(screen.getByText('No wear time data')).toBeInTheDocument();
  });

  it('shows the empty state when every day in range has no reading', () => {
    const data = [makeEntry('2026-01-01', null)];
    render(
      <WearTimeChart data={data} start={new Date('2026-01-01')} end={new Date('2026-01-03')} />
    );
    expect(screen.getByText('No wear time data')).toBeInTheDocument();
  });

  it('renders the chart when in-range data is present', () => {
    const data = [makeEntry('2026-01-01', 800), makeEntry('2026-01-02', 1200)];
    const { container } = render(
      <WearTimeChart data={data} start={new Date('2026-01-01')} end={new Date('2026-01-31')} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('No wear time data')).not.toBeInTheDocument();
  });

  it('forwards the underlying svg element via ref', () => {
    const ref = React.createRef<SVGSVGElement>();
    const data = [makeEntry('2026-01-01', 800)];
    render(<WearTimeChart ref={ref} data={data} />);
    expect(ref.current).toBeInstanceOf(SVGSVGElement);
  });

  it('shows the device hint when Fitbit entries exist but none report wear time', () => {
    const data = [makeEntry('2026-01-01', null), makeEntry('2026-01-02', null)];
    render(<WearTimeChart data={data} />);
    expect(screen.getByText('No wear time data')).toBeInTheDocument();
    expect(screen.getByText('hint_wear_time_empty')).toBeInTheDocument();
  });

  it('does not show the device hint when there is no Fitbit data at all', () => {
    render(<WearTimeChart data={[]} />);
    expect(screen.queryByText('hint_wear_time_empty')).not.toBeInTheDocument();
  });
});

describe('filterWearTimeInRange', () => {
  it('returns an empty array for empty input with no start/end', () => {
    expect(filterWearTimeInRange([])).toEqual([]);
  });

  it('fills in every day between start and end, even without a reading', () => {
    const data = [makeEntry('2026-01-01', 800), makeEntry('2026-01-03', 900)];
    const rows = filterWearTimeInRange(data, new Date('2026-01-01'), new Date('2026-01-04'));
    expect(rows).toEqual([
      { date: '2026-01-01', wearTime: 800 },
      { date: '2026-01-02', wearTime: null },
      { date: '2026-01-03', wearTime: 900 },
      { date: '2026-01-04', wearTime: null },
    ]);
  });

  it('excludes entries outside the start/end range', () => {
    const data = [makeEntry('2026-01-01', 800), makeEntry('2026-01-20', 900)];
    const rows = filterWearTimeInRange(data, new Date('2026-01-05'), new Date('2026-01-07'));
    expect(rows).toEqual([
      { date: '2026-01-05', wearTime: null },
      { date: '2026-01-06', wearTime: null },
      { date: '2026-01-07', wearTime: null },
    ]);
  });
});

describe('averageWearTime', () => {
  it('returns null for empty input', () => {
    expect(averageWearTime([])).toBeNull();
  });

  it('returns null when every day in range has no reading', () => {
    const data = [makeEntry('2026-01-01', null)];
    expect(averageWearTime(data, new Date('2026-01-01'), new Date('2026-01-02'))).toBeNull();
  });

  it('averages only the non-null wear-time values, ignoring filled gap days', () => {
    const data = [makeEntry('2026-01-01', 800), makeEntry('2026-01-03', 1200)];
    const avg = averageWearTime(data, new Date('2026-01-01'), new Date('2026-01-03'));
    expect(avg).toBe(1000);
  });

  it('only averages entries within the start/end range', () => {
    const data = [
      makeEntry('2026-01-01', 100),
      makeEntry('2026-01-10', 900),
      makeEntry('2026-01-20', 1100),
    ];
    const avg = averageWearTime(data, new Date('2026-01-05'), new Date('2026-01-31'));
    expect(avg).toBe(1000);
  });
});
