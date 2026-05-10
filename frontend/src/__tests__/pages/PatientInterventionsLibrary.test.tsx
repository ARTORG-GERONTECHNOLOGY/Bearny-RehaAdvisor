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
  visibleItemsForPatient: [] as { id: string; [key: string]: unknown }[],
  error: '',
  loading: false,
  fetchAll: jest.fn(async () => {}),
  clearError: jest.fn(),
};

jest.mock('mobx-react-lite', () => ({
  observer: (component: React.ComponentType) => component,
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
    function ErrorAlert({ message }: { message?: string }) {
      return <div>{message}</div>;
    }
);

jest.mock('@/components/PatientLibrary/PatientLibrarySearchPanel', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    mockSearchPanel(props);
    return <div data-testid="search-panel" />;
  },
}));

jest.mock('@/components/PatientLibrary/PatientLibraryFilterSheet', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    mockFilterSheet(props);
    return <div data-testid="filter-sheet" />;
  },
}));

jest.mock('@/components/PatientLibrary/PatientLibraryDesktopFilters', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    mockDesktopFilters(props);
    return <div data-testid="desktop-filters" />;
  },
}));

jest.mock('@/components/PatientLibrary/PatientLibraryInterventionCard', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    mockInterventionCard(props);
    return <div data-testid="intervention-card" />;
  },
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/utils/translate', () => ({
  translateText: (...args: Parameters<typeof mockTranslateText>) => mockTranslateText(...args),
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

describe('PatientInterventionsLibrary', () => {
  beforeEach(() => {
    jest.clearAllMocks();

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
});
