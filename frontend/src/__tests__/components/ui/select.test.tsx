import { render, screen } from '@testing-library/react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
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
});
