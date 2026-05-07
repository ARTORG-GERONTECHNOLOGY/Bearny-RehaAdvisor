import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('recharts', () => ({
  Bar: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  LabelList: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

jest.mock('@/components/ui/chart', () => ({
  ChartContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));

import RecommendationsCard from '@/components/PatientProcess/RecommendationsCard';

const baseProps = {
  title: 'Recommendations',
  doneLabel: 'Completed',
  recommendationsPct: 75,
  adherenceTotals: { completed: 3, uncompleted: 1 },
  chartConfig: {},
  doneColor: '#22c55e',
  notDoneColor: '#e4e4e7',
};

describe('RecommendationsCard', () => {
  it('renders the title', () => {
    render(<RecommendationsCard {...baseProps} />);
    expect(screen.getByText('Recommendations')).toBeInTheDocument();
  });

  it('renders the done label', () => {
    render(<RecommendationsCard {...baseProps} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders the done color indicator', () => {
    const { container } = render(<RecommendationsCard {...baseProps} />);
    const dot = container.querySelector('.rounded-full') as HTMLElement;
    expect(dot).toBeInTheDocument();
    expect(dot.style.backgroundColor).toBe('rgb(34, 197, 94)');
  });

  it('renders the percentage value', () => {
    render(<RecommendationsCard {...baseProps} />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('renders --% when recommendationsPct is null', () => {
    render(<RecommendationsCard {...baseProps} recommendationsPct={null} />);
    expect(screen.getByText('--%')).toBeInTheDocument();
  });

  it('renders 0% correctly', () => {
    render(<RecommendationsCard {...baseProps} recommendationsPct={0} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders 100% correctly', () => {
    render(<RecommendationsCard {...baseProps} recommendationsPct={100} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
