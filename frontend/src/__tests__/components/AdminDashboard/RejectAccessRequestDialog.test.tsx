import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RejectAccessRequestDialog from '@/components/AdminDashboard/RejectAccessRequestDialog';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const defaultProps = {
  open: true,
  note: '',
  submitting: false,
  onNoteChange: jest.fn(),
  onCancel: jest.fn(),
  onSubmit: jest.fn(),
};

describe('RejectAccessRequestDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(<RejectAccessRequestDialog {...defaultProps} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title and note textarea', () => {
    render(<RejectAccessRequestDialog {...defaultProps} />);
    expect(screen.getByText('Decline access change request')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Explain why the request is being declined...')
    ).toBeInTheDocument();
  });

  it('calls onNoteChange when typing in the textarea', () => {
    render(<RejectAccessRequestDialog {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('Explain why the request is being declined...'), {
      target: { value: 'Not enough info' },
    });
    expect(defaultProps.onNoteChange).toHaveBeenCalledWith('Not enough info');
  });

  it('calls onCancel when Cancel is clicked', () => {
    render(<RejectAccessRequestDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('calls onSubmit when Decline is clicked', () => {
    render(<RejectAccessRequestDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(defaultProps.onSubmit).toHaveBeenCalled();
  });

  it('calls onCancel when closed via the header close button', () => {
    render(<RejectAccessRequestDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('shows "Declining..." and disables buttons while submitting', () => {
    render(<RejectAccessRequestDialog {...defaultProps} submitting />);
    expect(screen.getByRole('button', { name: 'Declining...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
