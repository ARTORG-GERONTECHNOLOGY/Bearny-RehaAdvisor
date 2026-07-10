import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfirmModal from '@/components/common/ConfirmModal';

describe('ConfirmModal', () => {
  const baseProps = {
    show: true,
    onHide: jest.fn(),
    title: 'Delete item',
    body: 'Are you sure?',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title and body when shown', () => {
    render(<ConfirmModal {...baseProps} />);
    expect(screen.getByText('Delete item')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('does not render body content when hidden', () => {
    render(<ConfirmModal {...baseProps} show={false} />);
    expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument();
  });

  it('calls onHide when cancel button is clicked', () => {
    render(<ConfirmModal {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(baseProps.onHide).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when confirm button is clicked', () => {
    render(<ConfirmModal {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(baseProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables the confirm button when isConfirmDisabled is true', () => {
    render(<ConfirmModal {...baseProps} isConfirmDisabled />);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });
});
