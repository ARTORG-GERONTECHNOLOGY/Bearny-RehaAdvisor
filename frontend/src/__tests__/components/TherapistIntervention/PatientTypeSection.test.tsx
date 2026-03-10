import { render, screen, fireEvent } from '@testing-library/react';
import PatientTypeSection from '@/components/AddIntervention/PatientTypeSection';
import '@testing-library/jest-dom';

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('PatientTypeSection', () => {
  const mockOnChange = jest.fn();
  const diagnoses = ['DiagnosisA', 'DiagnosisB'];

  const renderComponent = (types: any[]) =>
    render(<PatientTypeSection types={types} diagnoses={diagnoses} onChange={mockOnChange} />);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders patient types and frequencies correctly', () => {
    const types = [{ type: 'DiagnosisA', frequency: 'Weekly', includeOption: true }];
    renderComponent(types);

    expect(screen.getByLabelText('PatientType')).toBeInTheDocument();
    expect(screen.getByLabelText('Frequency')).toBeInTheDocument();
    expect(screen.getByLabelText('Core')).toBeChecked();
    expect(screen.getByLabelText('Supportive')).not.toBeChecked();
  });

  it('calls onChange when type is changed', () => {
    const types = [{ type: '', frequency: 'Weekly', includeOption: true }];
    renderComponent(types);

    const select = screen.getByLabelText('PatientType');
    fireEvent.change(select, { target: { value: 'DiagnosisB' } });

    expect(mockOnChange).toHaveBeenCalledWith(0, 'type', 'DiagnosisB');
  });

  it('calls onChange when frequency is changed', () => {
    const types = [{ type: 'DiagnosisA', frequency: '', includeOption: true }];
    renderComponent(types);

    const select = screen.getByLabelText('Frequency');
    fireEvent.change(select, { target: { value: 'Monthly' } });

    expect(mockOnChange).toHaveBeenCalledWith(0, 'frequency', 'Monthly');
  });

  it('calls onChange when selecting CoreExercise', () => {
    const types = [{ type: 'DiagnosisA', frequency: 'Weekly', includeOption: null }];
    renderComponent(types);

    const coreRadio = screen.getByLabelText('Core');
    fireEvent.click(coreRadio);

    expect(mockOnChange).toHaveBeenCalledWith(0, 'includeOption', true);
  });

  it('calls onChange when selecting Supportive', () => {
    const types = [{ type: 'DiagnosisA', frequency: 'Weekly', includeOption: null }];
    renderComponent(types);

    const supportiveRadio = screen.getByLabelText('Supportive');
    fireEvent.click(supportiveRadio);

    expect(mockOnChange).toHaveBeenCalledWith(0, 'includeOption', false);
  });
});
