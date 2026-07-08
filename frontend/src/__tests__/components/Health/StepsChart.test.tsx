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

import StepsChart, {
  averageSteps,
  filterStepsInRange,
} from '@/components/Health/charts/StepsChart';
import type { FitbitEntry } from '@/types/health';

const makeEntry = (date: string, steps: number | null): FitbitEntry => ({
  date,
  steps: steps ?? undefined,
});

describe('StepsChart', () => {
  it('shows the empty state when data is empty', () => {
    const { container } = render(<StepsChart data={[]} />);
    expect(screen.getByText('No steps data')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('shows the empty state when all entries fall outside the date range', () => {
    const data = [makeEntry('2026-01-01', 8000)];
    render(<StepsChart data={data} start={new Date('2026-02-01')} end={new Date('2026-02-28')} />);
    expect(screen.getByText('No steps data')).toBeInTheDocument();
  });

  it('shows the empty state when every day in range has no reading', () => {
    const data = [makeEntry('2026-01-01', null)];
    render(<StepsChart data={data} start={new Date('2026-01-01')} end={new Date('2026-01-03')} />);
    expect(screen.getByText('No steps data')).toBeInTheDocument();
  });

  it('renders the chart when in-range data is present', () => {
    const data = [makeEntry('2026-01-01', 8000), makeEntry('2026-01-02', 12000)];
    const { container } = render(
      <StepsChart
        data={data}
        start={new Date('2026-01-01')}
        end={new Date('2026-01-31')}
        goal={10000}
      />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('No steps data')).not.toBeInTheDocument();
  });

  it('forwards the underlying container element via ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    const data = [makeEntry('2026-01-01', 8000)];
    render(<StepsChart ref={ref} data={data} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('filterStepsInRange', () => {
  it('returns an empty array for empty input with no start/end', () => {
    expect(filterStepsInRange([])).toEqual([]);
  });

  it('fills in every day between start and end, even without a reading', () => {
    const data = [makeEntry('2026-01-01', 8000), makeEntry('2026-01-03', 9000)];
    const rows = filterStepsInRange(data, new Date('2026-01-01'), new Date('2026-01-04'));
    expect(rows).toEqual([
      { date: '2026-01-01', steps: 8000 },
      { date: '2026-01-02', steps: null },
      { date: '2026-01-03', steps: 9000 },
      { date: '2026-01-04', steps: null },
    ]);
  });

  it('excludes entries outside the start/end range', () => {
    const data = [makeEntry('2026-01-01', 8000), makeEntry('2026-01-20', 9000)];
    const rows = filterStepsInRange(data, new Date('2026-01-05'), new Date('2026-01-07'));
    expect(rows).toEqual([
      { date: '2026-01-05', steps: null },
      { date: '2026-01-06', steps: null },
      { date: '2026-01-07', steps: null },
    ]);
  });
});

describe('averageSteps', () => {
  it('returns null for empty input', () => {
    expect(averageSteps([])).toBeNull();
  });

  it('returns null when every day in range has no reading', () => {
    const data = [makeEntry('2026-01-01', null)];
    expect(averageSteps(data, new Date('2026-01-01'), new Date('2026-01-02'))).toBeNull();
  });

  it('averages only the non-null steps values, ignoring filled gap days', () => {
    const data = [makeEntry('2026-01-01', 8000), makeEntry('2026-01-03', 12000)];
    const avg = averageSteps(data, new Date('2026-01-01'), new Date('2026-01-03'));
    expect(avg).toBe(10000);
  });

  it('only averages entries within the start/end range', () => {
    const data = [
      makeEntry('2026-01-01', 1000),
      makeEntry('2026-01-10', 9000),
      makeEntry('2026-01-20', 11000),
    ];
    const avg = averageSteps(data, new Date('2026-01-05'), new Date('2026-01-31'));
    expect(avg).toBe(10000);
  });
});
