import { render, screen } from '@testing-library/react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from '@/components/ui/select';

describe('Select', () => {
  it('renders a trigger with placeholder', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Option A</SelectItem>
        </SelectContent>
      </Select>
    );
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });

  it('SelectTrigger merges custom className', () => {
    render(
      <Select>
        <SelectTrigger className="my-trigger">
          <SelectValue placeholder="x" />
        </SelectTrigger>
      </Select>
    );
    expect(screen.getByRole('combobox')).toHaveClass('my-trigger');
  });

  it('renders a SelectLabel and SelectSeparator inside an open select', () => {
    render(
      <Select open>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Group A</SelectLabel>
            <SelectItem value="a">Option A</SelectItem>
          </SelectGroup>
          <SelectSeparator data-testid="select-separator" />
          <SelectItem value="b">Option B</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(screen.getByText('Group A')).toBeInTheDocument();
    expect(screen.getByTestId('select-separator')).toBeInTheDocument();
  });
});
