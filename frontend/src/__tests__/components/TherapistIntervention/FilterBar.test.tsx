import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar from '../../../components/TherapistInterventionPage/FilterBar';
import '@testing-library/jest-dom';

// 🛠 Mock react-select
jest.mock('react-select', () => (props: any) => {
  const testId = props.placeholder.includes('Tags')
    ? 'tag-select'
    : props.placeholder.includes('Benefit')
      ? 'benefit-select'
      : 'other-select';

  return (
    <div>
      <button
        data-testid={testId}
        onClick={() => props.onChange([{ value: 'At Home', label: 'At Home' }])}
      >
        Select At Home
      </button>
    </div>
  );
});

describe('FilterBar component', () => {
  const mockSetSearchTerm = jest.fn();
  const mockSetPatientTypeFilter = jest.fn();
  const mockSetCoreSupportFilter = jest.fn();
  const mockSetContentTypeFilter = jest.fn();
  const mockSetTagFilter = jest.fn();
  const mockSetBenefitForFilter = jest.fn();
  const mockSetFrequencyFilter = jest.fn();

  const mockConfig = {
    RecomendationInfo: {
      intensity: ['Core', 'Supportive'],
      types: ['Video', 'PDFs'],
      tags: ['At Home', 'Outdoor'],
      benefits: ['Mobility', 'Mental Health'],
      frequency: ['Daily', 'Weekly'],
    },
  };

  const diagnoses = ['Cardiology', 'Neurology'];

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
        coreSupportFilter=""
        setCoreSupportFilter={mockSetCoreSupportFilter}
        contentTypeFilter=""
        setContentTypeFilter={mockSetContentTypeFilter}
        tagFilter={[]}
        setTagFilter={mockSetTagFilter}
        benefitForFilter={[]}
        setBenefitForFilter={mockSetBenefitForFilter}
        frequencyFilter=""
        setFrequencyFilter={mockSetFrequencyFilter}
        diagnoses={diagnoses}
        config={mockConfig}
        t={mockT}
      />
    );

  test('renders all filter inputs', () => {
    renderComponent();

    expect(screen.getByPlaceholderText('Search Interventions')).toBeInTheDocument();
    expect(screen.getByText('Filter by Patient Type')).toBeInTheDocument();
    expect(screen.getByText('Filter by Core/Supportive')).toBeInTheDocument();
    expect(screen.getByText('Filter by Content Type')).toBeInTheDocument();

    // Update these two lines:
    expect(screen.getByTestId('tag-select')).toBeInTheDocument();
    expect(screen.getByTestId('benefit-select')).toBeInTheDocument();

    expect(screen.getByText('Filter by Frequency')).toBeInTheDocument();
  });

  test('calls setSearchTerm when input is changed', () => {
    renderComponent();

    const input = screen.getByPlaceholderText('Search Interventions');
    fireEvent.change(input, { target: { value: 'stretch' } });

    expect(mockSetSearchTerm).toHaveBeenCalledWith('stretch');
  });

  test('calls setPatientTypeFilter when diagnosis is selected', () => {
    renderComponent();

    const select = screen.getByDisplayValue('Filter by Patient Type');
    fireEvent.change(select, { target: { value: 'Cardiology' } });

    expect(mockSetPatientTypeFilter).toHaveBeenCalledWith('Cardiology');
  });

  test('calls setFrequencyFilter when frequency is selected', () => {
    renderComponent();

    const select = screen.getByDisplayValue('Filter by Frequency');
    fireEvent.change(select, { target: { value: 'Weekly' } });

    expect(mockSetFrequencyFilter).toHaveBeenCalledWith('Weekly');
  });

  test('calls setTagFilter when tag is selected', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('tag-select'));
    expect(mockSetTagFilter).toHaveBeenCalledWith(['At Home']);
  });

  test('calls setBenefitForFilter when benefit is selected', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('benefit-select'));
    expect(mockSetBenefitForFilter).toHaveBeenCalledWith(['At Home']);
  });

  test('calls setCoreSupportFilter when core/supportive is selected', () => {
    renderComponent();

    const select = screen.getByDisplayValue('Filter by Core/Supportive');
    fireEvent.change(select, { target: { value: 'Supportive' } });

    expect(mockSetCoreSupportFilter).toHaveBeenCalledWith('Supportive');
  });

  test('calls setContentTypeFilter when content type is selected', () => {
    renderComponent();

    const select = screen.getByDisplayValue('Filter by Content Type');
    fireEvent.change(select, { target: { value: 'Video' } });

    expect(mockSetContentTypeFilter).toHaveBeenCalledWith('Video');
  });

  test('calls setTagFilter when tag is selected via react-select', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('tag-select')); // already mocked
    expect(mockSetTagFilter).toHaveBeenCalledWith(['At Home']);
  });

  test('calls setBenefitForFilter when benefit is selected via react-select', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('benefit-select')); // already mocked
    expect(mockSetBenefitForFilter).toHaveBeenCalledWith(['At Home']);
  });
});
