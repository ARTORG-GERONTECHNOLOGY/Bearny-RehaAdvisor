import { render, screen } from '@testing-library/react';
import Layout from '@/components/Layout';

jest.mock('@/components/Navigation', () => () => <nav data-testid="navigation" />);
jest.mock('@/components/Container', () => ({ children, className }: any) => (
  <main data-testid="container" className={className}>
    {children}
  </main>
));

describe('Layout', () => {
  it('renders Navigation, Container, and children', () => {
    render(<Layout>Page Content</Layout>);

    expect(screen.getByTestId('navigation')).toBeInTheDocument();
    expect(screen.getByTestId('container')).toBeInTheDocument();
    expect(screen.getByText('Page Content')).toBeInTheDocument();
  });

  it('wraps content in a min-h-screen div', () => {
    const { container } = render(<Layout>child</Layout>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('min-h-screen');
  });
});
