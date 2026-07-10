import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AssistanceSheet from '@/components/PatientPage/AssistanceSheet';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

describe('AssistanceSheet', () => {
  it('renders nothing when closed', () => {
    render(<AssistanceSheet open={false} onSelect={jest.fn()} />);
    expect(screen.queryByText('assistanceQuestion')).not.toBeInTheDocument();
  });

  it('renders the question and both options when open', () => {
    render(<AssistanceSheet open={true} onSelect={jest.fn()} />);
    expect(screen.getByText('assistanceQuestion')).toBeInTheDocument();
    expect(screen.getByText('assistanceDescription')).toBeInTheDocument();
    expect(screen.getByText('assistanceAlone')).toBeInTheDocument();
    expect(screen.getByText('assistanceWithHelp')).toBeInTheDocument();
  });

  it('calls onSelect with "alone" when the alone button is clicked', () => {
    const onSelect = jest.fn();
    render(<AssistanceSheet open={true} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('assistanceAlone'));
    expect(onSelect).toHaveBeenCalledWith('alone');
  });

  it('calls onSelect with "with_help" when the with-help button is clicked', () => {
    const onSelect = jest.fn();
    render(<AssistanceSheet open={true} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('assistanceWithHelp'));
    expect(onSelect).toHaveBeenCalledWith('with_help');
  });
});
