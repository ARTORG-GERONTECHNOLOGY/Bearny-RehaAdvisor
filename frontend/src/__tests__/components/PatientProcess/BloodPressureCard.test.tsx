import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('recharts', () => ({
  CartesianGrid: () => null,
  Dot: (props: any) => <g data-testid="dot" data-fill={props.fill} />,
  // Exercise the `dot` render-prop so its source lines count toward coverage.
  Line: (props: any) => {
    if (typeof props.dot !== 'function') return null;
    const rendered = props.dot({
      key: 'k1',
      cx: 10,
      cy: 20,
      payload: { colors: { bpSys: '#111111', bpDia: '#222222' } },
    });
    return <g data-testid={`line-${props.dataKey}`}>{rendered}</g>;
  },
  LineChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  ReferenceLine: (props: any) => <g data-testid="reference-line" data-y={props.y} />,
  // Exercise the tickFormatter so its source line counts toward coverage.
  XAxis: (props: any) => (
    <g data-testid="xaxis" data-formatted={props.tickFormatter?.('01.05.2026')} />
  ),
  YAxis: () => null,
}));

jest.mock('@/components/ui/chart', () => ({
  ChartContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

import BloodPressureCard from '@/components/PatientProcess/BloodPressureCard';
import type { DailyMetricsDatum } from '@/hooks/usePatientProcess';

const baseThresholdLineProps = {
  stroke: '#ef4444',
  strokeWidth: 1,
  strokeDasharray: '4 4',
};

const makeData = (): DailyMetricsDatum[] => [
  {
    date: '01.05.2026',
    steps: 5000,
    activeMinutes: 30,
    sleepMinutes: 420,
    bpSys: 120,
    bpDia: 80,
    colors: {
      steps: '#22c55e',
      activeMinutes: '#22c55e',
      sleepMinutes: '#22c55e',
      bpSys: '#22c55e',
      bpDia: '#22c55e',
    },
  },
  {
    date: '02.05.2026',
    steps: 8000,
    activeMinutes: 45,
    sleepMinutes: 480,
    bpSys: null,
    bpDia: null,
    colors: {
      steps: '#22c55e',
      activeMinutes: '#22c55e',
      sleepMinutes: '#22c55e',
      bpSys: '#22c55e',
      bpDia: '#22c55e',
    },
  },
];

const baseProps = {
  title: 'Blood Pressure',
  bpSysAverage: 118,
  bpDiaAverage: 76,
  chartConfig: {},
  data: makeData(),
  yMax: 200,
  bpSysThreshold: 130,
  bpDiaThreshold: 85,
  lineColor: '#3b82f6',
  thresholdLineProps: baseThresholdLineProps,
};

describe('BloodPressureCard', () => {
  it('renders the title', () => {
    render(<BloodPressureCard {...baseProps} />);
    expect(screen.getByText('Blood Pressure')).toBeInTheDocument();
  });

  it('renders the average per day label', () => {
    render(<BloodPressureCard {...baseProps} />);
    expect(screen.getByText('Average per day')).toBeInTheDocument();
  });

  it('renders systolic and diastolic averages with unit', () => {
    const { container } = render(<BloodPressureCard {...baseProps} />);
    const valueDiv = container.querySelector('[class*="text-\\[28px\\]"]');
    const text = valueDiv?.textContent?.replace(/\s+/g, '');
    expect(text).toBe('118/76mmHg');
  });

  it('renders -- when bpSysAverage is null', () => {
    const { container } = render(<BloodPressureCard {...baseProps} bpSysAverage={null} />);
    const valueDiv = container.querySelector('[class*="text-\\[28px\\]"]');
    const text = valueDiv?.textContent?.replace(/\s+/g, '');
    expect(text).toBe('--/76mmHg');
  });

  it('renders -- when bpDiaAverage is null', () => {
    const { container } = render(<BloodPressureCard {...baseProps} bpDiaAverage={null} />);
    const valueDiv = container.querySelector('[class*="text-\\[28px\\]"]');
    const text = valueDiv?.textContent?.replace(/\s+/g, '');
    expect(text).toBe('118/--mmHg');
  });

  it('renders -- for both averages when both are null', () => {
    const { container } = render(
      <BloodPressureCard {...baseProps} bpSysAverage={null} bpDiaAverage={null} />
    );
    const valueDiv = container.querySelector('[class*="text-\\[28px\\]"]');
    const text = valueDiv?.textContent?.replace(/\s+/g, '');
    expect(text).toBe('--/--mmHg');
  });

  it('formats the x-axis tick by stripping the day portion of the date', () => {
    const { container } = render(<BloodPressureCard {...baseProps} />);
    expect(container.querySelector('[data-testid="xaxis"]')).toHaveAttribute(
      'data-formatted',
      '05.2026'
    );
  });

  it('renders both threshold reference lines when both thresholds are set', () => {
    const { container } = render(<BloodPressureCard {...baseProps} />);
    const lines = container.querySelectorAll('[data-testid="reference-line"]');
    expect(Array.from(lines).map((l) => l.getAttribute('data-y'))).toEqual(['130', '85']);
  });

  it('omits the systolic reference line when bpSysThreshold is null', () => {
    const { container } = render(<BloodPressureCard {...baseProps} bpSysThreshold={null} />);
    const lines = container.querySelectorAll('[data-testid="reference-line"]');
    expect(Array.from(lines).map((l) => l.getAttribute('data-y'))).toEqual(['85']);
  });

  it('omits the diastolic reference line when bpDiaThreshold is null', () => {
    const { container } = render(<BloodPressureCard {...baseProps} bpDiaThreshold={null} />);
    const lines = container.querySelectorAll('[data-testid="reference-line"]');
    expect(Array.from(lines).map((l) => l.getAttribute('data-y'))).toEqual(['130']);
  });

  it('renders per-point dots colored from the datum for both the systolic and diastolic lines', () => {
    const { container } = render(<BloodPressureCard {...baseProps} />);
    const sysDot = container.querySelector('[data-testid="line-bpSys"] [data-testid="dot"]');
    const diaDot = container.querySelector('[data-testid="line-bpDia"] [data-testid="dot"]');
    expect(sysDot).toHaveAttribute('data-fill', '#111111');
    expect(diaDot).toHaveAttribute('data-fill', '#222222');
  });
});
