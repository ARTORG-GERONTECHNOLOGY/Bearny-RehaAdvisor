import { render, screen } from '@testing-library/react';
import { Spinner } from '@/components/ui/spinner';

describe('Spinner', () => {
  it('renders with animate-spin class', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toHaveClass('animate-spin');
  });

  it('has an accessible loading label', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toHaveAccessibleName('Loading');
  });

  it('merges custom className', () => {
    render(<Spinner className="text-primary" />);
    expect(screen.getByRole('status')).toHaveClass('text-primary', 'animate-spin');
  });
});
