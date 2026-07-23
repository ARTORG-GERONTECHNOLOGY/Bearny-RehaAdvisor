import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordLink from '@/components/common/ForgotPasswordLink';

describe('ForgotPasswordLink', () => {
  it('renders with default text', () => {
    render(<ForgotPasswordLink to="/forgottenpwd" text="Forgot Password?" />, {
      wrapper: MemoryRouter,
    });

    const link = screen.getByRole('link', { name: /Forgot Password\?/i });
    expect(link).toBeInTheDocument();
  });

  it('renders with custom text', () => {
    render(<ForgotPasswordLink to="/forgottenpwd" text="Reset Access Word" />, {
      wrapper: MemoryRouter,
    });

    const link = screen.getByRole('link', { name: /Reset Access Word/i });
    expect(link).toBeInTheDocument();
  });

  it('links to the given route', () => {
    render(<ForgotPasswordLink to="/forgottenpwd" text="Forgot Password?" />, {
      wrapper: MemoryRouter,
    });

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/forgottenpwd');
  });
});
