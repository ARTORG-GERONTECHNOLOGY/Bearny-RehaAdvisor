import React from 'react';
import { render, screen } from '@testing-library/react';

// D3 is ESM-only — mock before any import that pulls in utils/healthCharts.
jest.mock('d3', () => ({ timeParse: () => (s: string) => new Date(s) }));

const mockArea = jest.fn(() => null);
const mockYAxis = jest.fn(() => null);

jest.mock('recharts', () => ({
  Area: (props: any) => {
    mockArea(props);
    return null;
  },
  AreaChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  XAxis: () => null,
  YAxis: (props: any) => {
    mockYAxis(props);
    return null;
  },
}));

const mockChartTooltip = jest.fn(() => null);

jest.mock('@/components/ui/chart', () => {
  const ChartContainer = React.forwardRef<HTMLDivElement, { children: React.ReactNode }>(
    ({ children }, ref) => <div ref={ref}>{children}</div>
  );
  ChartContainer.displayName = 'ChartContainer';
  return {
    ChartContainer,
    ChartTooltip: (props: any) => {
      mockChartTooltip(props);
      return null;
    },
    ChartTooltipContent: () => null,
  };
});

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

import BloodPressureChart, {
  averageBloodPressure,
  filterBloodPressureInRange,
} from '@/components/Health/charts/BloodPressureChart';
import type { FitbitEntry } from '@/types/health';
import { colors } from '@/lib/colors';

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
      <BloodPressureChart data={data} start={new Date(2026, 1, 1)} end={new Date(2026, 1, 28)} />
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
      <BloodPressureChart data={data} start={new Date(2026, 0, 1)} end={new Date(2026, 0, 31)} />
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

  describe('dot rendering', () => {
    const renderChart = (props: Partial<React.ComponentProps<typeof BloodPressureChart>> = {}) => {
      mockArea.mockClear();
      const data = [makeEntry('2026-01-01', 120, 80)];
      render(<BloodPressureChart data={data} {...props} />);
      return mockArea.mock.calls[0][0];
    };

    it('draws an empty marker when the row has no range (missing sys or dia)', () => {
      const { dot } = renderChart();
      const el = dot({
        cx: 1,
        cy: 2,
        index: 0,
        payload: { date: 'x', sys: null, dia: null, range: null },
      });
      expect(el.type).toBe('g');
    });

    it('draws an empty marker when cx/cy are not yet measured', () => {
      const { dot } = renderChart();
      const el = dot({
        cx: undefined,
        cy: undefined,
        index: 0,
        payload: { date: 'x', sys: 120, dia: 80, range: [80, 120] },
      });
      expect(el.type).toBe('g');
    });

    it('colors the dot green when both readings are within the green threshold', () => {
      const { dot } = renderChart({ sysGreenMax: 130, diaGreenMax: 85 });
      const el = dot({
        cx: 1,
        cy: 2,
        index: 0,
        payload: { date: 'x', sys: 120, dia: 80, range: [80, 120] },
      });
      expect(el.type).toBe('circle');
      expect(el.props.fill).toBe(colors.brand);
    });

    it('colors the dot yellow/red based on the worse of sys/dia tiers, with a plain default when no thresholds are set', () => {
      const { dot } = renderChart({
        sysGreenMax: 120,
        sysYellowMax: 140,
        diaGreenMax: 80,
        diaYellowMax: 90,
      });
      const yellowEl = dot({
        cx: 1,
        cy: 2,
        index: 0,
        payload: { date: 'x', sys: 130, dia: 80, range: [80, 130] },
      });
      expect(yellowEl.props.fill).toBe(colors.yellow);

      const redEl = dot({
        cx: 1,
        cy: 2,
        index: 0,
        payload: { date: 'x', sys: 200, dia: 80, range: [80, 200] },
      });
      expect(redEl.props.fill).toBe(colors.pink);

      const { dot: dotNoThresholds } = renderChart();
      const defaultEl = dotNoThresholds({
        cx: 1,
        cy: 2,
        index: 0,
        payload: { date: 'x', sys: 120, dia: 80, range: [80, 120] },
      });
      expect(defaultEl.props.fill).toBe(colors.brand);
    });
  });

  it('computes the Y-axis max from data and threshold values, falling back to 0 when thresholds are unset', () => {
    mockYAxis.mockClear();
    const data = [makeEntry('2026-01-01', 120, 80)];
    render(<BloodPressureChart data={data} />);
    const { domain } = mockYAxis.mock.calls[0][0];
    expect(domain[0]).toBe(0);
    expect(domain[1](100)).toBe(105);

    mockYAxis.mockClear();
    render(
      <BloodPressureChart
        data={data}
        sysGreenMax={130}
        diaGreenMax={90}
        sysYellowMax={140}
        diaYellowMax={95}
      />
    );
    const { domain: domainWithThresholds } = mockYAxis.mock.calls[0][0];
    expect(domainWithThresholds[1](10)).toBe(145);
  });

  it('renders the tooltip content with the systolic and diastolic readings for the hovered day', () => {
    mockChartTooltip.mockClear();
    const data = [makeEntry('2026-01-01', 120, 80)];
    render(<BloodPressureChart data={data} />);

    const { content } = mockChartTooltip.mock.calls[0][0];
    const formatted = content.props.formatter(undefined, undefined, {
      payload: { sys: 120, dia: 80 },
    });
    render(formatted);
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
  });
});

describe('filterBloodPressureInRange', () => {
  it('returns an empty array for empty input', () => {
    expect(filterBloodPressureInRange([])).toEqual([]);
  });

  it('excludes entries outside the start/end range, filling remaining days with null', () => {
    const data = [
      makeEntry('2026-01-01', 120, 80),
      makeEntry('2026-01-10', 130, 85),
      makeEntry('2026-01-20', 140, 90),
    ];
    const rows = filterBloodPressureInRange(data, new Date(2026, 0, 9), new Date(2026, 0, 11));
    expect(rows).toEqual([
      { date: '2026-01-09', sys: null, dia: null },
      { date: '2026-01-10', sys: 130, dia: 85 },
      { date: '2026-01-11', sys: null, dia: null },
    ]);
  });

  it('fills in every day between start and end, even without a reading', () => {
    const data = [makeEntry('2026-01-01', 120, 80), makeEntry('2026-01-03', 130, 85)];
    const rows = filterBloodPressureInRange(data, new Date(2026, 0, 1), new Date(2026, 0, 4));
    expect(rows).toEqual([
      { date: '2026-01-01', sys: 120, dia: 80 },
      { date: '2026-01-02', sys: null, dia: null },
      { date: '2026-01-03', sys: 130, dia: 85 },
      { date: '2026-01-04', sys: null, dia: null },
    ]);
  });

  it('keeps a day with no sys/dia reading as nulls rather than dropping it', () => {
    const data = [makeEntry('2026-01-01', null, null), makeEntry('2026-01-02', 120, null)];
    const rows = filterBloodPressureInRange(data);
    expect(rows).toEqual([
      { date: '2026-01-01', sys: null, dia: null },
      { date: '2026-01-02', sys: 120, dia: null },
    ]);
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
    const avg = averageBloodPressure(data, new Date(2026, 0, 5), new Date(2026, 0, 31));
    expect(avg).toEqual({ sys: 140, dia: 90 });
  });
});
