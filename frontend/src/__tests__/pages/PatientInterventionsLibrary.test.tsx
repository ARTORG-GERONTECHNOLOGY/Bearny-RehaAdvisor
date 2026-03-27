import React from 'react';
import { act, render, waitFor } from '@testing-library/react';

const mockNavigate = jest.fn();
const mockSearchPanel = jest.fn(() => <div data-testid="search-panel" />);
const mockFilterSheet = jest.fn(() => <div data-testid="filter-sheet" />);
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

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/components/Layout', () => ({ children }: any) => <div>{children}</div>);
jest.mock('@/components/common/ErrorAlert', () => ({ message }: any) => <div>{message}</div>);

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
