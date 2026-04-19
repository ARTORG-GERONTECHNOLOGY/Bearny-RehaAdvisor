import { render, screen } from '@testing-library/react';
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
} from '@/components/ui/field';

// ─── FieldError (contains real branching logic) ───────────────────────────────

describe('FieldError', () => {
  it('renders nothing when no children and no errors', () => {
    const { container } = render(<FieldError />);
    expect(container.firstChild).toBeNull();
  });

  it('renders children when provided', () => {
    render(<FieldError>Custom error</FieldError>);
    expect(screen.getByRole('alert')).toHaveTextContent('Custom error');
  });

  it('renders a single error message from errors array', () => {
    render(<FieldError errors={[{ message: 'Required field' }]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Required field');
  });

  it('renders a list when multiple errors are provided', () => {
    render(<FieldError errors={[{ message: 'Too short' }, { message: 'Invalid format' }]} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Too short')).toBeInTheDocument();
    expect(screen.getByText('Invalid format')).toBeInTheDocument();
  });

  it('renders an empty list when errors array is empty', () => {
    // empty array → map produces empty ul → still renders alert container
    render(<FieldError errors={[]} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('skips error entries with no message', () => {
    render(<FieldError errors={[undefined, { message: 'Only this' }]} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders an empty list when all errors have no message', () => {
    // Multiple entries but none have messages → renders alert with empty ul
    render(<FieldError errors={[{ message: undefined }, undefined]} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('merges custom className', () => {
    render(<FieldError className="my-error">Oops</FieldError>);
    expect(screen.getByRole('alert')).toHaveClass('my-error');
  });

  it('children take priority over errors prop', () => {
    render(<FieldError errors={[{ message: 'From errors' }]}>From children</FieldError>);
    expect(screen.getByRole('alert')).toHaveTextContent('From children');
    expect(screen.queryByText('From errors')).not.toBeInTheDocument();
  });
});

// ─── FieldSeparator ───────────────────────────────────────────────────────────

describe('FieldSeparator', () => {
  it('renders without children', () => {
    const { container } = render(<FieldSeparator />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders separator content when children provided', () => {
    render(<FieldSeparator>or</FieldSeparator>);
    expect(screen.getByText('or')).toBeInTheDocument();
  });
});

// ─── Structural components (smoke tests) ─────────────────────────────────────

describe('Field structural components', () => {
  it('Field renders with role=group', () => {
    render(<Field>content</Field>);
    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  it('Field applies vertical orientation by default', () => {
    const { container } = render(<Field>content</Field>);
    expect(container.firstChild).toHaveAttribute('data-orientation', 'vertical');
  });

  it('Field applies horizontal orientation', () => {
    const { container } = render(<Field orientation="horizontal">content</Field>);
    expect(container.firstChild).toHaveAttribute('data-orientation', 'horizontal');
  });

  it('FieldGroup renders children', () => {
    render(<FieldGroup>group content</FieldGroup>);
    expect(screen.getByText('group content')).toBeInTheDocument();
  });

  it('FieldSet renders as fieldset', () => {
    const { container } = render(<FieldSet>set content</FieldSet>);
    expect(container.querySelector('fieldset')).toBeInTheDocument();
  });

  it('FieldLegend renders as legend', () => {
    const { container } = render(
      <fieldset>
        <FieldLegend>Legend text</FieldLegend>
      </fieldset>
    );
    expect(container.querySelector('legend')).toHaveTextContent('Legend text');
  });

  it('FieldLegend label variant sets data-variant attribute', () => {
    const { container } = render(
      <fieldset>
        <FieldLegend variant="label">Label variant</FieldLegend>
      </fieldset>
    );
    expect(container.querySelector('legend')).toHaveAttribute('data-variant', 'label');
  });

  it('FieldContent renders children', () => {
    render(<FieldContent>content here</FieldContent>);
    expect(screen.getByText('content here')).toBeInTheDocument();
  });

  it('FieldTitle renders children', () => {
    render(<FieldTitle>Title text</FieldTitle>);
    expect(screen.getByText('Title text')).toBeInTheDocument();
  });

  it('FieldDescription renders as p', () => {
    const { container } = render(<FieldDescription>Help text</FieldDescription>);
    expect(container.querySelector('p')).toHaveTextContent('Help text');
  });

  it('FieldLabel renders label text', () => {
    render(<FieldLabel>My label</FieldLabel>);
    expect(screen.getByText('My label')).toBeInTheDocument();
  });
});
