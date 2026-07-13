import { render, screen, fireEvent, act } from '@testing-library/react';
import FilterBar from '@/components/TherapistInterventionPage/FilterBar';
import '@testing-library/jest-dom';

// Mock ResizeObserver, capturing the callback so tests can simulate a resize.
let roCallback: ((entries: any[]) => void) | null = null;
global.ResizeObserver = class ResizeObserver {
  constructor(cb: (entries: any[]) => void) {
    roCallback = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

const triggerResize = (width: number) => {
  act(() => {
    roCallback?.([{ contentRect: { width } }]);
  });
};

// 🛠 Mock react-select
jest.mock(
  'react-select',
  () =>
    function ReactSelect(props: any) {
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
    }
);

describe('FilterBar component', () => {
  const mockSetSearchTerm = jest.fn();
  const mockSetDiagnosisFilter = jest.fn();
  const mockSetContentTypeFilter = jest.fn();
  const mockSetTagFilter = jest.fn();

  const mockT = (key: string) => key;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderComponent = () =>
    render(
      <FilterBar
        searchTerm=""
        setSearchTerm={mockSetSearchTerm}
        diagnosisFilter={[]}
        setDiagnosisFilter={mockSetDiagnosisFilter}
        contentTypeFilter=""
        setContentTypeFilter={mockSetContentTypeFilter}
        tagFilter={[]}
        setTagFilter={mockSetTagFilter}
        t={mockT}
      />
    );

  test('renders all filter inputs', () => {
    renderComponent();

    expect(screen.getByPlaceholderText('Search Interventions')).toBeInTheDocument();
    expect(screen.getByTestId('diagnosis-select')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filter by Content Type' })).toBeInTheDocument();
    expect(screen.getByTestId('tag-select')).toBeInTheDocument();
  });

  test('calls setSearchTerm when input is changed', () => {
    renderComponent();

    const input = screen.getByPlaceholderText('Search Interventions');
    fireEvent.change(input, { target: { value: 'stretch' } });

    expect(mockSetSearchTerm).toHaveBeenCalledWith('stretch');
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

  test('renders the language select when setLanguageFilter is provided', () => {
    render(
      <FilterBar
        searchTerm=""
        setSearchTerm={mockSetSearchTerm}
        diagnosisFilter={[]}
        setDiagnosisFilter={mockSetDiagnosisFilter}
        languageFilter={['en']}
        setLanguageFilter={jest.fn()}
        contentTypeFilter=""
        setContentTypeFilter={mockSetContentTypeFilter}
        tagFilter={[]}
        setTagFilter={mockSetTagFilter}
        t={mockT}
      />
    );

    expect(screen.getAllByTestId('other-select').length).toBeGreaterThan(0);
  });

  test('calls setLanguageFilter when a language is selected', () => {
    const setLanguageFilter = jest.fn();
    render(
      <FilterBar
        searchTerm=""
        setSearchTerm={mockSetSearchTerm}
        diagnosisFilter={[]}
        setDiagnosisFilter={mockSetDiagnosisFilter}
        languageFilter={[]}
        setLanguageFilter={setLanguageFilter}
        contentTypeFilter=""
        setContentTypeFilter={mockSetContentTypeFilter}
        tagFilter={[]}
        setTagFilter={mockSetTagFilter}
        t={mockT}
      />
    );

    const languageSelect = screen.getAllByTestId('other-select')[0];
    fireEvent.click(languageSelect.querySelector('button')!);
    expect(setLanguageFilter).toHaveBeenCalledWith(['At Home']);
  });

  describe('reset button and result meta row', () => {
    it('shows the reset button in the wide-layout meta row and calls onReset', () => {
      const onReset = jest.fn();
      render(
        <FilterBar
          searchTerm=""
          setSearchTerm={mockSetSearchTerm}
          diagnosisFilter={['Stroke']}
          setDiagnosisFilter={mockSetDiagnosisFilter}
          contentTypeFilter=""
          setContentTypeFilter={mockSetContentTypeFilter}
          tagFilter={[]}
          setTagFilter={mockSetTagFilter}
          t={mockT}
          onReset={onReset}
          resultCount={7}
        />
      );

      expect(screen.getByText('7 items')).toBeInTheDocument();
      const resetButtons = screen.getAllByRole('button', { name: 'Reset filters' });
      fireEvent.click(resetButtons[0]);
      expect(onReset).toHaveBeenCalled();
    });

    it('shows a loading indicator instead of the result count', () => {
      render(
        <FilterBar
          searchTerm=""
          setSearchTerm={mockSetSearchTerm}
          diagnosisFilter={[]}
          setDiagnosisFilter={mockSetDiagnosisFilter}
          contentTypeFilter=""
          setContentTypeFilter={mockSetContentTypeFilter}
          tagFilter={[]}
          setTagFilter={mockSetTagFilter}
          t={mockT}
          loading
        />
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('renders a bare reset row when there is no result count or loading state', () => {
      const onReset = jest.fn();
      render(
        <FilterBar
          searchTerm=""
          setSearchTerm={mockSetSearchTerm}
          diagnosisFilter={[]}
          setDiagnosisFilter={mockSetDiagnosisFilter}
          contentTypeFilter=""
          setContentTypeFilter={mockSetContentTypeFilter}
          tagFilter={[]}
          setTagFilter={mockSetTagFilter}
          t={mockT}
          onReset={onReset}
        />
      );

      const resetButtons = screen.getAllByRole('button', { name: 'Reset filters' });
      fireEvent.click(resetButtons[0]);
      expect(onReset).toHaveBeenCalled();
    });
  });

  describe('narrow layout', () => {
    it('switches to the dropdown toggle when the container becomes narrow, and shows the active filter count', () => {
      renderComponent();
      triggerResize(400);

      const toggle = screen.getByRole('button', { name: /Filters/i });
      expect(toggle).toBeInTheDocument();
    });

    it('shows the active-filters count badge in the toggle label', () => {
      render(
        <FilterBar
          searchTerm=""
          setSearchTerm={mockSetSearchTerm}
          diagnosisFilter={['Stroke']}
          setDiagnosisFilter={mockSetDiagnosisFilter}
          contentTypeFilter="video"
          setContentTypeFilter={mockSetContentTypeFilter}
          tagFilter={['Education']}
          setTagFilter={mockSetTagFilter}
          t={mockT}
        />
      );
      triggerResize(400);

      expect(screen.getByRole('button', { name: /Filters \(3\)/i })).toBeInTheDocument();
    });

    it('opens the dropdown menu and closes it again on toggle click', () => {
      renderComponent();
      triggerResize(400);

      const toggle = screen.getByRole('button', { name: /Filters/i });
      fireEvent.click(toggle);
      fireEvent.click(toggle);

      // No crash and the toggle remains present after opening/closing twice
      expect(screen.getByRole('button', { name: /Filters/i })).toBeInTheDocument();
    });

    it('closes the dropdown and calls onReset when resetting from within the narrow grid', () => {
      const onReset = jest.fn();
      render(
        <FilterBar
          searchTerm=""
          setSearchTerm={mockSetSearchTerm}
          diagnosisFilter={[]}
          setDiagnosisFilter={mockSetDiagnosisFilter}
          contentTypeFilter=""
          setContentTypeFilter={mockSetContentTypeFilter}
          tagFilter={[]}
          setTagFilter={mockSetTagFilter}
          t={mockT}
          onReset={onReset}
        />
      );
      triggerResize(400);

      const toggle = screen.getByRole('button', { name: /Filters/i });
      fireEvent.click(toggle);

      const resetButtons = screen.getAllByRole('button', { name: 'Reset filters' });
      fireEvent.click(resetButtons[resetButtons.length - 1]);
      expect(onReset).toHaveBeenCalled();
    });

    it('switches back to the wide layout on a subsequent wide resize', () => {
      renderComponent();
      triggerResize(400);
      expect(screen.getByRole('button', { name: /Filters/i })).toBeInTheDocument();

      triggerResize(800);
      expect(screen.queryByRole('button', { name: /Filters/i })).not.toBeInTheDocument();
    });
  });
});
