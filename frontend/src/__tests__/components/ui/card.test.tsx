import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
  CardFooter,
} from '@/components/ui/card';

describe('Card', () => {
  it('renders a div element', () => {
    const { container } = render(<Card />);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('applies default classes', () => {
    const { container } = render(<Card />);
    const div = container.firstChild as HTMLElement;
    expect(div).toHaveClass('rounded-xl', 'border', 'border-accent', 'bg-white');
  });

  it('merges custom className', () => {
    const { container } = render(<Card className="custom-card" />);
    expect(container.firstChild).toHaveClass('custom-card');
  });

  it('forwards ref to the div element', () => {
    const ref = { current: null as HTMLDivElement | null };
    const { container } = render(<Card ref={ref} />);
    expect(ref.current).toBe(container.firstChild);
  });

  it('renders children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('has displayName Card', () => {
    expect(Card.displayName).toBe('Card');
  });
});

describe('CardHeader', () => {
  it('renders a div element', () => {
    const { container } = render(<CardHeader />);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('applies default flex-col classes', () => {
    const { container } = render(<CardHeader />);
    expect(container.firstChild).toHaveClass('flex', 'flex-col', 'space-y-1.5', 'p-4');
  });

  it('merges custom className', () => {
    const { container } = render(<CardHeader className="my-header" />);
    expect(container.firstChild).toHaveClass('my-header');
  });

  it('has displayName CardHeader', () => {
    expect(CardHeader.displayName).toBe('CardHeader');
  });
});

describe('CardTitle', () => {
  it('renders a div element', () => {
    const { container } = render(<CardTitle />);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('applies font-semibold and tracking classes', () => {
    const { container } = render(<CardTitle />);
    expect(container.firstChild).toHaveClass('font-semibold', 'leading-none', 'tracking-tight');
  });

  it('renders children', () => {
    render(<CardTitle>My Title</CardTitle>);
    expect(screen.getByText('My Title')).toBeInTheDocument();
  });

  it('has displayName CardTitle', () => {
    expect(CardTitle.displayName).toBe('CardTitle');
  });
});

describe('CardDescription', () => {
  it('renders a div element', () => {
    const { container } = render(<CardDescription />);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('applies muted text classes', () => {
    const { container } = render(<CardDescription />);
    expect(container.firstChild).toHaveClass('text-sm', 'text-muted-foreground');
  });

  it('renders children', () => {
    render(<CardDescription>Some description</CardDescription>);
    expect(screen.getByText('Some description')).toBeInTheDocument();
  });

  it('has displayName CardDescription', () => {
    expect(CardDescription.displayName).toBe('CardDescription');
  });
});

describe('CardContent', () => {
  it('renders a div element', () => {
    const { container } = render(<CardContent />);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('applies padding classes', () => {
    const { container } = render(<CardContent />);
    expect(container.firstChild).toHaveClass('p-4', 'pt-0');
  });

  it('merges custom className', () => {
    const { container } = render(<CardContent className="extra" />);
    expect(container.firstChild).toHaveClass('extra');
  });

  it('renders children', () => {
    render(<CardContent>Body text</CardContent>);
    expect(screen.getByText('Body text')).toBeInTheDocument();
  });

  it('has displayName CardContent', () => {
    expect(CardContent.displayName).toBe('CardContent');
  });
});

describe('CardAction', () => {
  it('renders a div with data-slot="card-action"', () => {
    const { container } = render(<CardAction />);
    const div = container.firstChild as HTMLElement;
    expect(div).toHaveAttribute('data-slot', 'card-action');
  });

  it('applies grid positioning classes', () => {
    const { container } = render(<CardAction />);
    expect(container.firstChild).toHaveClass('col-start-2', 'row-span-2', 'row-start-1');
  });

  it('renders children', () => {
    render(<CardAction><button>Action</button></CardAction>);
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });

  it('has displayName CardAction', () => {
    expect(CardAction.displayName).toBe('CardAction');
  });
});

describe('CardFooter', () => {
  it('renders a div element', () => {
    const { container } = render(<CardFooter />);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('applies flex and padding classes', () => {
    const { container } = render(<CardFooter />);
    expect(container.firstChild).toHaveClass('flex', 'items-center', 'p-4', 'pt-0');
  });

  it('renders children', () => {
    render(<CardFooter>Footer content</CardFooter>);
    expect(screen.getByText('Footer content')).toBeInTheDocument();
  });

  it('has displayName CardFooter', () => {
    expect(CardFooter.displayName).toBe('CardFooter');
  });
});

describe('Card composition', () => {
  it('renders a full card with all sub-components', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Invoice Details</CardTitle>
          <CardDescription>View your recent invoice.</CardDescription>
          <CardAction>
            <button>Edit</button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p>Invoice #001</p>
        </CardContent>
        <CardFooter>
          <span>Paid</span>
        </CardFooter>
      </Card>
    );

    expect(screen.getByText('Invoice Details')).toBeInTheDocument();
    expect(screen.getByText('View your recent invoice.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByText('Invoice #001')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });
});
