import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockNavigate = jest.fn();
const mockSearchPanel = jest.fn(() => <div data-testid="search-panel" />);
const mockFilterSheet = jest.fn(() => <div data-testid="filter-sheet" />);
const mockDesktopFilters = jest.fn(() => <div data-testid="desktop-filters" />);
const mockInterventionCard = jest.fn(() => <div data-testid="intervention-card" />);

const mockTranslateText = jest.fn(async (text: string) => {
  if (text === 'Morning Stretch') {
    return { translatedText: 'Morgendehnung', detectedSourceLanguage: 'en' };
  }
  return { translatedText: text, detectedSourceLanguage: 'en' };
});

const mockStore = {
  visibleItemsForPatient: [] as any[],
  error: '',
  loading: false,
  fetchAll: jest.fn(async () => {}),
  clearError: jest.fn(),
};

jest.mock('mobx-react-lite', () => ({
  observer: (component: any) => component,
}));

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock('@/components/Layout', () => ({
  __esModule: true,
  default: jest.requireActual('@/__mocks__/components/Layout').default,
}));
jest.mock(
  '@/components/common/ErrorAlert',
  () =>
    function ErrorAlert({ message, onClose }: any) {
      return (
        <div>
          {message}
          <button onClick={onClose}>close-error</button>
        </div>
      );
    }
);

jest.mock('@/components/PatientLibrary/PatientLibrarySearchPanel', () => ({
  __esModule: true,
  default: (props: any) => {
    mockSearchPanel(props);
    return <div data-testid="search-panel" />;
  },
}));

jest.mock('@/components/PatientLibrary/PatientLibraryFilterSheet', () => ({
  __esModule: true,
  default: (props: any) => {
    mockFilterSheet(props);
    return <div data-testid="filter-sheet" />;
  },
}));

jest.mock('@/components/PatientLibrary/PatientLibraryDesktopFilters', () => ({
  __esModule: true,
  default: (props: any) => {
    mockDesktopFilters(props);
    return <div data-testid="desktop-filters" />;
  },
}));

jest.mock('@/components/PatientLibrary/PatientLibraryInterventionCard', () => ({
  __esModule: true,
  default: (props: any) => {
    mockInterventionCard(props);
    return <div data-testid="intervention-card" />;
  },
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: any) => <div>{children}</div>,
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
  SheetDescription: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/utils/translate', () => ({
  translateText: (...args: any[]) => mockTranslateText(...args),
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(async () => {}),
    isAuthenticated: true,
    userType: 'Patient',
  },
}));

jest.mock('@/stores/interventionsLibraryStore', () => ({
  patientInterventionsLibraryStore: mockStore,
}));

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

import PatientInterventionsLibrary from '@/pages/PatientInterventionsLibrary';

const getLatestSearchPanelProps = () => {
  const calls = mockSearchPanel.mock.calls;
  return calls[calls.length - 1][0];
};

const getLatestFilterSheetProps = () => {
  const calls = mockFilterSheet.mock.calls;
  return calls[calls.length - 1][0];
};

const getLatestDesktopFiltersProps = () => {
  const calls = mockDesktopFilters.mock.calls;
  return calls[calls.length - 1][0];
};

describe('PatientInterventionsLibrary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();

    mockStore.visibleItemsForPatient = [
      {
        _id: '1',
        id: '1',
        title: 'Morning Stretch',
        intervention_title: 'Morning Stretch',
        aims: ['exercise'],
        content_type: 'video',
        duration: 10,
      },
    ];
    mockStore.error = '';
    mockStore.loading = false;
  });

  it('passes translated-match search results and opens filter via panel callback', async () => {
    render(<PatientInterventionsLibrary />);

    await waitFor(() => {
      expect(mockStore.fetchAll).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockTranslateText).toHaveBeenCalledWith('Morning Stretch');
    });

    await waitFor(() => {
      expect(getLatestSearchPanelProps().searchResults).toEqual([]);
      expect(getLatestFilterSheetProps().open).toBe(false);
    });

    await act(async () => {
      getLatestSearchPanelProps().onSearchTermChange('morgendehnung');
    });

    await waitFor(() => {
      expect(getLatestSearchPanelProps().searchResults).toHaveLength(1);
      expect(getLatestSearchPanelProps().searchResults[0]._id).toBe('1');
    });

    await act(async () => {
      getLatestSearchPanelProps().onOpenFilter();
    });

    await waitFor(() => {
      expect(getLatestFilterSheetProps().open).toBe(true);
    });
  });

  describe('filter session persistence', () => {
    const FILTER_KEY = 'patientLibraryFilters';

    it('restores saved filters from sessionStorage on mount', async () => {
      sessionStorage.setItem(
        FILTER_KEY,
        JSON.stringify({
          searchTerm: 'yoga',
          contentTypeFilter: ['video'],
          aimsFilter: ['exercise'],
          languageFilter: ['en'],
          durationFilterIndices: [1, 3],
          ratingFilterIndices: [2, 4],
        })
      );

      render(<PatientInterventionsLibrary />);

      await waitFor(() => {
        expect(mockStore.fetchAll).toHaveBeenCalled();
      });

      const props = getLatestDesktopFiltersProps();
      expect(props.searchTerm).toBe('yoga');
      expect(props.contentTypeFilter).toEqual(['video']);
      expect(props.aimsFilter).toEqual(['exercise']);
      expect(props.languageFilter).toEqual(['en']);
      expect(props.durationFilterIndices).toEqual([1, 3]);
      expect(props.ratingFilterIndices).toEqual([2, 4]);
    });

    it('saves updated filters to sessionStorage when a filter changes', async () => {
      render(<PatientInterventionsLibrary />);

      await waitFor(() => {
        expect(mockStore.fetchAll).toHaveBeenCalled();
      });

      await act(async () => {
        getLatestDesktopFiltersProps().setAimsFilter(['exercise']);
      });

      await waitFor(() => {
        const saved = JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? '{}');
        expect(saved.aimsFilter).toEqual(['exercise']);
      });
    });

    it('resets filters to defaults in sessionStorage after resetAllFilters', async () => {
      sessionStorage.setItem(
        FILTER_KEY,
        JSON.stringify({
          searchTerm: 'yoga',
          contentTypeFilter: ['video'],
          aimsFilter: ['exercise'],
          languageFilter: ['en'],
          durationFilterIndices: [1, 3],
          ratingFilterIndices: [2, 4],
        })
      );

      render(<PatientInterventionsLibrary />);

      await waitFor(() => {
        expect(mockStore.fetchAll).toHaveBeenCalled();
      });

      // Verify saved values were loaded
      expect(getLatestDesktopFiltersProps().searchTerm).toBe('yoga');

      await act(async () => {
        getLatestFilterSheetProps().onResetFilters();
      });

      await waitFor(() => {
        expect(getLatestDesktopFiltersProps().searchTerm).toBe('');
        expect(getLatestDesktopFiltersProps().aimsFilter).toEqual([]);
        expect(getLatestDesktopFiltersProps().contentTypeFilter).toEqual([]);
      });

      const saved = JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? '{}');
      expect(saved.searchTerm).toBe('');
      expect(saved.aimsFilter).toEqual([]);
    });
  });

  it('shows an error alert and clears it via the close callback', async () => {
    mockStore.error = 'Something went wrong';
    render(<PatientInterventionsLibrary />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    fireEvent.click(screen.getByText('close-error'));
    expect(mockStore.clearError).toHaveBeenCalled();
  });

  it('navigates via openDetails using intervention_id/_id/id, and no-ops without any id', async () => {
    render(<PatientInterventionsLibrary />);

    await waitFor(() => {
      expect(mockStore.fetchAll).toHaveBeenCalled();
    });

    getLatestSearchPanelProps().onOpenDetails({ intervention_id: 'iv-1' });
    expect(mockNavigate).toHaveBeenCalledWith('/patient-intervention/iv-1');

    mockNavigate.mockClear();
    getLatestSearchPanelProps().onOpenDetails({ _id: 'x-1' });
    expect(mockNavigate).toHaveBeenCalledWith('/patient-intervention/x-1');

    mockNavigate.mockClear();
    getLatestSearchPanelProps().onOpenDetails({});
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('closes the search via onCloseSearch and clears the term on Escape while searching', async () => {
    render(<PatientInterventionsLibrary />);

    await waitFor(() => {
      expect(mockStore.fetchAll).toHaveBeenCalled();
    });

    await act(async () => {
      getLatestDesktopFiltersProps().onSearchTermChange('yoga');
    });
    await waitFor(() => {
      expect(getLatestDesktopFiltersProps().searchTerm).toBe('yoga');
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    await waitFor(() => {
      expect(getLatestDesktopFiltersProps().searchTerm).toBe('');
    });

    await act(async () => {
      getLatestSearchPanelProps().onSearchTermChange('yoga');
    });
    await waitFor(() => {
      expect(getLatestSearchPanelProps().searchTerm).toBe('yoga');
    });
    await act(async () => {
      getLatestSearchPanelProps().onCloseSearch();
    });
    await waitFor(() => {
      expect(getLatestSearchPanelProps().searchTerm).toBe('');
    });
  });

  it('invokes getDisplayTitle and getResultIcon render-prop callbacks passed to the search panel', async () => {
    render(<PatientInterventionsLibrary />);

    await waitFor(() => {
      expect(mockStore.fetchAll).toHaveBeenCalled();
    });

    const props = getLatestSearchPanelProps();
    expect(typeof props.getDisplayTitle({ _id: '1' })).toBe('string');
    expect(props.getResultIcon({ aims: ['exercise'] })).toBeTruthy();
    expect(props.getResultIcon({ aims: [] })).toBeTruthy();

    const highlighted = props.renderHighlightedTitle('some title');
    expect(highlighted).toBeTruthy();
  });

  it('highlights the matching portion of a title once a search term is set', async () => {
    render(<PatientInterventionsLibrary />);

    await waitFor(() => {
      expect(mockStore.fetchAll).toHaveBeenCalled();
    });

    await act(async () => {
      getLatestDesktopFiltersProps().onSearchTermChange('stretch');
    });

    await waitFor(() => {
      const parts = getLatestSearchPanelProps().renderHighlightedTitle('Morning Stretch');
      expect(Array.isArray(parts)).toBe(true);
    });
  });

  it('falls back to the raw title when translateText rejects', async () => {
    mockTranslateText.mockRejectedValueOnce(new Error('translate down'));

    render(<PatientInterventionsLibrary />);

    await waitFor(() => {
      expect(mockTranslateText).toHaveBeenCalledWith('Morning Stretch');
    });

    await waitFor(() => {
      expect(getLatestSearchPanelProps().getDisplayTitle({ _id: '1', id: '1' })).toBe(
        'Morning Stretch'
      );
    });
  });

  it('opens and closes the mobile filter sheet via onOpenChange', async () => {
    render(<PatientInterventionsLibrary />);

    await waitFor(() => {
      expect(mockStore.fetchAll).toHaveBeenCalled();
    });

    await act(async () => {
      getLatestSearchPanelProps().onOpenFilter();
    });
    await waitFor(() => {
      expect(getLatestFilterSheetProps().open).toBe(true);
    });

    await act(async () => {
      getLatestFilterSheetProps().onOpenChange(true);
    });
    expect(getLatestFilterSheetProps().open).toBe(true);

    await act(async () => {
      getLatestFilterSheetProps().onOpenChange(false);
    });
    await waitFor(() => {
      expect(getLatestFilterSheetProps().open).toBe(false);
    });
  });

  it('reads a corrupted translation cache without crashing, falling back to a live fetch', async () => {
    sessionStorage.setItem('intervention_title_translations_v1', 'not-json{{');

    render(<PatientInterventionsLibrary />);

    await waitFor(() => {
      expect(mockTranslateText).toHaveBeenCalledWith('Morning Stretch');
    });
  });

  it('uses a cached translated title from sessionStorage without re-fetching it', async () => {
    sessionStorage.setItem(
      'intervention_title_translations_v1',
      JSON.stringify({ 'en:1': { title: 'Cached Title', lang: null } })
    );

    render(<PatientInterventionsLibrary />);

    await waitFor(() => {
      expect(mockStore.fetchAll).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(getLatestSearchPanelProps().getDisplayTitle({ _id: '1', id: '1' })).toBe(
        'Cached Title'
      );
    });

    expect(mockTranslateText).not.toHaveBeenCalled();
  });

  it('resets translated titles and skips fetching when there are no source items', async () => {
    mockStore.visibleItemsForPatient = [];
    render(<PatientInterventionsLibrary />);

    await waitFor(() => {
      expect(mockStore.fetchAll).toHaveBeenCalled();
    });

    expect(mockTranslateText).not.toHaveBeenCalled();
  });

  it('applies content-type and rating filters, builds language options, and renders type sections/cards', async () => {
    mockStore.visibleItemsForPatient = [
      {
        _id: '1',
        id: '1',
        title: 'Morning Stretch',
        aims: ['exercise'],
        content_type: 'video',
        duration: 10,
        avg_rating: 3,
        language: 'en',
      },
      {
        _id: '2',
        id: '2',
        title: 'Learn Basics',
        aims: ['education'],
        content_type: 'pdf',
        duration: 40,
        avg_rating: 5,
        language: 'xx',
        available_languages: ['xx', 'en'],
      },
      {
        _id: '3',
        id: '3',
        title: '',
        intervention_title: '',
        aims: ['instruction'],
        content_type: 'audio',
        duration: 15,
      },
    ];

    render(<PatientInterventionsLibrary />);

    await waitFor(() => {
      expect(mockStore.fetchAll).toHaveBeenCalled();
    });

    await waitFor(() => {
      const langOptions = getLatestDesktopFiltersProps().languageOptions;
      expect(langOptions.some((o: any) => o.value === 'en' && o.label === 'English')).toBe(true);
      expect(langOptions.some((o: any) => o.value === 'xx' && o.label === 'XX')).toBe(true);
    });

    // Rendering the flag icon for a mapped language exercises the FlagIcon component body.
    const langOptions = getLatestDesktopFiltersProps().languageOptions;
    const enOption = langOptions.find((o: any) => o.value === 'en');
    const FlagIcon = enOption.Icon;
    const flagElement = FlagIcon({ className: 'w-4 h-4' });
    expect(flagElement.props.alt).toBe('en');

    // Content-type filter narrows the list down to the "video" item only.
    await act(async () => {
      getLatestDesktopFiltersProps().setContentTypeFilter(['video']);
    });
    await waitFor(() => {
      expect(getLatestFilterSheetProps().filteredCount).toBe(1);
    });
    await act(async () => {
      getLatestDesktopFiltersProps().setContentTypeFilter([]);
    });

    // Three distinct aim keywords ("exercise", "education", "instruction") each render
    // their own Section header with a "Contents" badge.
    await waitFor(() => {
      expect(screen.getAllByText('Exercise').length).toBeGreaterThan(0);
      expect(screen.getByText('Education')).toBeInTheDocument();
      expect(screen.getByText('Instructions')).toBeInTheDocument();
    });

    // Clicking a section header switches the active type-sheet section.
    fireEvent.click(screen.getByText('Education'));
    await waitFor(() => {
      expect(mockInterventionCard).toHaveBeenCalled();
    });

    // Trigger the onClick handed to the rendered intervention cards (both the
    // in-section list card and the type-sheet card use the same openDetails callback).
    const cardCalls = mockInterventionCard.mock.calls;
    mockNavigate.mockClear();
    cardCalls[0][0].onClick();
    expect(mockNavigate).toHaveBeenCalled();

    const sheetCard = cardCalls.find((c: any) => c[0].containerClassName === 'w-full');
    expect(sheetCard).toBeTruthy();
    mockNavigate.mockClear();
    sheetCard![0].onClick();
    expect(mockNavigate).toHaveBeenCalled();
  });

  it('groups interventions whose aims do not match exercise/education/instruction into an "Other" section', async () => {
    mockStore.visibleItemsForPatient = [
      {
        _id: '1',
        id: '1',
        title: 'Morning Stretch',
        aims: ['exercise'],
        content_type: 'video',
        duration: 10,
      },
      {
        _id: '2',
        id: '2',
        title: 'Daily Reminder',
        aims: ['reminder'],
        content_type: 'text',
        duration: 5,
      },
      {
        _id: '3',
        id: '3',
        title: 'No Aims Set',
        content_type: 'pdf',
        duration: 20,
      },
    ];

    render(<PatientInterventionsLibrary />);

    await waitFor(() => {
      expect(mockStore.fetchAll).toHaveBeenCalled();
    });

    // "Other" section appears alongside Exercise, and no Education/Instructions
    // section renders since nothing in this fixture matches those keywords.
    await waitFor(() => {
      expect(screen.getByText('Other')).toBeInTheDocument();
    });
    expect(screen.queryByText('Education')).not.toBeInTheDocument();
    expect(screen.queryByText('Instructions')).not.toBeInTheDocument();

    const otherSection = screen.getByText('Other').closest('section') as HTMLElement;
    expect(otherSection).toBeTruthy();
    expect(within(otherSection).getByText(/2\s*Contents/)).toBeInTheDocument();

    // Both the "reminder"-aimed item and the item with no aims land in Other,
    // while the "exercise"-aimed item is rendered in its own section instead.
    const otherCardIds = mockInterventionCard.mock.calls
      .map((call: any) => call[0])
      .filter((props: any) => props.containerClassName === 'shrink-0 w-72')
      .map((props: any) => props.item._id);

    expect(otherCardIds).toEqual(expect.arrayContaining(['1', '2', '3']));
  });
});
