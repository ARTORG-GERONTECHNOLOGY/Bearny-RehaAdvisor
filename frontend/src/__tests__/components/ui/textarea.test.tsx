import { render, screen } from '@testing-library/react';
import { Textarea } from '@/components/ui/textarea';

describe('Textarea', () => {
  it('renders a textarea element', () => {
    render(<Textarea placeholder="write here" />);
    expect(screen.getByPlaceholderText('write here')).toBeInTheDocument();
  });

  it('merges custom className', () => {
    render(<Textarea className="my-class" data-testid="ta" />);
    expect(screen.getByTestId('ta')).toHaveClass('my-class');
  });
});
