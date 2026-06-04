import { render, screen } from '@testing-library/react';
import EndScreen from '@/components/icf/EndScreen';

describe('EndScreen', () => {
  it('renders the thank-you heading', () => {
    render(<EndScreen />);
    expect(screen.getByRole('heading')).toHaveTextContent('Vielen Dank');
    expect(screen.getByRole('heading')).toHaveTextContent('für Ihre Teilnahme!');
  });

  it('renders the congratulatory text', () => {
    render(<EndScreen />);
    expect(screen.getByText('Sie haben alles geschafft!')).toBeInTheDocument();
  });

  it('renders the logo', () => {
    render(<EndScreen />);
    expect(screen.getByAltText('Logo')).toBeInTheDocument();
  });

  it('does not render a Beenden button', () => {
    render(<EndScreen />);
    expect(screen.queryByRole('button', { name: 'Beenden' })).not.toBeInTheDocument();
  });

  it('does not render any button', () => {
    render(<EndScreen />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
