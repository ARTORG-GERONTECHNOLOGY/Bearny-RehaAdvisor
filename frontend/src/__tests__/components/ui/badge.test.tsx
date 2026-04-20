import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('default variant includes bg-primary', () => {
    const { container } = render(<Badge>X</Badge>);
    expect(container.firstChild).toHaveClass('bg-primary');
  });

  it('secondary variant includes bg-secondary', () => {
    const { container } = render(<Badge variant="secondary">X</Badge>);
    expect(container.firstChild).toHaveClass('bg-secondary');
  });

  it('destructive variant includes bg-destructive', () => {
    const { container } = render(<Badge variant="destructive">X</Badge>);
    expect(container.firstChild).toHaveClass('bg-destructive');
  });

  it('outline variant includes text-foreground', () => {
    const { container } = render(<Badge variant="outline">X</Badge>);
    expect(container.firstChild).toHaveClass('text-foreground');
  });

  it('merges custom className', () => {
    const { container } = render(<Badge className="my-badge">X</Badge>);
    expect(container.firstChild).toHaveClass('my-badge');
  });
});
