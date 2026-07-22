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

  describe('dashboard', () => {
    it('applies compact padding, bg-white, text-zinc-800 and border-accent', () => {
      const { container } = render(<Badge variant="dashboard">X</Badge>);
      const el = container.firstChild;
      expect(el).toHaveClass('rounded-lg');
      expect(el).toHaveClass('py-0.5');
      expect(el).toHaveClass('px-2');
      expect(el).toHaveClass('border');
      expect(el).toHaveClass('border-accent');
      expect(el).toHaveClass('bg-white');
      expect(el).toHaveClass('text-zinc-800');
      expect(el).toHaveClass('capitalize');
    });
  });

  describe('dashboard-success', () => {
    it('applies compact padding, border-ok, bg-ok/5 and text-ok', () => {
      const { container } = render(<Badge variant="dashboard-success">X</Badge>);
      const el = container.firstChild;
      expect(el).toHaveClass('rounded-lg');
      expect(el).toHaveClass('py-0.5');
      expect(el).toHaveClass('px-2');
      expect(el).toHaveClass('border');
      expect(el).toHaveClass('border-ok');
      expect(el).toHaveClass('bg-ok/5');
      expect(el).toHaveClass('text-ok');
    });
  });

  describe('dashboard-warning', () => {
    it('applies compact padding, border-yellow, bg-yellow/5 and text-yellow', () => {
      const { container } = render(<Badge variant="dashboard-warning">X</Badge>);
      const el = container.firstChild;
      expect(el).toHaveClass('rounded-lg');
      expect(el).toHaveClass('py-0.5');
      expect(el).toHaveClass('px-2');
      expect(el).toHaveClass('border');
      expect(el).toHaveClass('border-yellow');
      expect(el).toHaveClass('bg-yellow/5');
      expect(el).toHaveClass('text-yellow');
    });
  });

  describe('dashboard-info', () => {
    it('applies compact padding, border-blue-800, bg-blue-50 and text-blue-800', () => {
      const { container } = render(<Badge variant="dashboard-info">X</Badge>);
      const el = container.firstChild;
      expect(el).toHaveClass('rounded-lg');
      expect(el).toHaveClass('py-0.5');
      expect(el).toHaveClass('px-2');
      expect(el).toHaveClass('border');
      expect(el).toHaveClass('border-blue-800');
      expect(el).toHaveClass('bg-blue-50');
      expect(el).toHaveClass('text-blue-800');
    });
  });

  describe('dashboard-destructive', () => {
    it('applies compact padding, border-nok, bg-nok/5 and text-nok', () => {
      const { container } = render(<Badge variant="dashboard-destructive">X</Badge>);
      const el = container.firstChild;
      expect(el).toHaveClass('rounded-lg');
      expect(el).toHaveClass('py-0.5');
      expect(el).toHaveClass('px-2');
      expect(el).toHaveClass('border');
      expect(el).toHaveClass('border-nok');
      expect(el).toHaveClass('bg-nok/5');
      expect(el).toHaveClass('text-nok');
    });
  });

  it('merges custom className', () => {
    const { container } = render(<Badge className="my-badge">X</Badge>);
    expect(container.firstChild).toHaveClass('my-badge');
  });
});
