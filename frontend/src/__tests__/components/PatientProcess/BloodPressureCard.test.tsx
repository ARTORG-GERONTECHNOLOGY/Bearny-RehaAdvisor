import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('recharts', () => ({
  CartesianGrid: () => null,
  Dot: () => null,
  Line: () => null,
  LineChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  ReferenceLine: () => null,
  XAxis: () => null,
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
});
