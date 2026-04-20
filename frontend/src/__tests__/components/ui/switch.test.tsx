import { render, screen } from '@testing-library/react';
import { Switch } from '@/components/ui/switch';

describe('Switch', () => {
  it('renders a switch button', () => {
    render(<Switch />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('is not checked by default', () => {
    render(<Switch />);
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('renders as checked when defaultChecked', () => {
    render(<Switch defaultChecked />);
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('merges custom className', () => {
    render(<Switch className="my-switch" />);
    expect(screen.getByRole('switch')).toHaveClass('my-switch');
  });
});
