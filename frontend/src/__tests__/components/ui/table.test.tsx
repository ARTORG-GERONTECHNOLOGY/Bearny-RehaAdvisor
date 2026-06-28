import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from '@/components/ui/table';

describe('Table', () => {
  it('renders a table inside a wrapper div', () => {
    const { container } = render(<Table />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.tagName).toBe('DIV');
    expect(wrapper.querySelector('table')).toBeInTheDocument();
  });

  it('applies default classes to the table element', () => {
    const { container } = render(<Table />);
    const table = container.querySelector('table')!;
    expect(table).toHaveClass('w-full', 'caption-bottom', 'text-sm');
  });

  it('merges custom className onto the table element', () => {
    const { container } = render(<Table className="custom-class" />);
    expect(container.querySelector('table')).toHaveClass('custom-class');
  });

  it('forwards ref to the table element', () => {
    const ref = { current: null as HTMLTableElement | null };
    const { container } = render(<Table ref={ref} />);
    expect(ref.current).toBe(container.querySelector('table'));
  });

  it('has displayName Table', () => {
    expect(Table.displayName).toBe('Table');
  });
});

describe('TableHeader', () => {
  it('renders a thead element', () => {
    const { container } = render(
      <table>
        <TableHeader />
      </table>
    );
    expect(container.querySelector('thead')).toBeInTheDocument();
  });

  it('applies border-b class to rows', () => {
    const { container } = render(
      <table>
        <TableHeader />
      </table>
    );
    expect(container.querySelector('thead')).toHaveClass('[&_tr]:border-b');
  });

  it('merges custom className', () => {
    const { container } = render(
      <table>
        <TableHeader className="custom" />
      </table>
    );
    expect(container.querySelector('thead')).toHaveClass('custom');
  });

  it('has displayName TableHeader', () => {
    expect(TableHeader.displayName).toBe('TableHeader');
  });
});

describe('TableBody', () => {
  it('renders a tbody element', () => {
    const { container } = render(
      <table>
        <TableBody />
      </table>
    );
    expect(container.querySelector('tbody')).toBeInTheDocument();
  });

  it('applies last-child border-0 class', () => {
    const { container } = render(
      <table>
        <TableBody />
      </table>
    );
    expect(container.querySelector('tbody')).toHaveClass('[&_tr:last-child]:border-0');
  });

  it('has displayName TableBody', () => {
    expect(TableBody.displayName).toBe('TableBody');
  });
});

describe('TableFooter', () => {
  it('renders a tfoot element', () => {
    const { container } = render(
      <table>
        <TableFooter />
      </table>
    );
    expect(container.querySelector('tfoot')).toBeInTheDocument();
  });

  it('applies default classes', () => {
    const { container } = render(
      <table>
        <TableFooter />
      </table>
    );
    const tfoot = container.querySelector('tfoot')!;
    expect(tfoot).toHaveClass('border-t', 'bg-muted/50', 'font-medium');
  });

  it('has displayName TableFooter', () => {
    expect(TableFooter.displayName).toBe('TableFooter');
  });
});

describe('TableRow', () => {
  it('renders a tr element', () => {
    const { container } = render(
      <table>
        <tbody>
          <TableRow />
        </tbody>
      </table>
    );
    expect(container.querySelector('tr')).toBeInTheDocument();
  });

  it('applies hover and transition classes', () => {
    const { container } = render(
      <table>
        <tbody>
          <TableRow />
        </tbody>
      </table>
    );
    const tr = container.querySelector('tr')!;
    expect(tr).toHaveClass('border-b', 'transition-colors', 'hover:bg-muted/50');
  });

  it('applies selected state class via data attribute', () => {
    const { container } = render(
      <table>
        <tbody>
          <TableRow data-state="selected" />
        </tbody>
      </table>
    );
    expect(container.querySelector('tr')).toHaveClass('data-[state=selected]:bg-muted');
  });

  it('has displayName TableRow', () => {
    expect(TableRow.displayName).toBe('TableRow');
  });
});

describe('TableHead', () => {
  it('renders a th element', () => {
    const { container } = render(
      <table>
        <thead>
          <tr>
            <TableHead>Header</TableHead>
          </tr>
        </thead>
      </table>
    );
    expect(container.querySelector('th')).toBeInTheDocument();
  });

  it('applies alignment and font classes', () => {
    const { container } = render(
      <table>
        <thead>
          <tr>
            <TableHead />
          </tr>
        </thead>
      </table>
    );
    const th = container.querySelector('th')!;
    expect(th).toHaveClass('h-10', 'px-2', 'text-left', 'align-middle', 'font-medium');
  });

  it('renders children', () => {
    render(
      <table>
        <thead>
          <tr>
            <TableHead>Name</TableHead>
          </tr>
        </thead>
      </table>
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('has displayName TableHead', () => {
    expect(TableHead.displayName).toBe('TableHead');
  });
});

describe('TableCell', () => {
  it('renders a td element', () => {
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <TableCell>Cell</TableCell>
          </tr>
        </tbody>
      </table>
    );
    expect(container.querySelector('td')).toBeInTheDocument();
  });

  it('applies padding and alignment classes', () => {
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <TableCell />
          </tr>
        </tbody>
      </table>
    );
    expect(container.querySelector('td')).toHaveClass('p-2', 'align-middle');
  });

  it('renders children', () => {
    render(
      <table>
        <tbody>
          <tr>
            <TableCell>Value</TableCell>
          </tr>
        </tbody>
      </table>
    );
    expect(screen.getByText('Value')).toBeInTheDocument();
  });

  it('has displayName TableCell', () => {
    expect(TableCell.displayName).toBe('TableCell');
  });
});

describe('TableCaption', () => {
  it('renders a caption element', () => {
    const { container } = render(
      <table>
        <TableCaption>Caption text</TableCaption>
      </table>
    );
    expect(container.querySelector('caption')).toBeInTheDocument();
  });

  it('applies default classes', () => {
    const { container } = render(
      <table>
        <TableCaption />
      </table>
    );
    expect(container.querySelector('caption')).toHaveClass('mt-4', 'text-sm', 'text-muted-foreground');
  });

  it('renders children', () => {
    render(
      <table>
        <TableCaption>My caption</TableCaption>
      </table>
    );
    expect(screen.getByText('My caption')).toBeInTheDocument();
  });

  it('has displayName TableCaption', () => {
    expect(TableCaption.displayName).toBe('TableCaption');
  });
});

describe('Table composition', () => {
  it('renders a full table structure', () => {
    render(
      <Table>
        <TableCaption>Invoice list</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>INV-001</TableCell>
            <TableCell>Paid</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell>1</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    );

    expect(screen.getByText('Invoice list')).toBeInTheDocument();
    expect(screen.getByText('Invoice')).toBeInTheDocument();
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });
});
