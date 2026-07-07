import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import HealthViewControls from '@/components/Health/HealthViewControls';
import type { HealthPageStore } from '@/stores/healthPageStore';

const t = (key: string) => key;
const formatRangeLabel = (start: Date, end: Date) => `${start.toISOString()} - ${end.toISOString()}`;

const makeStore = (overrides: Partial<HealthPageStore> = {}): HealthPageStore =>
  ({
    viewMode: 'monthly',
    viewStart: new Date('2024-01-01'),
    viewEnd: new Date('2024-01-31'),
    goPrev: jest.fn(),
    goNext: jest.fn(),
    setViewMode: jest.fn(),
    ...overrides,
  }) as unknown as HealthPageStore;

describe('HealthViewControls', () => {
  it('renders the formatted range label', () => {
    const store = makeStore();
    render(
      <HealthViewControls
        store={store}
        t={t}
        formatRangeLabel={formatRangeLabel}
        onExportClick={jest.fn()}
      />
    );

    expect(
      screen.getByText(formatRangeLabel(store.viewStart, store.viewEnd), { exact: false })
    ).toBeInTheDocument();
  });

  it('calls store.goPrev / store.goNext when the nav arrows are clicked', () => {
    const store = makeStore();
    render(
      <HealthViewControls
        store={store}
        t={t}
        formatRangeLabel={formatRangeLabel}
        onExportClick={jest.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText('Previous'));
    expect(store.goPrev).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Next'));
    expect(store.goNext).toHaveBeenCalledTimes(1);
  });

  it('marks the active view mode and calls setViewMode when a different one is clicked', () => {
    const store = makeStore({ viewMode: 'monthly' });
    render(
      <HealthViewControls
        store={store}
        t={t}
        formatRangeLabel={formatRangeLabel}
        onExportClick={jest.fn()}
      />
    );

    const weekly = screen.getByTestId('view-mode-weekly');
    const monthly = screen.getByTestId('view-mode-monthly');

    expect(monthly).toHaveAttribute('aria-pressed', 'true');
    expect(weekly).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(weekly);
    expect(store.setViewMode).toHaveBeenCalledWith('weekly');
  });

  it('calls onExportClick when the export button is clicked', () => {
    const store = makeStore();
    const onExportClick = jest.fn();
    render(
      <HealthViewControls
        store={store}
        t={t}
        formatRangeLabel={formatRangeLabel}
        onExportClick={onExportClick}
      />
    );

    fireEvent.click(screen.getByTestId('view-controls-export'));
    expect(onExportClick).toHaveBeenCalledTimes(1);
  });
});
