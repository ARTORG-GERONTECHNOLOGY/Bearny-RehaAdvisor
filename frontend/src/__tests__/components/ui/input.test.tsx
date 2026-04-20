import { render, screen } from '@testing-library/react';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('renders an input element', () => {
    render(<Input placeholder="type here" />);
    expect(screen.getByPlaceholderText('type here')).toBeInTheDocument();
  });

  it('merges custom className', () => {
    render(<Input className="my-class" data-testid="inp" />);
    expect(screen.getByTestId('inp')).toHaveClass('my-class');
  });

  it('forwards props like disabled', () => {
    render(<Input disabled data-testid="inp" />);
    expect(screen.getByTestId('inp')).toBeDisabled();
  });
});
