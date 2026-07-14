import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import DailyInterventionCard from '@/components/PatientPage/DailyInterventionCard';
import { de } from 'date-fns/locale';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const mockToggleCompleted = jest.fn().mockResolvedValue(undefined);
const mockIsBusy = jest.fn(() => false);
let mockSortedInterventions: any[] = [];

jest.mock('@/hooks/useInterventions', () => ({
  useInterventions: jest.fn(() => ({
    sortedInterventions: mockSortedInterventions,
    toggleCompleted: mockToggleCompleted,
    isBusy: mockIsBusy,
  })),
}));

jest.mock('@/stores/patientInterventionsStore', () => ({
  patientInterventionsStore: {
    loading: false,
  },
}));

jest.mock(
  '@/components/PatientPage/InterventionItem',
  () =>
    function InterventionItem(props: any) {
      return (
        <div>
          <button onClick={props.onItemClick}>{props.rec.title}</button>
          <button
            onClick={(e: any) => props.onToggleComplete(e, props.rec, props.date)}
            aria-label={`toggle-${props.rec.title}`}
          >
            toggle
          </button>
          <span data-testid={`busy-${props.rec.title}`}>{String(props.isBusy)}</span>
        </div>
      );
    }
);

describe('DailyInterventionCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSortedInterventions = [];
    const store = jest.requireMock('@/stores/patientInterventionsStore').patientInterventionsStore;
    store.loading = false;
  });

  it('shows the loading skeleton while the store is loading', () => {
    const store = jest.requireMock('@/stores/patientInterventionsStore').patientInterventionsStore;
    store.loading = true;

    const { container } = render(<DailyInterventionCard date={new Date('2026-03-02')} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders the empty state when there are no interventions for the day', () => {
    render(<DailyInterventionCard date={new Date('2026-03-02')} />);
    expect(screen.getByText('No recommendation')).toBeInTheDocument();
  });

  it('uses a custom title instead of the formatted date when provided', () => {
    render(<DailyInterventionCard date={new Date('2026-03-02')} title="Custom Title" />);
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
  });

  it('formats the header from the date when no title is given', () => {
    render(<DailyInterventionCard date={new Date('2026-03-02')} />);
    expect(screen.getByText(/03\.02\.|02\.03\./)).toBeInTheDocument();
  });

  it('shows a badge when badgeText is provided, and no badge otherwise', () => {
    const { rerender } = render(
      <DailyInterventionCard date={new Date('2026-03-02')} badgeText="1/2" />
    );
    expect(screen.getByText('1/2')).toBeInTheDocument();

    rerender(<DailyInterventionCard date={new Date('2026-03-02')} />);
    expect(screen.queryByText('1/2')).not.toBeInTheDocument();
  });

  it('renders an intervention item for each sorted intervention and calls onOpenIntervention on click', () => {
    mockSortedInterventions = [{ intervention_id: 'a', title: 'Walk' }];
    const onOpenIntervention = jest.fn();
    const date = new Date('2026-03-02');

    render(<DailyInterventionCard date={date} onOpenIntervention={onOpenIntervention} />);

    fireEvent.click(screen.getByText('Walk'));
    expect(onOpenIntervention).toHaveBeenCalledWith(mockSortedInterventions[0], date);
  });

  it('does not throw when an intervention item is clicked without an onOpenIntervention handler', () => {
    mockSortedInterventions = [{ intervention_id: 'a', title: 'Walk' }];

    render(<DailyInterventionCard date={new Date('2026-03-02')} />);
    expect(() => fireEvent.click(screen.getByText('Walk'))).not.toThrow();
  });

  it('stops event propagation and calls toggleCompleted when toggling completion', () => {
    mockSortedInterventions = [{ intervention_id: 'a', title: 'Walk' }];
    const date = new Date('2026-03-02');

    render(<DailyInterventionCard date={date} />);
    fireEvent.click(screen.getByLabelText('toggle-Walk'));

    expect(mockToggleCompleted).toHaveBeenCalledWith(mockSortedInterventions[0], date);
  });

  it('passes the busy state from the hook down to each intervention item', () => {
    mockSortedInterventions = [{ intervention_id: 'a', title: 'Walk' }];
    mockIsBusy.mockReturnValue(true);

    render(<DailyInterventionCard date={new Date('2026-03-02')} />);
    expect(screen.getByTestId('busy-Walk')).toHaveTextContent('true');
  });

  it('uses the provided locale to format the header and aria-label', () => {
    render(<DailyInterventionCard date={new Date('2026-03-02')} locale={de} />);
    expect(screen.getByText(/Montag/)).toBeInTheDocument();
  });
});
