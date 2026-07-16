import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

// Mock heavy sub-components.
jest.mock('@/components/RehaTablePage/InterventionLeftPanel', () => () => (
  <div data-testid="intervention-left-panel" />
));
jest.mock(
  '@/components/RehaTablePage/InterventionCalendar',
  () =>
    function InterventionCalendar(props: any) {
      return (
        <div data-testid="intervention-calendar">
          <button onClick={() => props.onRescheduleEvent('int-1', 'old-dt', 'new-dt')}>
            reschedule
          </button>
        </div>
      );
    }
);
jest.mock(
  '@/components/RehaTablePage/PatientInterventionPopUp',
  () =>
    function PatientInterventionPopUp(props: any) {
      return (
        <div data-testid="info-popup">
          <button onClick={props.handleClose}>close-info</button>
        </div>
      );
    }
);
jest.mock(
  '@/components/RehaTablePage/InterventionRepeatModal',
  () =>
    function InterventionRepeatModal(props: any) {
      return (
        <div data-testid="repeat-modal">
          mode:{props.mode}
          <button onClick={props.onHide}>close-repeat</button>
          <button onClick={() => props.onSuccess()}>succeed-repeat</button>
        </div>
      );
    }
);
jest.mock(
  '@/components/RehaTablePage/InterventionStatsModal',
  () =>
    function InterventionStatsModal(props: any) {
      return (
        <div data-testid="stats-modal">
          <button onClick={props.onHide}>close-stats</button>
        </div>
      );
    }
);
jest.mock(
  '@/components/RehaTablePage/InterventionFeedbackModal',
  () =>
    function InterventionFeedbackModal(props: any) {
      return (
        <div data-testid="feedback-modal">
          <button onClick={props.onHide}>close-feedback</button>
        </div>
      );
    }
);

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { id: 'therapist-1', isAuthenticated: true, userType: 'Therapist' },
}));

const mockStore = {
  loading: false,
  error: null as string | null,
  topTab: 'interventions',
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
  selectedExerciseFromPlan: null as Record<string, unknown> | null,
  showRepeatModal: false,
  repeatMode: 'create' as 'create' | 'modify',
  modifyDefaults: null,
  showExerciseStats: false,
  showFeedbackBrowser: false,
  feedbackBrowserIntervention: null as Record<string, unknown> | null,
  translateTag: undefined as any,
  initForPatient: jest.fn().mockResolvedValue(undefined),
  dispose: jest.fn().mockResolvedValue(undefined),
  setUserLang: jest.fn(),
  translateVisibleItems: jest.fn().mockResolvedValue(undefined),
  applyAllFilters: jest.fn(),
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
  rescheduleInterventionDate: jest.fn().mockResolvedValue(undefined),
  mergePlanWithCatalog: jest.fn((patientData) => patientData),
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

  it('dismisses the error alert via setError(null)', () => {
    mockStore.error = 'Something broke';
    render(<RehabilitationPlanContent patientId="patient-abc" />);

    const alert = screen.getByText('Something broke');
    const closeBtn = alert.parentElement!.querySelector('button')!;
    fireEvent.click(closeBtn);

    expect(mockStore.setError).toHaveBeenCalledWith(null);
  });

  it('shows the info popup when showInfoInterventionModal and an exercise are set, and closes it', () => {
    mockStore.showInfoInterventionModal = true;
    mockStore.selectedExerciseFromPlan = { _id: 'ex-1' };
    render(<RehabilitationPlanContent patientId="patient-abc" />);

    expect(screen.getByTestId('info-popup')).toBeInTheDocument();
    fireEvent.click(screen.getByText('close-info'));
    expect(mockStore.closeInfoModal).toHaveBeenCalled();

    mockStore.showInfoInterventionModal = false;
    mockStore.selectedExerciseFromPlan = null;
  });

  it('does not show the info popup when there is no selected exercise', () => {
    mockStore.showInfoInterventionModal = true;
    mockStore.selectedExerciseFromPlan = null;
    render(<RehabilitationPlanContent patientId="patient-abc" />);

    expect(screen.queryByTestId('info-popup')).not.toBeInTheDocument();
    mockStore.showInfoInterventionModal = false;
  });

  it('shows the repeat modal, closes it, and refreshes the plan on success', async () => {
    mockStore.showRepeatModal = true;
    mockStore.selectedExerciseFromPlan = { _id: 'ex-1' };
    mockStore.repeatMode = 'modify';
    render(<RehabilitationPlanContent patientId="patient-abc" />);

    const modal = screen.getByTestId('repeat-modal');
    expect(modal).toHaveTextContent('mode:modify');

    fireEvent.click(screen.getByText('succeed-repeat'));
    await waitFor(() => {
      expect(mockStore.fetchAll).toHaveBeenCalled();
      expect(mockStore.fetchInts).toHaveBeenCalled();
      expect(mockStore.translateVisibleItems).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('close-repeat'));
    expect(mockStore.closeRepeatModal).toHaveBeenCalled();

    mockStore.showRepeatModal = false;
    mockStore.selectedExerciseFromPlan = null;
    mockStore.repeatMode = 'create';
  });

  it('does not show the repeat modal without a selected exercise', () => {
    mockStore.showRepeatModal = true;
    mockStore.selectedExerciseFromPlan = null;
    render(<RehabilitationPlanContent patientId="patient-abc" />);
    expect(screen.queryByTestId('repeat-modal')).not.toBeInTheDocument();
    mockStore.showRepeatModal = false;
  });

  it('shows the stats modal and closes it', () => {
    mockStore.showExerciseStats = true;
    mockStore.selectedExerciseFromPlan = { _id: 'ex-1' };
    render(<RehabilitationPlanContent patientId="patient-abc" />);

    expect(screen.getByTestId('stats-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('close-stats'));
    expect(mockStore.closeStatsModal).toHaveBeenCalled();

    mockStore.showExerciseStats = false;
    mockStore.selectedExerciseFromPlan = null;
  });

  it('does not show the stats modal without a selected exercise', () => {
    mockStore.showExerciseStats = true;
    mockStore.selectedExerciseFromPlan = null;
    render(<RehabilitationPlanContent patientId="patient-abc" />);
    expect(screen.queryByTestId('stats-modal')).not.toBeInTheDocument();
    mockStore.showExerciseStats = false;
  });

  it('shows the feedback modal and closes it', () => {
    mockStore.showFeedbackBrowser = true;
    mockStore.feedbackBrowserIntervention = { _id: 'ex-1' };
    render(<RehabilitationPlanContent patientId="patient-abc" />);

    expect(screen.getByTestId('feedback-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('close-feedback'));
    expect(mockStore.closeFeedbackBrowser).toHaveBeenCalled();

    mockStore.showFeedbackBrowser = false;
    mockStore.feedbackBrowserIntervention = null;
  });

  it('does not show the feedback modal without a feedbackBrowserIntervention', () => {
    mockStore.showFeedbackBrowser = true;
    mockStore.feedbackBrowserIntervention = null;
    render(<RehabilitationPlanContent patientId="patient-abc" />);
    expect(screen.queryByTestId('feedback-modal')).not.toBeInTheDocument();
    mockStore.showFeedbackBrowser = false;
  });

  it('reschedules an intervention via the calendar callback', async () => {
    render(<RehabilitationPlanContent patientId="patient-abc" />);

    fireEvent.click(screen.getByText('reschedule'));

    await waitFor(() => {
      expect(mockStore.rescheduleInterventionDate).toHaveBeenCalledWith(
        'int-1',
        'old-dt',
        'new-dt',
        expect.any(Function)
      );
    });
  });
});
