import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RehabTable from '@/pages/RehabTable';
import apiClient from '@/api/client';

jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

jest.mock('@/components/common/Header', () => () => <div>Header</div>);
jest.mock('@/components/common/Footer', () => () => <div>Footer</div>);
jest.mock('@/components/RehaTablePage/layout/RehaPageLayout', () => ({ children }: any) => (
  <div>{children}</div>
));
jest.mock('@/components/RehaTablePage/layout/RehaLeftPanelShell', () => ({ children }: any) => (
  <div>{children}</div>
));
jest.mock('@/components/RehaTablePage/layout/RehaCalendarPanelShell', () => ({ children }: any) => (
  <div>{children}</div>
));
jest.mock('@/components/RehaTablePage/InterventionLeftPanel', () => () => (
  <div>InterventionLeftPanel</div>
));
jest.mock('@/components/RehaTablePage/InterventionCalendar', () => () => (
  <div>InterventionCalendar</div>
));
jest.mock('@/components/PatientPage/PatientInterventionPopUp', () => () => null);
jest.mock('@/components/RehaTablePage/InterventionRepeatModal', () => () => null);
jest.mock('@/components/RehaTablePage/InterventionStatsModal', () => () => null);
jest.mock('@/components/RehaTablePage/InterventionFeedbackModal', () => () => null);
jest.mock('@/components/RehaTablePage/QuestionnaireScheduleModal', () => () => null);
jest.mock('@/components/RehaTablePage/QuestionnaireBuilderModal', () => () => null);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    isAuthenticated: true,
    userType: 'Therapist',
    id: 'therapist-1',
  },
}));

const makeStore = (topTab: 'interventions' | 'questionnaires' = 'interventions') => ({
  patientName: 'Patient One',
  error: null as string | null,
  loading: false,
  topTab,
  selectedTab: 'patient' as const,
  patientIdForCalls: 'P01',
  patientData: { interventions: [] },
  titleMap: {},
  typeMap: {},
  diagnoses: [],
  activePatientItems: [],
  pastPatientItems: [],
  filteredRecommendations: [],
  userLang: 'en',
  searchTerm: '',
  patientTypeFilter: '',
  contentTypeFilter: '',
  tagFilter: [],
  benefitForFilter: [],
  showInfoInterventionModal: false,
  selectedExerciseFromPlan: null,
  showRepeatModal: false,
  repeatMode: 'create' as const,
  modifyDefaults: null,
  showExerciseStats: false,
  showFeedbackBrowser: false,
  feedbackBrowserIntervention: null,
  init: jest.fn(),
  dispose: jest.fn(),
  setUserLang: jest.fn(),
  translateVisibleItems: jest.fn(),
  setSelectedTab: jest.fn(),
  setSearchTerm: jest.fn(),
  setPatientTypeFilter: jest.fn(),
  setContentTypeFilter: jest.fn(),
  setTagFilter: jest.fn(),
  setBenefitForFilter: jest.fn(),
  resetAllFilters: jest.fn(),
  handleExerciseClick: jest.fn(),
  showStats: jest.fn(),
  openFeedbackBrowser: jest.fn(),
  openModifyIntervention: jest.fn(),
  deleteExercise: jest.fn(),
  openAddIntervention: jest.fn(),
  closeInfoModal: jest.fn(),
  closeRepeatModal: jest.fn(),
  closeStatsModal: jest.fn(),
  closeFeedbackBrowser: jest.fn(),
  fetchAll: jest.fn(),
  fetchInts: jest.fn(),
  setError: jest.fn(),
  setTopTab: jest.fn(function (this: any, v: 'interventions' | 'questionnaires') {
    this.topTab = v;
  }),
});

const mockStore = makeStore();
jest.mock('@/stores/rehabTableStore', () => ({
  __esModule: true,
  RehabTableStore: jest.fn().mockImplementation(() => mockStore),
  extractApiError: jest.fn(() => 'err'),
}));

describe('RehabTable questionnaires integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockStore, makeStore('questionnaires'));

    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/questionnaires/health/')) {
        return Promise.resolve({
          data: [
            {
              _id: '16_profile',
              key: '16_profile',
              title: 'Profile (16)',
              question_count: 8,
              created_by_name: 'System',
            },
          ],
        });
      }
      if (url.includes('/questionnaires/patient/')) {
        return Promise.resolve({
          data: [{ _id: '16_profile', title: 'Profile (16)', frequency: 'Monthly', dates: [] }],
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  test('shows questionnaires tab and invokes store tab setter when clicked', async () => {
    Object.assign(mockStore, makeStore('interventions'));

    render(
      <MemoryRouter>
        <RehabTable />
      </MemoryRouter>
    );

    const qTab = screen.getByRole('button', { name: 'Questionnaires' });
    fireEvent.click(qTab);

    expect(mockStore.setTopTab).toHaveBeenCalledWith('questionnaires');
  });

  test('loads and renders available/assigned questionnaires in questionnaires tab', async () => {
    render(
      <MemoryRouter>
        <RehabTable />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/questionnaires/health/');
      expect(apiClient.get).toHaveBeenCalledWith('/questionnaires/patient/P01/');
    });

    expect(await screen.findByText('Available questionnaires')).toBeInTheDocument();
    expect(await screen.findByText('Assigned questionnaires')).toBeInTheDocument();
    expect(await screen.findAllByText('Profile (16)')).toHaveLength(2);
  });
});
