import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar from '@/components/TherapistInterventionPage/FilterBar';
import '@testing-library/jest-dom';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// 🛠 Mock react-select
jest.mock('react-select', () => (props: any) => {
  const testId = props.placeholder?.includes('Tags')
    ? 'tag-select'
    : props.placeholder?.includes('Diagnosis')
      ? 'diagnosis-select'
      : 'other-select';

  return (
    <div data-testid={testId}>
      <button
        onClick={() => {
          if (props.onChange) {
            props.onChange([{ value: 'At Home', label: 'At Home' }]);
          }
        }}
      >
        Select Option
      </button>
    </div>
  );
});

describe('FilterBar component', () => {
  const mockSetSearchTerm = jest.fn();
  const mockSetPatientTypeFilter = jest.fn();
  const mockSetDiagnosisFilter = jest.fn();
  const mockSetContentTypeFilter = jest.fn();
  const mockSetTagFilter = jest.fn();
  const mockSetFrequencyFilter = jest.fn();

  const mockT = (key: string) => key;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderComponent = () =>
    render(
      <FilterBar
        searchTerm=""
        setSearchTerm={mockSetSearchTerm}
        patientTypeFilter=""
        setPatientTypeFilter={mockSetPatientTypeFilter}
        diagnosisFilter={[]}
        setDiagnosisFilter={mockSetDiagnosisFilter}
        contentTypeFilter=""
        setContentTypeFilter={mockSetContentTypeFilter}
        tagFilter={[]}
        setTagFilter={mockSetTagFilter}
        frequencyFilter=""
        setFrequencyFilter={mockSetFrequencyFilter}
        t={mockT}
      />
    );

  test('renders all filter inputs', () => {
    renderComponent();

    expect(screen.getByPlaceholderText('Search Interventions')).toBeInTheDocument();
    // Select elements can be queried by their id
    expect(screen.getByRole('combobox', { name: 'Filter by Patient Type' })).toBeInTheDocument();
    expect(screen.getByTestId('diagnosis-select')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filter by Content Type' })).toBeInTheDocument();
    expect(screen.getByTestId('tag-select')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filter by Frequency' })).toBeInTheDocument();
  });

  test('calls setSearchTerm when input is changed', () => {
    renderComponent();

    const input = screen.getByPlaceholderText('Search Interventions');
    fireEvent.change(input, { target: { value: 'stretch' } });

    expect(mockSetSearchTerm).toHaveBeenCalledWith('stretch');
  });

  test('calls setPatientTypeFilter when patient type is selected', () => {
    renderComponent();

    const select = screen.getByRole('combobox', { name: 'Filter by Patient Type' });
    fireEvent.change(select, { target: { value: 'heart failure' } });

    expect(mockSetPatientTypeFilter).toHaveBeenCalledWith('heart failure');
  });

  test('calls setFrequencyFilter when frequency is selected', () => {
    renderComponent();

    const select = screen.getByRole('combobox', { name: 'Filter by Frequency' });
    fireEvent.change(select, { target: { value: 'week' } });

    expect(mockSetFrequencyFilter).toHaveBeenCalledWith('week');
  });

  test('calls setTagFilter when tag is selected via react-select', () => {
    renderComponent();
    const tagSelect = screen.getByTestId('tag-select');
    const button = tagSelect.querySelector('button');
    fireEvent.click(button!);
    expect(mockSetTagFilter).toHaveBeenCalledWith(['At Home']);
  });

  test('calls setDiagnosisFilter when diagnosis is selected via react-select', () => {
    renderComponent();
    const diagnosisSelect = screen.getByTestId('diagnosis-select');
    const button = diagnosisSelect.querySelector('button');
    fireEvent.click(button!);
    expect(mockSetDiagnosisFilter).toHaveBeenCalledWith(['At Home']);
  });

  test('calls setContentTypeFilter when content type is selected', () => {
    renderComponent();

    const select = screen.getByRole('combobox', { name: 'Filter by Content Type' });
    fireEvent.change(select, { target: { value: 'video' } });

    expect(mockSetContentTypeFilter).toHaveBeenCalledWith('video');
  });
});
