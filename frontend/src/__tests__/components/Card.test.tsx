import { render, screen } from '@testing-library/react';
import Card from '@/components/Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Hello</Card>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders as a div', () => {
    const { container } = render(<Card>X</Card>);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('applies base classes', () => {
    const { container } = render(<Card>X</Card>);
    const el = container.firstChild;
    expect(el).toHaveClass('p-4');
    expect(el).toHaveClass('border');
    expect(el).toHaveClass('border-accent');
    expect(el).toHaveClass('rounded-3xl');
  });

  it('merges custom className', () => {
    const { container } = render(<Card className="flex gap-2">X</Card>);
    const el = container.firstChild;
    expect(el).toHaveClass('flex');
    expect(el).toHaveClass('gap-2');
    expect(el).toHaveClass('p-4');
  });

  it('forwards additional div props', () => {
    render(
      <Card role="status" aria-label="card label">
        X
      </Card>
    );
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('aria-label', 'card label');
  });

  it('forwards data attributes', () => {
    const { container } = render(<Card data-testid="my-card">X</Card>);
    expect(container.firstChild).toHaveAttribute('data-testid', 'my-card');
  });
});
