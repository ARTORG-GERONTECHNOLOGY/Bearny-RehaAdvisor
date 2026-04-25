// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

// Mock child components
// Mock the apiClient
jest.mock('@/api/client', () => require('@/__mocks__/api/client'));
jest.mock('@/components/common/Header', () => () => <div>Mock Header</div>);
jest.mock('@/components/common/Footer', () => () => <div>Mock Footer</div>);
jest.mock('@/components/common/WelcomeArea', () => ({ user }) => <div>Welcome {user}</div>);
jest.mock(
  '@/components/TherapistInterventionPage/LibraryFiltersCard',
  () =>
    ({ filters, onChange }) => (
      <div>
        LibraryFiltersCard
        <input
          data-testid="search-input"
          value={filters.searchTerm}
          onChange={(e) => onChange({ ...filters, searchTerm: e.target.value })}
        />
      </div>
    )
);
jest.mock('@/components/TherapistInterventionPage/LibraryListSection', () => ({ items }) => (
  <div>
    LibraryListSection
    {items.map((i) => (
      <div key={i._id}>{i.title}</div>
    ))}
  </div>
));
jest.mock('@/components/TherapistInterventionPage/ProductPopup', () => () => (
  <div>ProductPopup</div>
));
jest.mock('@/components/AddIntervention/AddRecomendationPopUp', () => () => (
  <div>AddInterventionPopup</div>
));
jest.mock('@/components/common/ErrorAlert', () => () => <div>ErrorAlert</div>);
jest.mock('@/components/TherapistInterventionPage/ImportInterventionsModal', () => () => (
  <div>ImportInterventionsModal</div>
));
jest.mock('@/components/TherapistInterventionPage/MainTabs', () => ({ mainTab }) => (
  <div>MainTabs: {mainTab}</div>
));
jest.mock('@/components/TherapistInterventionPage/AddInterventionRow', () => ({ onAdd }) => (
  <div>
    AddInterventionRow
    <button onClick={onAdd}>Add Intervention</button>
  </div>
));
jest.mock('@/components/TherapistInterventionPage/TemplatesLayout', () => () => (
  <div>TemplatesLayout</div>
));
jest.mock('@/components/TherapistInterventionPage/TemplateAssignModal', () => () => (
  <div>TemplateAssignModal</div>
));
jest.mock('@/components/TherapistInterventionPage/TemplateTimeline', () => () => (
  <div>TemplateTimeline</div>
));

// Mock config
jest.mock('@/config/config.json', () => ({
  patientInfo: {
    function: {
      Cardiology: { diagnosis: ['Heart Disease', 'Hypertension'] },
      Neurology: { diagnosis: ['Stroke', 'Parkinsons'] },
    },
  },
}));

// Mock utility functions
jest.mock('@/utils/filterUtils', () => ({
  filterInterventions: (items: any[], translatedTitles: any, filters: any) => {
    if (filters.searchTerm) {
      return items.filter((item) =>
        item.title.toLowerCase().includes(filters.searchTerm.toLowerCase())
      );
    }
    return items;
  },
}));

jest.mock('@/utils/interventions', () => ({
  generateTagColors: () => ({}),
  getTaxonomyTags: () => [],
}));

jest.mock('@/utils/translate', () => ({
  translateText: async (text: string) => ({
    translatedText: text,
    detectedSourceLanguage: 'en',
  }),
}));

// Mock router
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock authStore and API
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    isAuthenticated: true,
    userType: 'Therapist',
    specialisation: 'Cardiology',
    specialisations: ['Cardiology', 'Neurology'],
    id: 'therapist1',
  },
}));

// Mock interventionsLibraryStore
const mockLibraryStore = {
  items: [],
  loading: false,
  error: '',
  fetchAll: jest.fn(),
  clearError: jest.fn(),
};

jest.mock('@/stores/interventionsLibraryStore', () => ({
  get therapistInterventionsLibraryStore() {
    return mockLibraryStore;
  },
}));

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TherapistRecomendations from '@/pages/TherapistInterventions';
import { MemoryRouter } from 'react-router-dom';
import authStore from '@/stores/authStore';
import '@testing-library/jest-dom';
import apiClient from '@/api/client';

describe('TherapistRecomendations page', () => {
  const mockInterventions = [
    {
      _id: '1',
      title: 'Stretching Routine',
      description: 'Some description here',
      tags: ['Moderate', 'At Home'],
      benefitFor: ['Mobility'],
      content_type: 'Video',
      patient_types: [{ diagnosis: 'Cardiology', include_option: true, frequency: 'Daily' }],
    },
    {
      _id: '2',
      title: 'Strength Training',
      tags: ['Intense'],
      benefitFor: ['Muscle Strength'],
      content_type: 'PDFs',
      patient_types: [
        { type: 'Therapist', diagnosis: 'Neurology', include_option: false, frequency: 'Weekly' },
      ],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockInterventions });
    mockLibraryStore.items = mockInterventions;
    mockLibraryStore.loading = false;
    mockLibraryStore.error = '';
    (authStore.isAuthenticated as boolean) = true;
  });

  test('renders interventions and filters them by title', async () => {
    render(
      <MemoryRouter>
        <TherapistRecomendations />
      </MemoryRouter>
    );

    expect(await screen.findByText('Stretching Routine')).toBeInTheDocument();
    expect(screen.getByText('Strength Training')).toBeInTheDocument();

    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'stretch' } });

    await waitFor(() => {
      expect(screen.getByText('Stretching Routine')).toBeInTheDocument();
      expect(screen.queryByText('Strength Training')).not.toBeInTheDocument();
    });
  });

  test('redirects if not authenticated', async () => {
    (authStore.isAuthenticated as boolean) = false;

    render(
      <MemoryRouter>
        <TherapistRecomendations />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  test('opens Add Intervention popup when button is clicked', async () => {
    render(
      <MemoryRouter>
        <TherapistRecomendations />
      </MemoryRouter>
    );

    const addButton = await screen.findByText('Add Intervention');
    fireEvent.click(addButton);

    expect(await screen.findByText('AddInterventionPopup')).toBeInTheDocument();
  });
});
