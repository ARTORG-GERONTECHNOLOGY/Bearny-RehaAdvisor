import { render, screen, fireEvent } from '@testing-library/react';
import EndScreen from '@/components/icf/EndScreen';

describe('EndScreen', () => {
  const noop = () => {};

  it('renders the thank-you heading', () => {
    render(<EndScreen onEnd={noop} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Vielen Dank');
    expect(screen.getByRole('heading')).toHaveTextContent('für Ihre Teilnahme!');
  });

  it('renders the congratulatory text', () => {
    render(<EndScreen onEnd={noop} />);
    expect(screen.getByText('Sie haben alles geschafft!')).toBeInTheDocument();
  });

  it('renders the logo', () => {
    render(<EndScreen onEnd={noop} />);
    expect(screen.getByAltText('Logo')).toBeInTheDocument();
  });

  it('renders the Beenden button', () => {
    render(<EndScreen onEnd={noop} />);
    expect(screen.getByRole('button', { name: 'Beenden' })).toBeInTheDocument();
  });

  it('calls onEnd when Beenden is clicked', () => {
    const onEnd = jest.fn();
    render(<EndScreen onEnd={onEnd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Beenden' }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
