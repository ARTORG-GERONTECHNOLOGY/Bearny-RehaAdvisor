import { render, screen, fireEvent } from '@testing-library/react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
  InputGroupText,
} from '@/components/ui/input-group';

describe('InputGroup', () => {
  it('renders with role=group', () => {
    render(<InputGroup>content</InputGroup>);
    expect(screen.getAllByRole('group')[0]).toBeInTheDocument();
  });

  it('merges custom className', () => {
    render(<InputGroup className="my-group">x</InputGroup>);
    expect(screen.getAllByRole('group')[0]).toHaveClass('my-group');
  });
});

describe('InputGroupAddon', () => {
  it('renders with default inline-start alignment', () => {
    const { container } = render(
      <InputGroup>
        <InputGroupAddon>$</InputGroupAddon>
        <InputGroupInput placeholder="amount" />
      </InputGroup>
    );
    const addon = container.querySelector('[data-slot="input-group-addon"]');
    expect(addon).toHaveAttribute('data-align', 'inline-start');
  });

  it('accepts inline-end alignment', () => {
    const { container } = render(
      <InputGroup>
        <InputGroupInput placeholder="amount" />
        <InputGroupAddon align="inline-end">.00</InputGroupAddon>
      </InputGroup>
    );
    const addon = container.querySelector('[data-slot="input-group-addon"]');
    expect(addon).toHaveAttribute('data-align', 'inline-end');
  });
});

describe('InputGroupInput', () => {
  it('renders an input inside the group', () => {
    render(
      <InputGroup>
        <InputGroupInput placeholder="search" />
      </InputGroup>
    );
    expect(screen.getByPlaceholderText('search')).toBeInTheDocument();
  });
});

describe('InputGroupTextarea', () => {
  it('renders a textarea inside the group', () => {
    render(
      <InputGroup>
        <InputGroupTextarea placeholder="write" />
      </InputGroup>
    );
    expect(screen.getByPlaceholderText('write')).toBeInTheDocument();
  });
});

describe('InputGroupText', () => {
  it('renders span with text content', () => {
    render(
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>@</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="username" />
      </InputGroup>
    );
    expect(screen.getByText('@')).toBeInTheDocument();
  });
});

// ─── InputGroupAddon onClick logic ─────────────────────────────

describe('InputGroupAddon onClick', () => {
  it('focuses the input when clicking a non-button area', () => {
    const focusSpy = jest.spyOn(HTMLInputElement.prototype, 'focus');
    render(
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>$</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="amount" />
      </InputGroup>
    );
    fireEvent.click(screen.getByText('$'));
    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  it('does not focus the input when clicking a button inside the addon', () => {
    const focusSpy = jest.spyOn(HTMLInputElement.prototype, 'focus');
    render(
      <InputGroup>
        <InputGroupAddon>
          <InputGroupButton>Go</InputGroupButton>
        </InputGroupAddon>
        <InputGroupInput placeholder="x" />
      </InputGroup>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(focusSpy).not.toHaveBeenCalled();
    focusSpy.mockRestore();
  });
});

// ─── InputGroupButton ─────────────────────────────────────────────

describe('InputGroupButton', () => {
  it('renders a button', () => {
    render(
      <InputGroup>
        <InputGroupAddon>
          <InputGroupButton>Search</InputGroupButton>
        </InputGroupAddon>
        <InputGroupInput placeholder="query" />
      </InputGroup>
    );
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
  });

  it('merges custom className', () => {
    render(
      <InputGroup>
        <InputGroupAddon>
          <InputGroupButton className="my-btn">X</InputGroupButton>
        </InputGroupAddon>
        <InputGroupInput placeholder="x" />
      </InputGroup>
    );
    expect(screen.getByRole('button', { name: 'X' })).toHaveClass('my-btn');
  });
});
