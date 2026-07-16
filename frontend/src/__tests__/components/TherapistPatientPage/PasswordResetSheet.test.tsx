import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PasswordResetSheet from '@/components/TherapistPatientPage/PasswordResetSheet';

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
    passwordNew: '',
    passwordConfirm: '',
    passwordError: null,
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

  it('renders title, description and password fields when open', () => {
    render(<PasswordResetSheet {...baseProps()} />);
    expect(screen.getByText('ResetPassword')).toBeInTheDocument();
    expect(screen.getByText('PasswordStrengthHint')).toBeInTheDocument();
    expect(screen.getByLabelText('NewPassword')).toBeInTheDocument();
    expect(screen.getByLabelText('ConfirmPassword')).toBeInTheDocument();
  });

  it('calls onPasswordNewChange when typing the new password', () => {
    const props = baseProps();
    render(<PasswordResetSheet {...props} />);
    fireEvent.change(screen.getByLabelText('NewPassword'), { target: { value: 'secret123' } });
    expect(props.onPasswordNewChange).toHaveBeenCalledWith('secret123');
  });

  it('calls onPasswordConfirmChange when typing the confirmation', () => {
    const props = baseProps();
    render(<PasswordResetSheet {...props} />);
    fireEvent.change(screen.getByLabelText('ConfirmPassword'), {
      target: { value: 'secret123' },
    });
    expect(props.onPasswordConfirmChange).toHaveBeenCalledWith('secret123');
  });

  it('shows an error alert when passwordError is set', () => {
    render(<PasswordResetSheet {...baseProps()} passwordError="Passwords do not match" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
  });

  it('does not show an error alert when passwordError is null', () => {
    render(<PasswordResetSheet {...baseProps()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a success message when passwordSuccess is true', () => {
    render(<PasswordResetSheet {...baseProps()} passwordSuccess />);
    expect(screen.getByText('PasswordResetSuccess')).toBeInTheDocument();
  });

  it('calls onSubmit when the submit button is clicked', () => {
    const props = baseProps();
    render(<PasswordResetSheet {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /SetNewPassword/ }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows the saving label and disables the submit button while saving', () => {
    render(<PasswordResetSheet {...baseProps()} passwordSaving />);
    expect(screen.getByRole('button', { name: /Saving\.\.\./ })).toBeDisabled();
  });
});
