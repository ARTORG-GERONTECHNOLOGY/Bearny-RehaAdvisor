import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('recharts', () => ({
  Bar: ({ children }: { children?: React.ReactNode }) => <g>{children}</g>,
  BarChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  LabelList: ({ content }: { content?: (props: any) => React.ReactNode }) =>
    content ? <>{content({ x: 10, y: 20, height: 30, value: 42 })}</> : null,
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

  it('renders bar labels with the value text when there are completed items', () => {
    render(
      <RecommendationsCard {...baseProps} adherenceTotals={{ completed: 3, uncompleted: 1 }} />
    );
    // Two <LabelList> render, one per <Bar> (completed and uncompleted)
    expect(screen.getAllByText('42')).toHaveLength(2);
  });

  it('omits bar labels when there are zero completed items', () => {
    render(
      <RecommendationsCard {...baseProps} adherenceTotals={{ completed: 0, uncompleted: 0 }} />
    );
    expect(screen.queryByText('42')).not.toBeInTheDocument();
  });
});
