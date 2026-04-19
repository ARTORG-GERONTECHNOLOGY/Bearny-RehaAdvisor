import { render, screen } from '@testing-library/react';
import { Button, buttonVariants } from '@/components/ui/button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('default variant applies bg color', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button').className).toMatch(/bg-\[#00956C\]/);
  });

  it('secondary variant applies bg-zinc-50', () => {
    render(<Button variant="secondary">Secondary</Button>);
    expect(screen.getByRole('button').className).toMatch(/bg-zinc-50/);
  });

  it('ghost variant applies transparent background', () => {
    render(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button').className).toMatch(/bg-transparent/);
  });

  it('default size applies h-14', () => {
    render(<Button>Default</Button>);
    expect(screen.getByRole('button').className).toMatch(/h-14/);
  });

  it('icon size applies w-14', () => {
    render(<Button size="icon">X</Button>);
    expect(screen.getByRole('button').className).toMatch(/w-14/);
  });

  it('renders as child element when asChild', () => {
    render(
      <Button asChild>
        <a href="/home">Home</a>
      </Button>
    );
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });

  it('buttonVariants returns a class string', () => {
    expect(typeof buttonVariants()).toBe('string');
    expect(buttonVariants({ variant: 'ghost' })).toMatch(/bg-transparent/);
  });
});
