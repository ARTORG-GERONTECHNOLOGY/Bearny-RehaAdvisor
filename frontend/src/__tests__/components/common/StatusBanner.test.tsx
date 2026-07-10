import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import StatusBanner from '@/components/common/StatusBanner';

describe('StatusBanner', () => {
  it('renders nothing when message is empty', () => {
    const { container } = render(<StatusBanner type="success" message="" onClose={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the message with success styling', () => {
    render(<StatusBanner type="success" message="Saved successfully" onClose={jest.fn()} />);
    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
  });

  it('renders the message with danger styling', () => {
    render(<StatusBanner type="danger" message="Something went wrong" onClose={jest.fn()} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('calls onClose when dismissed', () => {
    const onClose = jest.fn();
    render(<StatusBanner type="success" message="Saved" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
