import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ThresholdHistory from '@/components/TherapistPatientPage/ThresholdHistory';
import { ThresholdHistoryItem } from '@/stores/patientPopupStore';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/components/ui/sheet', () => {
  const React = jest.requireActual('react');
  return {
    Sheet: ({
      open,
      onOpenChange,
      children,
    }: {
      open?: boolean;
      onOpenChange: (open: boolean) => void;
      children: React.ReactNode;
    }) =>
      open
        ? React.createElement(
            'div',
            null,
            children,
            React.createElement('button', { onClick: () => onOpenChange(false) }, 'close-sheet')
          )
        : null,
    SheetContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    SheetHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    SheetTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement('h2', null, children),
    SheetDescription: ({ children }: { children: React.ReactNode }) =>
      React.createElement('p', null, children),
  };
});

function makeHistory(): ThresholdHistoryItem[] {
  return [
    {
      effective_from: '2026-01-15T10:00:00.000Z',
      changed_by: 'Dr. Smith',
      reason: 'Patient improved',
      thresholds: { steps_goal: 8000 },
    },
    {
      effective_from: '2026-02-01T10:00:00.000Z',
      changed_by: 'Dr. Jones',
      reason: null,
      thresholds: {},
    },
  ];
}

describe('ThresholdHistory', () => {
  it('renders a placeholder when there is no history', () => {
    render(<ThresholdHistory history={[]} />);
    expect(screen.getByText('No history yet.')).toBeInTheDocument();
  });

  it('renders one row per history entry with date, changed by and reason', () => {
    render(<ThresholdHistory history={makeHistory()} />);

    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(new Date('2026-01-15T10:00:00.000Z').toLocaleDateString());
    expect(rows[0]).toHaveTextContent('Dr. Smith');
    expect(rows[0]).toHaveTextContent('Patient improved');
    expect(rows[1]).toHaveTextContent(new Date('2026-02-01T10:00:00.000Z').toLocaleDateString());
    expect(rows[1]).toHaveTextContent('Dr. Jones');
    // Missing reason falls back to an em dash
    expect(rows[1]).toHaveTextContent('Reason: —');
  });

  it('does not show previous values inline', () => {
    render(<ThresholdHistory history={makeHistory()} />);
    expect(screen.queryByText(/Steps goal: 8000/)).not.toBeInTheDocument();
  });

  it('opens a sheet with the previous values when a row is clicked', () => {
    render(<ThresholdHistory history={makeHistory()} />);

    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(screen.getByText('Previous values')).toBeInTheDocument();
    expect(screen.getByTestId('threshold-history-values')).toHaveTextContent('Steps goal: 8000');
  });

  it('shows an em dash for an entry with no recorded threshold changes', () => {
    render(<ThresholdHistory history={makeHistory()} />);

    fireEvent.click(screen.getAllByRole('button')[1]);

    expect(screen.getByTestId('threshold-history-values')).toHaveTextContent('—');
  });

  it('formats all threshold fields when present', () => {
    const history: ThresholdHistoryItem[] = [
      {
        effective_from: '2026-01-15T10:00:00.000Z',
        changed_by: 'Dr. Smith',
        reason: 'Full update',
        thresholds: {
          active_minutes_green: 30,
          active_minutes_yellow: 20,
          sleep_green_min: 420,
          sleep_yellow_min: 360,
          bp_sys_green_max: 129,
          bp_sys_yellow_max: 139,
          bp_dia_green_max: 84,
          bp_dia_yellow_max: 89,
        },
      },
    ];

    render(<ThresholdHistory history={history} />);
    fireEvent.click(screen.getAllByRole('button')[0]);

    const values = screen.getByTestId('threshold-history-values');
    expect(values).toHaveTextContent('30/20');
    expect(values).toHaveTextContent('420/360');
    expect(values).toHaveTextContent('≤129/≤139');
    expect(values).toHaveTextContent('≤84/≤89');
  });

  it('falls back to "?" for a missing paired yellow value', () => {
    const history: ThresholdHistoryItem[] = [
      {
        effective_from: '2026-01-15T10:00:00.000Z',
        changed_by: 'Dr. Smith',
        reason: 'Partial',
        thresholds: { active_minutes_green: 30 },
      },
    ];

    render(<ThresholdHistory history={history} />);
    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(screen.getByTestId('threshold-history-values')).toHaveTextContent('30/?');
  });

  it('opens the sheet via keyboard (Enter and Space)', () => {
    render(<ThresholdHistory history={makeHistory()} />);
    const row = screen.getAllByRole('button')[0];

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByText('Previous values')).toBeInTheDocument();

    fireEvent.click(screen.getByText('close-sheet'));
    fireEvent.keyDown(row, { key: ' ' });
    expect(screen.getByText('Previous values')).toBeInTheDocument();
  });

  it('ignores unrelated key presses on a row', () => {
    render(<ThresholdHistory history={makeHistory()} />);
    fireEvent.keyDown(screen.getAllByRole('button')[0], { key: 'Tab' });
    expect(screen.queryByText('Previous values')).not.toBeInTheDocument();
  });

  it('shows an em dash for an entry with no effective_from date', () => {
    const history: ThresholdHistoryItem[] = [
      { effective_from: null, changed_by: 'Dr. Smith', reason: 'x', thresholds: {} },
    ];
    render(<ThresholdHistory history={history} />);
    expect(screen.getAllByRole('button')[0]).toHaveTextContent('—');
  });

  it('closes the sheet', () => {
    render(<ThresholdHistory history={makeHistory()} />);

    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByText('Previous values')).toBeInTheDocument();

    fireEvent.click(screen.getByText('close-sheet'));
    expect(screen.queryByText('Previous values')).not.toBeInTheDocument();
  });
});
