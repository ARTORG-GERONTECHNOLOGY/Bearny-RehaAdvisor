import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import InterventionRemoveModal from '@/components/RehaTablePage/InterventionRemoveModal';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

// Radix RadioGroup (via @radix-ui/react-use-size) needs ResizeObserver, which jsdom
// doesn't implement.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Radix Select (occurrence dropdown) relies on pointer capture / scrollIntoView APIs
// that jsdom doesn't implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

const future1 = new Date(Date.now() + 86400000).toISOString();
const future2 = new Date(Date.now() + 2 * 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

const baseIntervention = {
  _id: 'int-1',
  title: 'Stretching',
  dates: [{ datetime: past }, { datetime: future1 }, { datetime: future2 }],
};

const defaultProps = {
  show: true,
  onHide: jest.fn(),
  onConfirm: jest.fn(),
  intervention: baseIntervention,
};

describe('InterventionRemoveModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the title and defaults to "remove all" scope', () => {
    render(<InterventionRemoveModal {...defaultProps} />);
    expect(screen.getByText('Remove intervention')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')[0]).toBeChecked();
    expect(screen.queryByText('Occurrence')).not.toBeInTheDocument();
  });

  it('does not render when show is false', () => {
    render(<InterventionRemoveModal {...defaultProps} show={false} />);
    expect(screen.queryByText('Remove intervention')).not.toBeInTheDocument();
  });

  it('confirms removal of all occurrences without a datetime', async () => {
    const onConfirm = jest.fn();
    render(<InterventionRemoveModal {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(undefined);
    });
  });

  it('calls onHide when Cancel is clicked', () => {
    const onHide = jest.fn();
    render(<InterventionRemoveModal {...defaultProps} onHide={onHide} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onHide).toHaveBeenCalled();
  });

  it('shows only future occurrences when "single occurrence" scope is selected, defaulting to the earliest', async () => {
    render(<InterventionRemoveModal {...defaultProps} />);

    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[1]); // "Remove a single occurrence"

    expect(screen.getByText('Occurrence')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));

    expect(
      await screen.findByRole('option', { name: new Date(future1).toLocaleString() })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: new Date(future2).toLocaleString() })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: new Date(past).toLocaleString() })
    ).not.toBeInTheDocument();
  });

  it('confirms removal of the selected single occurrence', async () => {
    const onConfirm = jest.fn();
    render(<InterventionRemoveModal {...defaultProps} onConfirm={onConfirm} />);

    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[1]);

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(
      await screen.findByRole('option', { name: new Date(future2).toLocaleString() })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(future2);
    });
  });

  it('disables the "single occurrence" option when there are no future dates', () => {
    render(
      <InterventionRemoveModal
        {...defaultProps}
        intervention={{ _id: 'int-2', dates: [{ datetime: past }] }}
      />
    );

    const radios = screen.getAllByRole('radio');
    expect(radios[1]).toBeDisabled();
  });

  it('resets to "all" scope each time the modal is reopened for a new intervention', () => {
    const { rerender } = render(<InterventionRemoveModal {...defaultProps} show={false} />);
    rerender(<InterventionRemoveModal {...defaultProps} show />);

    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[1]);
    expect(screen.getByText('Occurrence')).toBeInTheDocument();

    rerender(<InterventionRemoveModal {...defaultProps} show={false} />);
    rerender(
      <InterventionRemoveModal
        {...defaultProps}
        show
        intervention={{ ...baseIntervention, _id: 'int-3' }}
      />
    );

    expect(screen.getAllByRole('radio')[0]).toBeChecked();
    expect(screen.queryByText('Occurrence')).not.toBeInTheDocument();
  });
});
