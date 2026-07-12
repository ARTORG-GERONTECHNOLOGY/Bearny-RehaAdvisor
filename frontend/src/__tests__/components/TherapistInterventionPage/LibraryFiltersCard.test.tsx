import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import LibraryFiltersCard, {
  LibraryFiltersState,
} from '@/components/TherapistInterventionPage/LibraryFiltersCard';

// Mock react-select: expose a distinct testid per instance via placeholder text,
// and buttons that trigger onChange so we can assert wiring without simulating
// react-select's internal combobox interactions.
jest.mock(
  'react-select',
  () =>
    function ReactSelect(props: any) {
      const testId = props.placeholder?.includes('Diagnosis')
        ? 'diagnosis-select'
        : props.placeholder?.includes('Language')
          ? 'language-select'
          : props.placeholder?.includes('Aims')
            ? 'aims-select'
            : props.placeholder?.includes('Tags')
              ? 'tag-select'
              : 'other-select';
      return (
        <div data-testid={testId}>
          <button onClick={() => props.onChange?.([{ value: 'picked', label: 'Picked' }])}>
            change
          </button>
          <button onClick={() => props.onChange?.(null)}>clear</button>
        </div>
      );
    }
);

const t = (key: string) => key;

const makeFilters = (overrides: Partial<LibraryFiltersState> = {}): LibraryFiltersState => ({
  searchTerm: '',
  diagnosisFilter: [],
  languageFilter: [],
  contentTypeFilter: '',
  aimsFilter: [],
  tagFilter: [],
  ...overrides,
});

describe('LibraryFiltersCard', () => {
  const onChange = jest.fn();
  const onReset = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderCard = (filters: Partial<LibraryFiltersState> = {}) =>
    render(
      <LibraryFiltersCard
        t={t}
        filters={makeFilters(filters)}
        onChange={onChange}
        onReset={onReset}
      />
    );

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  describe('rendering', () => {
    it('renders the search input', () => {
      renderCard();
      expect(screen.getByPlaceholderText('Search Interventions')).toBeInTheDocument();
    });

    it('renders all four react-select filters', () => {
      renderCard();
      expect(screen.getByTestId('diagnosis-select')).toBeInTheDocument();
      expect(screen.getByTestId('language-select')).toBeInTheDocument();
      expect(screen.getByTestId('aims-select')).toBeInTheDocument();
      expect(screen.getByTestId('tag-select')).toBeInTheDocument();
    });

    it('renders content type options from the taxonomy config', () => {
      renderCard();
      const select = screen.getByRole('combobox');
      expect(within(select).getByRole('option', { name: 'video' })).toBeInTheDocument();
      expect(within(select).getByRole('option', { name: 'app' })).toBeInTheDocument();
    });

    it('renders the Reset filters button', () => {
      renderCard();
      expect(screen.getByRole('button', { name: /Reset filters/i })).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Field interactions
  // ------------------------------------------------------------------
  describe('field interactions', () => {
    it('calls onChange with the updated search term', () => {
      renderCard();
      fireEvent.change(screen.getByPlaceholderText('Search Interventions'), {
        target: { value: 'stretch' },
      });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ searchTerm: 'stretch' }));
    });

    it('calls onChange with the updated content type', () => {
      renderCard();
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'video' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ contentTypeFilter: 'video' })
      );
    });

    it('updates diagnosisFilter via react-select', () => {
      renderCard();
      fireEvent.click(within(screen.getByTestId('diagnosis-select')).getByText('change'));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ diagnosisFilter: ['picked'] })
      );
    });

    it('clears diagnosisFilter back to [] when the selection is cleared', () => {
      renderCard();
      fireEvent.click(within(screen.getByTestId('diagnosis-select')).getByText('clear'));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ diagnosisFilter: [] }));
    });

    it('updates languageFilter via react-select', () => {
      renderCard();
      fireEvent.click(within(screen.getByTestId('language-select')).getByText('change'));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ languageFilter: ['picked'] })
      );
    });

    it('updates aimsFilter via react-select', () => {
      renderCard();
      fireEvent.click(within(screen.getByTestId('aims-select')).getByText('change'));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ aimsFilter: ['picked'] }));
    });

    it('updates tagFilter via react-select', () => {
      renderCard();
      fireEvent.click(within(screen.getByTestId('tag-select')).getByText('change'));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tagFilter: ['picked'] }));
    });

    it('calls onReset when Reset filters is clicked', () => {
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
      expect(onReset).toHaveBeenCalled();
    });

    it('renders already-selected filter values without crashing', () => {
      renderCard({
        diagnosisFilter: ['Stroke'],
        languageFilter: ['en'],
        aimsFilter: ['Education'],
        tagFilter: ['Home'],
        contentTypeFilter: 'video',
      });
      expect(screen.getByTestId('diagnosis-select')).toBeInTheDocument();
      expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('video');
    });
  });
});
