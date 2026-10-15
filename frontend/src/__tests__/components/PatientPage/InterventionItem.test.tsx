import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import InterventionItem from '@/components/PatientPage/InterventionItem';
import { patientInterventionsStore } from '@/stores/patientInterventionsStore';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/stores/patientInterventionsStore', () => ({
  patientInterventionsStore: {
    isCompletedOn: jest.fn(() => false),
    isAccessedOn: jest.fn(() => false),
  },
}));

const store = patientInterventionsStore as unknown as {
  isCompletedOn: jest.Mock;
  isAccessedOn: jest.Mock;
};

const rec = {
  intervention_id: 'int-1',
  intervention_title: 'Morning Stretch',
  dates: [],
} as any;

// SVG imports share one mock, so the toggle's icon is told apart by its colour.
const toggleIconClass = (name: string) =>
  screen.getByRole('button', { name }).querySelector('svg')?.getAttribute('class');

const renderItem = (props: Partial<React.ComponentProps<typeof InterventionItem>> = {}) => {
  const handlers = { onItemClick: jest.fn(), onToggleComplete: jest.fn() };
  render(
    <InterventionItem
      rec={rec}
      date={new Date(2026, 0, 5)}
      isBusy={false}
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe('InterventionItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    store.isCompletedOn.mockReturnValue(false);
    store.isAccessedOn.mockReturnValue(false);
  });

  it('shows the half-filled icon for an opened but not completed intervention', () => {
    store.isAccessedOn.mockReturnValue(true);
    renderItem();
    expect(toggleIconClass('Mark as complete')).toContain('text-zinc-400');
    expect(screen.getByRole('button', { name: /Morning Stretch/ })).toHaveAccessibleName(
      'Morning Stretch. Opened, not completed'
    );
  });

  it('shows the completed state instead when it was opened and completed', () => {
    store.isCompletedOn.mockReturnValue(true);
    store.isAccessedOn.mockReturnValue(true);
    renderItem();
    expect(toggleIconClass('Mark as incomplete')).toContain('text-ok');
  });

  it('shows neither for an unopened intervention', () => {
    renderItem();
    expect(toggleIconClass('Mark as complete')).toContain('text-zinc-200');
    expect(screen.getByRole('button', { name: /Morning Stretch/ })).toHaveAccessibleName(
      'Morning Stretch. Not completed'
    );
  });

  it('still toggles completion from the accessed state', () => {
    store.isAccessedOn.mockReturnValue(true);
    const { onToggleComplete } = renderItem();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as complete' }));
    expect(onToggleComplete).toHaveBeenCalledWith(expect.anything(), rec, expect.any(Date));
  });
});
