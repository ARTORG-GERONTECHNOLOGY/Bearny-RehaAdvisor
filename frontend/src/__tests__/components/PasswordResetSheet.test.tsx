import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PasswordResetSheet from '@/components/TherapistPatientPage/PasswordResetSheet';

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
    passwordNew: '',
    passwordConfirm: '',
    passwordError: null as string | null,
    passwordSuccess: false,
    passwordSaving: false,
    onPasswordNewChange: jest.fn(),
    onPasswordConfirmChange: jest.fn(),
    onSubmit: jest.fn(),
  };
}

describe('PasswordResetSheet', () => {
  it('renders nothing when closed', () => {
    render(<PasswordResetSheet {...baseProps()} open={false} />);
    expect(screen.queryByText('ResetPassword')).not.toBeInTheDocument();
  });

  it('renders title, description and fields when open', () => {
    render(<PasswordResetSheet {...baseProps()} />);
    expect(screen.getByText('ResetPassword')).toBeInTheDocument();
    expect(screen.getByText('PasswordStrengthHint')).toBeInTheDocument();
    expect(screen.getByText('NewPassword')).toBeInTheDocument();
    expect(screen.getByText('ConfirmPassword')).toBeInTheDocument();
  });

  it('calls onPasswordNewChange and onPasswordConfirmChange when typing', () => {
    const props = baseProps();
    render(<PasswordResetSheet {...props} />);

    fireEvent.change(screen.getByLabelText('NewPassword'), {
      target: { value: 'newpass' },
    });
    expect(props.onPasswordNewChange).toHaveBeenCalledWith('newpass');

    fireEvent.change(screen.getByLabelText('ConfirmPassword'), {
      target: { value: 'confirmpass' },
    });
    expect(props.onPasswordConfirmChange).toHaveBeenCalledWith('confirmpass');
  });

  it('shows the error alert when passwordError is set', () => {
    render(<PasswordResetSheet {...baseProps()} passwordError="PasswordsDoNotMatch" />);
    expect(screen.getByRole('alert')).toHaveTextContent('PasswordsDoNotMatch');
  });

  it('shows the success alert when passwordSuccess is true', () => {
    render(<PasswordResetSheet {...baseProps()} passwordSuccess />);
    expect(screen.getByText('PasswordResetSuccess')).toBeInTheDocument();
  });

  it('disables the submit button and shows saving text while passwordSaving', () => {
    render(<PasswordResetSheet {...baseProps()} passwordSaving />);
    const button = screen.getByRole('button', { name: /Saving\.\.\./ });
    expect(button).toBeDisabled();
  });

  it('calls onSubmit when the submit button is clicked', () => {
    const props = baseProps();
    render(<PasswordResetSheet {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /SetNewPassword/ }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });
});
