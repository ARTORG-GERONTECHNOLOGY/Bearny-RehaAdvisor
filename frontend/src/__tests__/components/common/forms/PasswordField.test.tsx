import { render, screen, fireEvent } from '@testing-library/react';
import PasswordField from '@/components/forms/input/PasswordField';
import '@testing-library/jest-dom';

describe('PasswordField Component', () => {
  const baseProps = {
    id: 'user-password',
    value: 'secret123',
    onChange: jest.fn(),
    onToggle: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly for regular users with hidden password', () => {
    render(<PasswordField {...baseProps} showPassword={false} pagetype="regular" />);

    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveValue('secret123');
    expect(screen.getByLabelText('Show password')).toBeInTheDocument();
  });

  it('renders correctly for regular users with visible password', () => {
    render(<PasswordField {...baseProps} showPassword={true} pagetype="regular" />);

    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('secret123');
  });

  it('renders correctly for patient page with hidden password', () => {
    render(<PasswordField {...baseProps} showPassword={false} pagetype="patient" />);

    const input = screen.getByLabelText('Patient Password');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveValue('secret123');
    expect(screen.getByLabelText('Show password')).toBeInTheDocument();
  });

  it('fires onChange when user types', () => {
    render(<PasswordField {...baseProps} showPassword={false} pagetype="regular" />);

    const input = screen.getByLabelText('Password');
    fireEvent.change(input, { target: { value: 'newpass' } });
    expect(baseProps.onChange).toHaveBeenCalledTimes(1);
  });

  it('fires onToggle when eye icon is clicked', () => {
    render(<PasswordField {...baseProps} showPassword={false} pagetype="regular" />);

    fireEvent.click(screen.getByLabelText('Show password'));
    expect(baseProps.onToggle).toHaveBeenCalledTimes(1);
  });
});
