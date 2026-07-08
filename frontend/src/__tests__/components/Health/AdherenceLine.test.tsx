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

import AdherenceLine, {
  averageAdherencePct,
  filterAdherenceInRange,
} from '@/components/Health/charts/AdherenceLine';
import type { AdherenceEntry } from '@/types/health';

const makeEntry = (date: string, pct: number | null): AdherenceEntry => ({
  date,
  scheduled: 1,
  completed: pct === null ? 0 : 1,
  pct,
});

describe('AdherenceLine', () => {
  it('shows the empty state when data is empty', () => {
    const { container } = render(<AdherenceLine data={[]} />);
    expect(screen.getByText('No adherence data')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('shows the empty state when all entries fall outside the date range', () => {
    const data = [makeEntry('2026-01-01', 80)];
    render(
      <AdherenceLine data={data} start={new Date('2026-02-01')} end={new Date('2026-02-28')} />
    );
    expect(screen.getByText('No adherence data')).toBeInTheDocument();
  });

  it('renders the chart when in-range data is present', () => {
    const data = [makeEntry('2026-01-01', 50), makeEntry('2026-01-02', 100)];
    const { container } = render(
      <AdherenceLine data={data} start={new Date('2026-01-01')} end={new Date('2026-01-31')} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('No adherence data')).not.toBeInTheDocument();
  });

  it('forwards the underlying container element via ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    const data = [makeEntry('2026-01-01', 50)];
    render(<AdherenceLine ref={ref} data={data} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('filterAdherenceInRange', () => {
  it('returns an empty array for empty input with no start/end', () => {
    expect(filterAdherenceInRange([])).toEqual([]);
  });

  it('fills in every day between start and end, even without a reading', () => {
    const data = [makeEntry('2026-01-01', 50), makeEntry('2026-01-03', 80)];
    const rows = filterAdherenceInRange(data, new Date('2026-01-01'), new Date('2026-01-04'));
    expect(rows).toEqual([
      { date: '2026-01-01', pct: 50 },
      { date: '2026-01-02', pct: null },
      { date: '2026-01-03', pct: 80 },
      { date: '2026-01-04', pct: null },
    ]);
  });

  it('excludes entries outside the start/end range', () => {
    const data = [
      makeEntry('2026-01-01', 50),
      makeEntry('2026-01-10', 80),
      makeEntry('2026-01-20', 90),
    ];
    const rows = filterAdherenceInRange(data, new Date('2026-01-09'), new Date('2026-01-11'));
    expect(rows).toEqual([
      { date: '2026-01-09', pct: null },
      { date: '2026-01-10', pct: 80 },
      { date: '2026-01-11', pct: null },
    ]);
  });

  it('defaults to the entry dates, sorted, when start/end are omitted', () => {
    const data = [makeEntry('2026-01-10', 80), makeEntry('2026-01-01', 50)];
    const rows = filterAdherenceInRange(data);
    expect(rows).toEqual([
      { date: '2026-01-01', pct: 50 },
      { date: '2026-01-10', pct: 80 },
    ]);
  });

  it('clamps out-of-bounds percentages to 0..100', () => {
    const data = [makeEntry('2026-01-01', 150), makeEntry('2026-01-02', -20)];
    const rows = filterAdherenceInRange(data);
    expect(rows).toEqual([
      { date: '2026-01-01', pct: 100 },
      { date: '2026-01-02', pct: 0 },
    ]);
  });

  it('preserves null pct values as null', () => {
    const data = [makeEntry('2026-01-01', null)];
    const rows = filterAdherenceInRange(data);
    expect(rows).toEqual([{ date: '2026-01-01', pct: null }]);
  });
});

describe('averageAdherencePct', () => {
  it('returns null for empty input', () => {
    expect(averageAdherencePct([])).toBeNull();
  });

  it('returns null when every entry in range has a null pct', () => {
    const data = [makeEntry('2026-01-01', null), makeEntry('2026-01-02', null)];
    expect(averageAdherencePct(data)).toBeNull();
  });

  it('averages only the non-null pct values', () => {
    const data = [
      makeEntry('2026-01-01', 40),
      makeEntry('2026-01-02', null),
      makeEntry('2026-01-03', 80),
    ];
    expect(averageAdherencePct(data)).toBe(60);
  });

  it('only averages entries within the start/end range', () => {
    const data = [
      makeEntry('2026-01-01', 0),
      makeEntry('2026-01-10', 100),
      makeEntry('2026-01-20', 100),
    ];
    const avg = averageAdherencePct(data, new Date('2026-01-05'), new Date('2026-01-31'));
    expect(avg).toBe(100);
  });
});
