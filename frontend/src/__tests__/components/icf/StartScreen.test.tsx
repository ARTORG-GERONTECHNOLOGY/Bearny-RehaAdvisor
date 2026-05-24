import { render, screen, fireEvent } from '@testing-library/react';
import StartScreen from '@/components/icf/StartScreen';

describe('StartScreen', () => {
  const noop = () => {};

  it('renders heading and logo', () => {
    render(<StartScreen micError="" onStart={noop} />);
    expect(screen.getByRole('heading', { name: 'Willkommen' })).toBeInTheDocument();
    expect(screen.getByAltText('Logo')).toBeInTheDocument();
  });

  it('renders the start button with correct label', () => {
    render(<StartScreen micError="" onStart={noop} />);
    expect(screen.getByRole('button', { name: 'Übungslauf starten' })).toBeInTheDocument();
  });

  it('calls onStart when the button is clicked', () => {
    const onStart = jest.fn();
    render(<StartScreen micError="" onStart={onStart} />);
    fireEvent.click(screen.getByRole('button', { name: 'Übungslauf starten' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('does not show mic error when micError is empty', () => {
    const { container } = render(<StartScreen micError="" onStart={noop} />);
    expect(container.querySelector('.icf-audio-error')).not.toBeInTheDocument();
  });

  it('shows mic error message when micError is provided', () => {
    const { container } = render(
      <StartScreen micError="Mikrofon nicht verfügbar" onStart={noop} />
    );
    const errorEl = container.querySelector('.icf-audio-error');
    expect(errorEl).toBeInTheDocument();
    expect(errorEl).toHaveTextContent('Mikrofon nicht verfügbar');
  });

  it('shows key instructions', () => {
    const { container } = render(<StartScreen micError="" onStart={noop} />);
    expect(container).toHaveTextContent(/FunktionsBarometer/);
    expect(container).toHaveTextContent(/verschlüsselt übermittelt/);
  });
});
