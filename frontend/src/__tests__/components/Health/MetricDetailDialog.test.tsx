import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import MetricDetailDialog from '@/components/Health/charts/MetricDetailDialog';
import type { MetricDetailColumn } from '@/components/Health/charts/MetricDetailDialog';

type Row = { date: string; steps: number | null };

const rows: Row[] = [
  { date: '2026-01-01', steps: 8000 },
  { date: '2026-01-02', steps: null },
  { date: '2026-01-03', steps: 12000 },
];

const columns: MetricDetailColumn<Row>[] = [
  { key: 'steps', header: 'Steps', format: (v) => v.toLocaleString() },
];

describe('MetricDetailDialog', () => {
  it('renders nothing (no title/table) when closed', () => {
    render(
      <MetricDetailDialog
        open={false}
        onOpenChange={jest.fn()}
        title="Steps"
        dateHeader="Date"
        emptyMessage="No steps data"
        chart={<div data-testid="chart" />}
        rows={rows}
        columns={columns}
      />
    );
    expect(screen.queryByText('Steps')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
  });

  it('renders the title, chart, and only the rows that have data when open', () => {
    render(
      <MetricDetailDialog
        open
        onOpenChange={jest.fn()}
        title="Steps"
        dateHeader="Date"
        emptyMessage="No steps data"
        chart={<div data-testid="chart" />}
        rows={rows}
        columns={columns}
      />
    );

    expect(screen.getByRole('heading', { name: 'Steps' })).toBeInTheDocument();
    expect(screen.getByTestId('chart')).toBeInTheDocument();

    // Row with a reading is shown, formatted via the column's `format`.
    expect(screen.getByText('01.01.2026')).toBeInTheDocument();
    expect(screen.getByText('8,000')).toBeInTheDocument();
    expect(screen.getByText('03.01.2026')).toBeInTheDocument();
    expect(screen.getByText('12,000')).toBeInTheDocument();

    // The null-steps day is dropped from the table entirely.
    expect(screen.queryByText('02.01.2026')).not.toBeInTheDocument();
  });

  it('shows the date range description when start/end are given', () => {
    render(
      <MetricDetailDialog
        open
        onOpenChange={jest.fn()}
        title="Steps"
        dateHeader="Date"
        emptyMessage="No steps data"
        start={new Date(2026, 0, 1)}
        end={new Date(2026, 0, 31)}
        chart={<div data-testid="chart" />}
        rows={rows}
        columns={columns}
      />
    );
    expect(screen.getByText('01.01.2026 — 31.01.2026')).toBeInTheDocument();
  });

  it('falls back to the empty message when no row has data for any column', () => {
    render(
      <MetricDetailDialog
        open
        onOpenChange={jest.fn()}
        title="Steps"
        dateHeader="Date"
        emptyMessage="No steps data"
        chart={<div data-testid="chart" />}
        rows={[{ date: '2026-01-01', steps: null }]}
        columns={columns}
      />
    );
    expect(screen.getByText('No steps data')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders "--" for a null cell in a row that has data in another column', () => {
    type BpRow = { date: string; sys: number | null; dia: number | null };
    const bpColumns: MetricDetailColumn<BpRow>[] = [
      { key: 'sys', header: 'Systolic', format: (v) => `${v}` },
      { key: 'dia', header: 'Diastolic', format: (v) => `${v}` },
    ];
    render(
      <MetricDetailDialog
        open
        onOpenChange={jest.fn()}
        title="Blood pressure"
        dateHeader="Date"
        emptyMessage="No data"
        chart={<div data-testid="chart" />}
        rows={[{ date: '2026-01-01', sys: 120, dia: null }]}
        columns={bpColumns}
      />
    );
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  it('applies a column color function as the cell text color', () => {
    const coloredColumns: MetricDetailColumn<Row>[] = [
      { key: 'steps', header: 'Steps', format: (v) => `${v}`, color: () => '#00956C' },
    ];
    render(
      <MetricDetailDialog
        open
        onOpenChange={jest.fn()}
        title="Steps"
        dateHeader="Date"
        emptyMessage="No steps data"
        chart={<div data-testid="chart" />}
        rows={[{ date: '2026-01-01', steps: 8000 }]}
        columns={coloredColumns}
      />
    );
    expect(screen.getByText('8000')).toHaveStyle({ color: '#00956C' });
  });

  it('renders the legend between the header and the chart when given', () => {
    render(
      <MetricDetailDialog
        open
        onOpenChange={jest.fn()}
        title="Steps"
        dateHeader="Date"
        emptyMessage="No steps data"
        legend={<span data-testid="legend">Goal: 10,000</span>}
        chart={<div data-testid="chart" />}
        rows={rows}
        columns={columns}
      />
    );
    expect(screen.getByTestId('legend')).toBeInTheDocument();
    expect(screen.getByText('Goal: 10,000')).toBeInTheDocument();
  });

  it('omits the legend row entirely when no legend is given', () => {
    const { container } = render(
      <MetricDetailDialog
        open
        onOpenChange={jest.fn()}
        title="Steps"
        dateHeader="Date"
        emptyMessage="No steps data"
        chart={<div data-testid="chart" />}
        rows={rows}
        columns={columns}
      />
    );
    expect(container.querySelector('.flex.flex-wrap.gap-2')).not.toBeInTheDocument();
  });

  it('calls onOpenChange(false) when the dialog is closed', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();
    render(
      <MetricDetailDialog
        open
        onOpenChange={onOpenChange}
        title="Steps"
        dateHeader="Date"
        emptyMessage="No steps data"
        chart={<div data-testid="chart" />}
        rows={rows}
        columns={columns}
      />
    );

    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
