import { render, screen } from '@testing-library/react';
import Container from '@/components/Container';

describe('Container', () => {
  it('renders children inside a main element with base classes', () => {
    render(<Container>Hello</Container>);
    const el = screen.getByRole('main');
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent('Hello');
    expect(el.className).toContain('container');
  });

  it('appends custom className when provided', () => {
    render(<Container className="my-custom-class">Content</Container>);
    expect(screen.getByRole('main').className).toContain('my-custom-class');
  });

  it('defaults to empty string when className is omitted', () => {
    render(<Container>Content</Container>);
    expect(screen.getByRole('main').className).not.toContain('undefined');
  });
});
