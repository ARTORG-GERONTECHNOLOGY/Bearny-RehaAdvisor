import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

describe('RadioGroup', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <RadioGroup>
        <RadioGroupItem value="a" />
      </RadioGroup>
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders multiple items', () => {
    render(
      <RadioGroup defaultValue="b">
        <RadioGroupItem value="a" aria-label="Option A" />
        <RadioGroupItem value="b" aria-label="Option B" />
        <RadioGroupItem value="c" aria-label="Option C" />
      </RadioGroup>
    );
    expect(screen.getByRole('radio', { name: 'Option A' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Option B' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Option C' })).toBeInTheDocument();
  });

  it('selects the default value', () => {
    render(
      <RadioGroup defaultValue="b">
        <RadioGroupItem value="a" aria-label="Option A" />
        <RadioGroupItem value="b" aria-label="Option B" />
      </RadioGroup>
    );
    expect(screen.getByRole('radio', { name: 'Option B' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Option A' })).not.toBeChecked();
  });

  it('calls onValueChange when a new item is selected', async () => {
    const onValueChange = jest.fn();
    render(
      <RadioGroup onValueChange={onValueChange}>
        <RadioGroupItem value="a" aria-label="Option A" />
        <RadioGroupItem value="b" aria-label="Option B" />
      </RadioGroup>
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Option A' }));
    expect(onValueChange).toHaveBeenCalledWith('a');
  });

  it('disables items when disabled prop is set', () => {
    render(
      <RadioGroup>
        <RadioGroupItem value="a" aria-label="Option A" disabled />
      </RadioGroup>
    );
    expect(screen.getByRole('radio', { name: 'Option A' })).toBeDisabled();
  });

  it('applies a custom className to RadioGroup', () => {
    const { container } = render(
      <RadioGroup className="custom-class">
        <RadioGroupItem value="a" aria-label="Option A" />
      </RadioGroup>
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('applies a custom className to RadioGroupItem', () => {
    render(
      <RadioGroup>
        <RadioGroupItem value="a" aria-label="Option A" className="item-class" />
      </RadioGroup>
    );
    expect(screen.getByRole('radio', { name: 'Option A' })).toHaveClass('item-class');
  });
});
