import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('renders as a div', () => {
    const { container } = render(<Badge>X</Badge>);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('base classes are always applied', () => {
    const { container } = render(<Badge>X</Badge>);
    const el = container.firstChild;
    expect(el).toHaveClass('inline-flex');
    expect(el).toHaveClass('items-center');
    expect(el).toHaveClass('gap-1');
    expect(el).toHaveClass('rounded-full');
    expect(el).toHaveClass('pl-3');
    expect(el).toHaveClass('pr-3');
    expect(el).toHaveClass('py-2');
    expect(el).toHaveClass('text-xs');
    expect(el).toHaveClass('font-medium');
  });

  describe('section (default)', () => {
    it('applies bg-zinc-50 and text-zinc-500', () => {
      const { container } = render(<Badge>X</Badge>);
      const el = container.firstChild;
      expect(el).toHaveClass('bg-zinc-50');
      expect(el).toHaveClass('text-zinc-500');
    });
  });

  describe('card', () => {
    it('applies bg-white, text-brand, rounded-xl, pl-[10px], pr-3 and border-accent', () => {
      const { container } = render(<Badge variant="card">X</Badge>);
      const el = container.firstChild;
      expect(el).toHaveClass('bg-white');
      expect(el).toHaveClass('text-brand');
      expect(el).toHaveClass('rounded-xl');
      expect(el).toHaveClass('pl-[10px]');
      expect(el).toHaveClass('pr-3');
      expect(el).toHaveClass('border');
      expect(el).toHaveClass('border-accent');
    });
  });

  describe('tag', () => {
    it('applies bg-white, text-zinc-500, text-lg, rounded-xl and border-accent', () => {
      const { container } = render(<Badge variant="tag">X</Badge>);
      const el = container.firstChild;
      expect(el).toHaveClass('bg-white');
      expect(el).toHaveClass('text-zinc-500');
      expect(el).toHaveClass('rounded-xl');
      expect(el).toHaveClass('border');
      expect(el).toHaveClass('border-accent');
      expect(el).toHaveClass('text-lg');
    });
  });

  describe('filter-active', () => {
    it('applies bg-white, text-zinc-800 and text-nowrap', () => {
      const { container } = render(<Badge variant="filter-active">X</Badge>);
      const el = container.firstChild;
      expect(el).toHaveClass('bg-white');
      expect(el).toHaveClass('text-zinc-800');
      expect(el).toHaveClass('text-nowrap');
    });
  });

  describe('filter-inactive', () => {
    it('applies bg-zinc-50, text-zinc-400 and text-nowrap', () => {
      const { container } = render(<Badge variant="filter-inactive">X</Badge>);
      const el = container.firstChild;
      expect(el).toHaveClass('bg-zinc-50');
      expect(el).toHaveClass('text-zinc-400');
      expect(el).toHaveClass('text-nowrap');
    });
  });

  it('merges custom className', () => {
    const { container } = render(<Badge className="my-badge">X</Badge>);
    expect(container.firstChild).toHaveClass('my-badge');
  });
});
