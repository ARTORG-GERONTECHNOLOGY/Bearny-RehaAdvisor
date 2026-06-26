import { render, screen, fireEvent } from '@testing-library/react';
import AssistanceScreen from '@/components/icf/AssistanceScreen';

describe('AssistanceScreen', () => {
  const noop = () => {};

  it('renders the assistance question and all four options', () => {
    render(<AssistanceScreen onSelect={noop} />);
    expect(
      screen.getByText(/Werden Sie das FunktionsBarometer jetzt alleine verwenden/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alleine' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Angehörige:r, Freund:in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gesundheitsfachperson' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Studien Interviewer:in' })).toBeInTheDocument();
  });

  it('calls onSelect with alone when Alleine is clicked', () => {
    const onSelect = jest.fn();
    render(<AssistanceScreen onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alleine' }));
    expect(onSelect).toHaveBeenCalledWith('alone');
  });

  it('calls onSelect with family_friend when Angehörige:r, Freund:in is clicked', () => {
    const onSelect = jest.fn();
    render(<AssistanceScreen onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Angehörige:r, Freund:in' }));
    expect(onSelect).toHaveBeenCalledWith('family_friend');
  });

  it('calls onSelect with healthcare when Gesundheitsfachperson is clicked', () => {
    const onSelect = jest.fn();
    render(<AssistanceScreen onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gesundheitsfachperson' }));
    expect(onSelect).toHaveBeenCalledWith('healthcare');
  });

  it('calls onSelect with study_interviewer when Studien Interviewer:in is clicked', () => {
    const onSelect = jest.fn();
    render(<AssistanceScreen onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Studien Interviewer:in' }));
    expect(onSelect).toHaveBeenCalledWith('study_interviewer');
  });
});
