import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

// Mock heavy sub-components.
jest.mock('@/components/RehaTablePage/InterventionLeftPanel', () => () => (
  <div data-testid="intervention-left-panel" />
));
jest.mock('@/components/RehaTablePage/InterventionCalendar', () => () => (
  <div data-testid="intervention-calendar" />
));
jest.mock('@/components/RehaTablePage/layout/RehaLeftPanelShell', () => ({
  __esModule: true,
  default: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@/components/RehaTablePage/layout/RehaCalendarPanelShell', () => ({
  __esModule: true,
  default: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@/components/PatientPage/PatientInterventionPopUp', () => () => null);
jest.mock('@/components/RehaTablePage/InterventionRepeatModal', () => () => null);
jest.mock('@/components/RehaTablePage/InterventionStatsModal', () => () => null);
jest.mock('@/components/RehaTablePage/InterventionFeedbackModal', () => () => null);

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { id: 'therapist-1', isAuthenticated: true, userType: 'Therapist' },
}));

const mockStore = {
  loading: false,
  error: null as string | null,
  topTab: 'interventions',
  selectedTab: 'patient',
  patientData: { interventions: [] },
  allInterventions: [],
  recommendations: [],
  filteredRecommendations: [],
  activePatientItems: [],
  pastPatientItems: [],
  titleMap: {},
  typeMap: {},
  diagnoses: [],
  userLang: 'en',
  patientIdForCalls: 'patient-abc',
  searchTerm: '',
  patientTypeFilter: '',
  contentTypeFilter: '',
  tagFilter: [],
  benefitForFilter: [],
  languageFilter: [],
  showInfoInterventionModal: false,
  selectedExerciseFromPlan: null,
  showRepeatModal: false,
  repeatMode: 'create' as const,
  modifyDefaults: null,
  showExerciseStats: false,
  showFeedbackBrowser: false,
  feedbackBrowserIntervention: null,
  translateTag: undefined as any,
  initForPatient: jest.fn().mockResolvedValue(undefined),
  dispose: jest.fn().mockResolvedValue(undefined),
  setUserLang: jest.fn(),
  translateVisibleItems: jest.fn().mockResolvedValue(undefined),
  applyAllFilters: jest.fn(),
  setSelectedTab: jest.fn(),
  setSearchTerm: jest.fn(),
  setPatientTypeFilter: jest.fn(),
  setContentTypeFilter: jest.fn(),
  setTagFilter: jest.fn(),
  setBenefitForFilter: jest.fn(),
  setLanguageFilter: jest.fn(),
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
  fetchAll: jest.fn().mockResolvedValue(undefined),
  fetchInts: jest.fn().mockResolvedValue(undefined),
  setError: jest.fn(),
};

jest.mock('@/stores/rehabTableStore', () => ({
  __esModule: true,
  RehabTableStore: jest.fn().mockImplementation(() => mockStore),
  extractApiError: jest.fn(() => 'err'),
}));

import RehabilitationPlanContent from '@/components/RehaTablePage/RehabilitationPlanContent';

describe('RehabilitationPlanContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.loading = false;
    mockStore.error = null;
    mockStore.initForPatient.mockResolvedValue(undefined);
    mockStore.dispose.mockResolvedValue(undefined);
  });

  it('calls initForPatient with the given patientId on mount', async () => {
    render(<RehabilitationPlanContent patientId="patient-abc" />);

    await waitFor(() => {
      expect(mockStore.initForPatient).toHaveBeenCalledWith('patient-abc', expect.any(Function));
    });
  });

  it('does not call initForPatient when patientId is empty', () => {
    render(<RehabilitationPlanContent patientId="" />);
    expect(mockStore.initForPatient).not.toHaveBeenCalled();
  });

  it('shows loading indicator while store is loading', () => {
    mockStore.loading = true;
    render(<RehabilitationPlanContent patientId="patient-abc" />);

    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    expect(screen.queryByTestId('intervention-left-panel')).not.toBeInTheDocument();
  });

  it('shows left panel and calendar when loaded', () => {
    mockStore.loading = false;
    render(<RehabilitationPlanContent patientId="patient-abc" />);

    expect(screen.getByTestId('intervention-left-panel')).toBeInTheDocument();
    expect(screen.getByTestId('intervention-calendar')).toBeInTheDocument();
  });

  it('shows error alert when store has an error', () => {
    mockStore.error = 'Failed to load rehabilitation plan.';
    render(<RehabilitationPlanContent patientId="patient-abc" />);

    expect(screen.getByText('Failed to load rehabilitation plan.')).toBeInTheDocument();
  });

  it('calls dispose on unmount', async () => {
    const { unmount } = render(<RehabilitationPlanContent patientId="patient-abc" />);
    unmount();

    await waitFor(() => {
      expect(mockStore.dispose).toHaveBeenCalled();
    });
  });
});
