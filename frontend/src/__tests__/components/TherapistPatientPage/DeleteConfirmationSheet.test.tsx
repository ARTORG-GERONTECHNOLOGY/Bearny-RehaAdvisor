import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import DeleteConfirmationSheet from '@/components/TherapistPatientPage/DeleteConfirmationSheet';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/components/ui/sheet', () => {
  const React = jest.requireActual('react');
  return {
    Sheet: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
      open ? React.createElement(React.Fragment, null, children) : null,
    SheetContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    SheetHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    SheetTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement('h2', null, children),
    SheetDescription: ({ children }: { children: React.ReactNode }) =>
      React.createElement('p', null, children),
    SheetFooter: ({ children }: { children: React.ReactNode }) =>
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
