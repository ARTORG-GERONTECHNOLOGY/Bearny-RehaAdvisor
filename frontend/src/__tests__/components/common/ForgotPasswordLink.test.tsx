import { render, screen, fireEvent } from '@testing-library/react';
import ForgotPasswordLink from '@/components/common/ForgotPasswordLink';

describe('ForgotPasswordLink', () => {
  it('renders with default text', () => {
    const mockClick = jest.fn();
    render(<ForgotPasswordLink onClick={mockClick} />);

    const button = screen.getByRole('button', { name: /Forgot Password\?/i });
    expect(button).toBeInTheDocument();
  });

  it('renders with custom text', () => {
    const mockClick = jest.fn();
    render(<ForgotPasswordLink onClick={mockClick} text="Reset Access Word" />);

    const button = screen.getByRole('button', { name: /Reset Access Word/i });
    expect(button).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const mockClick = jest.fn();
    render(<ForgotPasswordLink onClick={mockClick} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(mockClick).toHaveBeenCalledTimes(1);
  });
});
