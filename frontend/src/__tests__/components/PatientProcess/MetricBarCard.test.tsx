import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('recharts', () => ({
  Bar: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  CartesianGrid: () => null,
  Cell: () => null,
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

import MetricBarCard from '@/components/PatientProcess/MetricBarCard';
import type { DailyMetricsDatum } from '@/hooks/usePatientProcess';

const baseThresholdLineProps = {
  stroke: '#ef4444',
  strokeWidth: 1,
  strokeDasharray: '4 4',
};

const makeData = (): DailyMetricsDatum[] => [
  {
    date: '01.05.2026',
    steps: 8000,
    activeMinutes: 45,
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
    steps: 5000,
    activeMinutes: 20,
    sleepMinutes: 360,
    bpSys: null,
    bpDia: null,
    colors: {
      steps: '#f97316',
      activeMinutes: '#f97316',
      sleepMinutes: '#f97316',
      bpSys: '#f97316',
      bpDia: '#f97316',
    },
  },
];

const baseProps = {
  title: 'Steps',
  average: '6 500',
  metricKey: 'steps' as const,
  data: makeData(),
  yMax: 15000,
  threshold: 10000,
  chartConfig: {},
  thresholdLineProps: baseThresholdLineProps,
};

describe('MetricBarCard', () => {
  it('renders the title', () => {
    render(<MetricBarCard {...baseProps} />);
    expect(screen.getByText('Steps')).toBeInTheDocument();
  });

  it('renders the average per day label', () => {
    render(<MetricBarCard {...baseProps} />);
    expect(screen.getByText('Average per day')).toBeInTheDocument();
  });

  it('renders the average value', () => {
    render(<MetricBarCard {...baseProps} />);
    expect(screen.getByText('6 500')).toBeInTheDocument();
  });

  it('renders a different average value', () => {
    render(<MetricBarCard {...baseProps} average="30 min" metricKey="activeMinutes" />);
    expect(screen.getByText('30 min')).toBeInTheDocument();
  });

  it('renders without threshold (threshold null)', () => {
    render(<MetricBarCard {...baseProps} threshold={null} />);
    expect(screen.getByText('Steps')).toBeInTheDocument();
  });
});
