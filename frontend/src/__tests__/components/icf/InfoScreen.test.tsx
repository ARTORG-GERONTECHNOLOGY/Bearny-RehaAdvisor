import { render, screen, fireEvent } from '@testing-library/react';
import InfoScreen from '@/components/icf/InfoScreen';

describe('InfoScreen', () => {
  const noop = () => {};

  it('renders heading and logo', () => {
    render(<InfoScreen isRecording={false} onClose={noop} />);
    expect(screen.getByRole('heading', { name: 'Information' })).toBeInTheDocument();
    expect(screen.getByAltText('Logo')).toBeInTheDocument();
  });

  it('renders the zurück button', () => {
    render(<InfoScreen isRecording={false} onClose={noop} />);
    expect(screen.getByRole('button', { name: 'zurück' })).toBeInTheDocument();
  });

  it('calls onClose when zurück is clicked', () => {
    const onClose = jest.fn();
    render(<InfoScreen isRecording={false} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'zurück' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not show recording indicator when isRecording is false', () => {
    render(<InfoScreen isRecording={false} onClose={noop} />);
    expect(screen.queryByLabelText('Aufnahme läuft')).not.toBeInTheDocument();
    expect(screen.queryByText('Aufnahme läuft')).not.toBeInTheDocument();
  });

  it('shows recording indicator when isRecording is true', () => {
    render(<InfoScreen isRecording={true} onClose={noop} />);
    expect(screen.getByLabelText('Aufnahme läuft')).toBeInTheDocument();
    expect(screen.getByText('Aufnahme läuft')).toBeInTheDocument();
  });

  it('shows key info content', () => {
    const { container } = render(<InfoScreen isRecording={false} onClose={noop} />);
    expect(container).toHaveTextContent(/FunktionsBarometer/);
    expect(container).toHaveTextContent(/verschlüsselt übermittelt/);
  });
});
