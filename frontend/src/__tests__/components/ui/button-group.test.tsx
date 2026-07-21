import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  buttonGroupVariants,
} from '@/components/ui/button-group';

describe('ButtonGroup', () => {
  it('renders with role=group', () => {
    render(<ButtonGroup>content</ButtonGroup>);
    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  it('sets data-slot="button-group"', () => {
    const { container } = render(<ButtonGroup>x</ButtonGroup>);
    expect(container.firstChild).toHaveAttribute('data-slot', 'button-group');
  });

  it('merges custom className', () => {
    render(<ButtonGroup className="my-group">x</ButtonGroup>);
    expect(screen.getByRole('group')).toHaveClass('my-group');
  });

  it('defaults to horizontal orientation', () => {
    const { container } = render(<ButtonGroup>x</ButtonGroup>);
    expect(container.firstChild).not.toHaveAttribute('data-orientation');
    expect((container.firstChild as HTMLElement).className).toMatch(/rounded-l-none/);
  });

  it('applies vertical orientation classes', () => {
    render(<ButtonGroup orientation="vertical">x</ButtonGroup>);
    const group = screen.getByRole('group');
    expect(group).toHaveAttribute('data-orientation', 'vertical');
    expect(group.className).toMatch(/flex-col/);
  });

  it('renders children', () => {
    render(
      <ButtonGroup>
        <Button>A</Button>
        <Button>B</Button>
      </ButtonGroup>
    );
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument();
  });
});

describe('ButtonGroupText', () => {
  it('renders children', () => {
    render(
      <ButtonGroup>
        <ButtonGroupText>Label</ButtonGroupText>
      </ButtonGroup>
    );
    expect(screen.getByText('Label')).toBeInTheDocument();
  });

  it('merges custom className', () => {
    render(
      <ButtonGroup>
        <ButtonGroupText className="extra-class">Label</ButtonGroupText>
      </ButtonGroup>
    );
    expect(screen.getByText('Label')).toHaveClass('extra-class');
  });

  it('renders as a different element when asChild is used', () => {
    render(
      <ButtonGroup>
        <ButtonGroupText asChild>
          <span>Slot Text</span>
        </ButtonGroupText>
      </ButtonGroup>
    );
    const el = screen.getByText('Slot Text');
    expect(el.tagName.toLowerCase()).toBe('span');
  });
});

describe('ButtonGroupSeparator', () => {
  it('renders with data-slot="button-group-separator"', () => {
    const { container } = render(
      <ButtonGroup>
        <ButtonGroupSeparator />
      </ButtonGroup>
    );
    expect(container.querySelector('[data-slot="button-group-separator"]')).toBeInTheDocument();
  });

  it('merges custom className', () => {
    const { container } = render(
      <ButtonGroup>
        <ButtonGroupSeparator className="my-sep" />
      </ButtonGroup>
    );
    expect(container.querySelector('[data-slot="button-group-separator"]')).toHaveClass('my-sep');
  });
});

describe('buttonGroupVariants', () => {
  it('returns horizontal classes by default', () => {
    const cls = buttonGroupVariants({});
    expect(cls).toMatch(/rounded-l-none/);
  });

  it('returns vertical classes when orientation is vertical', () => {
    const cls = buttonGroupVariants({ orientation: 'vertical' });
    expect(cls).toMatch(/flex-col/);
  });
});
