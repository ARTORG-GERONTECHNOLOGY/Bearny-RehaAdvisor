import { render, screen, fireEvent } from '@testing-library/react';
import PasswordField from '@/components/forms/input/PasswordField';
import '@testing-library/jest-dom';

describe('PasswordField Component', () => {
  const baseProps = {
    id: 'user-password',
    label: 'Password',
    value: 'secret123',
    onChange: jest.fn(),
    placeholder: 'Enter your password',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with password hidden by default', () => {
    render(<PasswordField {...baseProps} />);

    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveValue('secret123');
  });

  it('toggles password visibility when eye icon is clicked', () => {
    render(<PasswordField {...baseProps} />);

    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');

    // Click the toggle button (the addon containing the eye icon)
    const toggle = input
      .closest('[data-slot="input-group"]')
      ?.querySelector('[data-slot="input-group-addon"]') as HTMLElement;
    fireEvent.click(toggle);

    expect(input).toHaveAttribute('type', 'text');

    // Click again to hide
    fireEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('calls onChange when user types', () => {
    render(<PasswordField {...baseProps} />);

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'newpass' } });
    expect(baseProps.onChange).toHaveBeenCalledTimes(1);
  });

  it('renders the provided label', () => {
    render(<PasswordField {...baseProps} label="Current Password" />);

    expect(screen.getByLabelText('Current Password')).toBeInTheDocument();
  });

  it('sets autoComplete to current-password by default', () => {
    render(<PasswordField {...baseProps} />);

    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('accepts a custom autoComplete value', () => {
    render(<PasswordField {...baseProps} autoComplete="new-password" />);

    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('marks input as required when required prop is set', () => {
    render(<PasswordField {...baseProps} required />);

    expect(screen.getByLabelText('Password')).toBeRequired();
  });
});
