import React from 'react';
import { act, render, waitFor } from '@testing-library/react';

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
    function ErrorAlert({ message }: any) {
      return <div>{message}</div>;
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
});
