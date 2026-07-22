import { render, screen, fireEvent } from '@testing-library/react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

describe('Alert', () => {
  it('renders children with role="alert"', () => {
    render(<Alert>Something happened</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something happened');
  });

  it('applies default variant classes', () => {
    render(<Alert>X</Alert>);
    const el = screen.getByRole('alert');
    expect(el).toHaveClass('bg-background');
    expect(el).toHaveClass('text-foreground');
  });

  it('applies destructive variant classes', () => {
    render(<Alert variant="destructive">X</Alert>);
    const el = screen.getByRole('alert');
    expect(el).toHaveClass('border-nok');
    expect(el).toHaveClass('bg-nok/5');
    expect(el).toHaveClass('text-nok');
  });

  it('merges custom className', () => {
    render(<Alert className="mt-4">X</Alert>);
    expect(screen.getByRole('alert')).toHaveClass('mt-4');
  });

  it('forwards ref to the underlying div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<Alert ref={ref}>X</Alert>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('forwards additional div props', () => {
    render(<Alert data-testid="my-alert">X</Alert>);
    expect(screen.getByTestId('my-alert')).toBeInTheDocument();
  });

  it('applies success variant classes', () => {
    render(<Alert variant="success">X</Alert>);
    const el = screen.getByRole('alert');
    expect(el).toHaveClass('border-ok');
    expect(el).toHaveClass('bg-ok/5');
    expect(el).toHaveClass('text-ok');
  });

  it('applies warning variant classes', () => {
    render(<Alert variant="warning">X</Alert>);
    const el = screen.getByRole('alert');
    expect(el).toHaveClass('border-yellow');
    expect(el).toHaveClass('bg-yellow/5');
    expect(el).toHaveClass('text-yellow');
  });

  it('applies info variant classes', () => {
    render(<Alert variant="info">X</Alert>);
    const el = screen.getByRole('alert');
    expect(el).toHaveClass('border-blue-800');
    expect(el).toHaveClass('bg-blue-50');
    expect(el).toHaveClass('text-blue-800');
  });

  it('does not render a dismiss button by default', () => {
    render(<Alert>X</Alert>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a dismiss button and calls onClose when clicked', () => {
    const onClose = jest.fn();
    render(<Alert onClose={onClose}>X</Alert>);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses a custom closeLabel for the dismiss button', () => {
    render(
      <Alert onClose={() => {}} closeLabel="Dismiss">
        X
      </Alert>
    );
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });
});

describe('AlertTitle', () => {
  it('renders as an h5 with the given text', () => {
    render(<AlertTitle>Heads up</AlertTitle>);
    const el = screen.getByText('Heads up');
    expect(el.tagName).toBe('H5');
  });

  it('merges custom className', () => {
    render(<AlertTitle className="text-lg">Title</AlertTitle>);
    expect(screen.getByText('Title')).toHaveClass('text-lg');
  });

  it('forwards ref to the underlying heading', () => {
    const ref = { current: null as HTMLHeadingElement | null };
    render(<AlertTitle ref={ref}>Title</AlertTitle>);
    expect(ref.current).toBeInstanceOf(HTMLHeadingElement);
  });
});

describe('AlertDescription', () => {
  it('renders the given text', () => {
    render(<AlertDescription>Details go here</AlertDescription>);
    expect(screen.getByText('Details go here')).toBeInTheDocument();
  });

  it('merges custom className', () => {
    render(<AlertDescription className="italic">Details</AlertDescription>);
    expect(screen.getByText('Details')).toHaveClass('italic');
  });

  it('forwards ref to the underlying div', () => {
    const ref = { current: null as HTMLParagraphElement | null };
    render(<AlertDescription ref={ref}>Details</AlertDescription>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
