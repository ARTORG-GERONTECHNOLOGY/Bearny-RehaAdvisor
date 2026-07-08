import React from 'react';
import { render, screen } from '@testing-library/react';

// D3 is ESM-only — mock before any import that pulls in utils/healthCharts.
jest.mock('d3', () => ({ timeParse: () => (s: string) => new Date(s) }));

jest.mock('recharts', () => ({
  Area: () => null,
  AreaChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  CartesianGrid: () => null,
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

import BloodPressureChart, {
  averageBloodPressure,
  filterBloodPressureInRange,
} from '@/components/Health/charts/BloodPressureChart';
import type { FitbitEntry } from '@/types/health';

const makeEntry = (date: string, sys: number | null, dia: number | null): FitbitEntry => ({
  date,
  bp_sys: sys,
  bp_dia: dia,
});

describe('BloodPressureChart', () => {
  it('shows the empty state when data is empty', () => {
    const { container } = render(<BloodPressureChart data={[]} />);
    expect(screen.getByText('No blood pressure data')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('shows the empty state when all entries fall outside the date range', () => {
    const data = [makeEntry('2026-01-01', 120, 80)];
    render(
      <BloodPressureChart data={data} start={new Date('2026-02-01')} end={new Date('2026-02-28')} />
    );
    expect(screen.getByText('No blood pressure data')).toBeInTheDocument();
  });

  it('shows the empty state when entries have no sys/dia reading', () => {
    const data = [makeEntry('2026-01-01', null, null)];
    render(<BloodPressureChart data={data} />);
    expect(screen.getByText('No blood pressure data')).toBeInTheDocument();
  });

  it('renders the chart when in-range data is present', () => {
    const data = [makeEntry('2026-01-01', 120, 80), makeEntry('2026-01-02', 130, 85)];
    const { container } = render(
      <BloodPressureChart data={data} start={new Date('2026-01-01')} end={new Date('2026-01-31')} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('No blood pressure data')).not.toBeInTheDocument();
  });

  it('forwards the underlying container element via ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    const data = [makeEntry('2026-01-01', 120, 80)];
    render(<BloodPressureChart ref={ref} data={data} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('renders without crashing when threshold reference lines are provided', () => {
    const data = [makeEntry('2026-01-01', 120, 80)];
    const { container } = render(
      <BloodPressureChart data={data} sysGreenMax={129} diaGreenMax={84} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

describe('filterBloodPressureInRange', () => {
  it('returns an empty array for empty input', () => {
    expect(filterBloodPressureInRange([])).toEqual([]);
  });

  it('excludes entries outside the start/end range', () => {
    const data = [
      makeEntry('2026-01-01', 120, 80),
      makeEntry('2026-01-10', 130, 85),
      makeEntry('2026-01-20', 140, 90),
    ];
    const rows = filterBloodPressureInRange(data, new Date('2026-01-05'), new Date('2026-01-15'));
    expect(rows).toEqual([{ date: '2026-01-10', sys: 130, dia: 85 }]);
  });

  it('excludes entries with no sys and no dia reading', () => {
    const data = [makeEntry('2026-01-01', null, null), makeEntry('2026-01-02', 120, null)];
    const rows = filterBloodPressureInRange(data);
    expect(rows).toEqual([{ date: '2026-01-02', sys: 120, dia: null }]);
  });

  it('preserves a null dia value alongside a sys reading', () => {
    const data = [makeEntry('2026-01-01', 120, null)];
    const rows = filterBloodPressureInRange(data);
    expect(rows).toEqual([{ date: '2026-01-01', sys: 120, dia: null }]);
  });
});

describe('averageBloodPressure', () => {
  it('returns null/null for empty input', () => {
    expect(averageBloodPressure([])).toEqual({ sys: null, dia: null });
  });

  it('averages sys and dia independently', () => {
    const data = [
      makeEntry('2026-01-01', 120, 80),
      makeEntry('2026-01-02', 130, null),
      makeEntry('2026-01-03', null, 90),
    ];
    expect(averageBloodPressure(data)).toEqual({ sys: 125, dia: 85 });
  });

  it('only averages entries within the start/end range', () => {
    const data = [
      makeEntry('2026-01-01', 100, 70),
      makeEntry('2026-01-10', 140, 90),
      makeEntry('2026-01-20', 140, 90),
    ];
    const avg = averageBloodPressure(data, new Date('2026-01-05'), new Date('2026-01-31'));
    expect(avg).toEqual({ sys: 140, dia: 90 });
  });
});
