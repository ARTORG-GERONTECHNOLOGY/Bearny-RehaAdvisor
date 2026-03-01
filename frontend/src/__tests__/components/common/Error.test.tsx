import { render, screen } from '@testing-library/react';
import Error from '@/components/common/Error';

describe('Error Component', () => {
  it('renders without crashing', () => {
    render(<Error />);
    const heading = screen.getByRole('heading', { name: /error/i });
    expect(heading).toBeInTheDocument();
  });

  it('displays centered error message', () => {
    render(<Error />);
    const heading = screen.getByRole('heading', { name: /error/i });
    expect(heading).toHaveClass('text-center');
  });
});
