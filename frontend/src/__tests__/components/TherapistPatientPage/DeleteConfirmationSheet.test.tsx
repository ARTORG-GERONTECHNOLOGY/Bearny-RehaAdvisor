import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import DeleteConfirmationSheet from '@/components/TherapistPatientPage/DeleteConfirmationSheet';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/components/ui/dialog', () => {
  const React = jest.requireActual('react');
  return {
    Dialog: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
      open ? React.createElement(React.Fragment, null, children) : null,
    DialogContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    DialogHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    DialogTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement('h2', null, children),
    DialogDescription: ({ children }: { children: React.ReactNode }) =>
      React.createElement('p', null, children),
    DialogFooter: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
  };
});

function baseProps() {
  return {
    open: true,
    onOpenChange: jest.fn(),
    saving: false,
    onConfirm: jest.fn(),
  };
}

describe('DeleteConfirmationSheet', () => {
  it('renders nothing when closed', () => {
    render(<DeleteConfirmationSheet {...baseProps()} open={false} />);
    expect(screen.queryByText('ConfirmDeletion')).not.toBeInTheDocument();
  });

  it('renders title and description when open', () => {
    render(<DeleteConfirmationSheet {...baseProps()} />);
    expect(screen.getByText('ConfirmDeletion')).toBeInTheDocument();
    expect(screen.getByText('DeleteConfirPAt')).toBeInTheDocument();
  });

  it('calls onOpenChange(false) when Cancel is clicked', () => {
    const props = baseProps();
    render(<DeleteConfirmationSheet {...props} />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onConfirm when Delete is clicked', () => {
    const props = baseProps();
    render(<DeleteConfirmationSheet {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables the Delete button while saving', () => {
    render(<DeleteConfirmationSheet {...baseProps()} saving />);
    const button = screen.getByRole('button', { name: /Delete/ });
    expect(button).toBeDisabled();
  });
});
