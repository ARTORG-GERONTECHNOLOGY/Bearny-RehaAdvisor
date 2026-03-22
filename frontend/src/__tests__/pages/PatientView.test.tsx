import { render, screen, waitFor } from '@testing-library/react';
import PatientView from '@/pages/Patient';
import '@testing-library/jest-dom';

let mockIsAuthenticated = true;
let mockUserType = 'Patient';

const mockNavigate = jest.fn();

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    get isAuthenticated() {
      return mockIsAuthenticated;
    },
    get userType() {
      return mockUserType;
    },
    id: 'p1',
  },
}));

jest.mock('@/stores/patientInterventionsStore', () => ({
  patientInterventionsStore: {
    fetchPlan: jest.fn(),
  },
}));

jest.mock('@/stores/patientQuestionnairesStore', () => ({
  patientQuestionnairesStore: {
    healthQuestions: [],
    feedbackQuestions: [],
    feedbackInterventionId: '',
    feedbackDateKey: '',
    showHealthPopup: false,
    showFeedbackPopup: false,
    showInitialPopup: false,
    checkInitialQuestionnaire: jest.fn(),
    loadHealthQuestionnaire: jest.fn(),
    closeHealth: jest.fn(),
    closeFeedback: jest.fn(),
    closeInitial: jest.fn(),
  },
}));

jest.mock('@/stores/patientFitbitStore', () => ({
  patientFitbitStore: {
    connected: true,
    summaryLoading: false,
    summary: {
      today: {
        steps: 4200,
        active_minutes: 32,
        sleep_minutes: 430,
        weight_kg: 70,
        bp_sys: 120,
        bp_dia: 80,
      },
      thresholds: {
        steps_goal: 10000,
        active_minutes_green: 30,
        sleep_green_min: 420,
      },
      period: {
        daily: [
          { date: '2026-03-15', steps: 3000 },
          { date: '2026-03-16', steps: 4000 },
          { date: '2026-03-17', steps: 5000 },
        ],
      },
    },
    fetchStatus: jest.fn(),
    fetchSummary: jest.fn(),
    submitManualSteps: jest.fn(),
  },
}));

jest.mock('@/stores/patientVitalsStore', () => ({
  patientVitalsStore: {
    loading: false,
    error: '',
    checkExists: jest.fn(),
    submit: jest.fn(),
  },
}));

jest.mock('@/stores/patientUiStore', () => ({
  patientUiStore: { selectedDate: new Date('2026-03-02T00:00:00Z') },
}));

jest.mock('@/utils/dateLocale', () => ({
  getDateFnsLocale: jest.fn(() => undefined),
}));

jest.mock('@/components/Layout', () => {
  const MockLayout = jest.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ));
  return MockLayout;
});

jest.mock('@/components/PatientPage/DailyInterventionCard', () => {
  const MockDailyInterventionCard = jest.fn(() => <div data-testid="daily-card">Daily card</div>);
  return MockDailyInterventionCard;
});

jest.mock('@/components/PatientPage/ActivitySection', () => {
  const MockActivitySection = jest.fn(() => <div data-testid="activity-section">Activity</div>);
  return MockActivitySection;
});

jest.mock('@/components/PatientPage/HealthCheckInSection', () => {
  const MockHealthCheckInSection = jest.fn(() => <div data-testid="health-section">Health</div>);
  return MockHealthCheckInSection;
});

jest.mock('@/components/PatientPage/ManualStepsSheet', () => {
  const MockManualStepsSheet = jest.fn(() => <div data-testid="manual-steps-sheet" />);
  return MockManualStepsSheet;
});

jest.mock('@/components/PatientPage/ManualWeightSheet', () => {
  const MockManualWeightSheet = jest.fn(() => <div data-testid="manual-weight-sheet" />);
  return MockManualWeightSheet;
});

jest.mock('@/components/PatientPage/ManualBloodPressureSheet', () => {
  const MockManualBloodPressureSheet = jest.fn(() => <div data-testid="manual-bp-sheet" />);
  return MockManualBloodPressureSheet;
});

jest.mock('@/components/PatientPage/FeedbackPopup', () => {
  const MockFeedbackPopup = jest.fn(() => <div data-testid="feedback-popup" />);
  return MockFeedbackPopup;
});

jest.mock('@/components/PatientPage/PatientQuestionaire', () => {
  const MockPatientQuestionaire = jest.fn(() => <div data-testid="initial-questionnaire" />);
  return MockPatientQuestionaire;
});

jest.mock('@/components/common/ErrorAlert', () => {
  function MockErrorAlert({ message }: { message: string }) {
    return <div role="alert">{message}</div>;
  }
  return MockErrorAlert;
});

jest.mock('@/hooks/useInterventions', () => ({
  useInterventions: jest.fn(() => ({
    completionCount: { completed: 1, total: 3 },
  })),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: jest.fn(),
    useSearchParams: jest.fn(() => [new URLSearchParams()]),
  };
});

const getFitbitStore = () => jest.requireMock('@/stores/patientFitbitStore').patientFitbitStore;
const getVitalsStore = () => jest.requireMock('@/stores/patientVitalsStore').patientVitalsStore;
const getQuestionnairesStore = () =>
  jest.requireMock('@/stores/patientQuestionnairesStore').patientQuestionnairesStore;
const getInterventionsStore = () =>
  jest.requireMock('@/stores/patientInterventionsStore').patientInterventionsStore;
const getAuthStore = () => jest.requireMock('@/stores/authStore').default;
const getRouterMocks = () => jest.requireMock('react-router-dom');
const getDailyCardMock = () => jest.requireMock('@/components/PatientPage/DailyInterventionCard');
const getActivitySectionMock = () => jest.requireMock('@/components/PatientPage/ActivitySection');
const getHealthCheckInSectionMock = () =>
  jest.requireMock('@/components/PatientPage/HealthCheckInSection');
const getManualStepsSheetMock = () => jest.requireMock('@/components/PatientPage/ManualStepsSheet');
const getManualWeightSheetMock = () =>
  jest.requireMock('@/components/PatientPage/ManualWeightSheet');
const getManualBloodPressureSheetMock = () =>
  jest.requireMock('@/components/PatientPage/ManualBloodPressureSheet');
const getFeedbackPopupMock = () => jest.requireMock('@/components/PatientPage/FeedbackPopup');

describe('PatientView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();

    const routerMocks = getRouterMocks();
    (routerMocks.useNavigate as jest.Mock).mockReturnValue(mockNavigate);
    (routerMocks.useSearchParams as jest.Mock).mockReturnValue([new URLSearchParams()]);

    const fitbitStore = getFitbitStore();
    const vitalsStore = getVitalsStore();
    const questionnairesStore = getQuestionnairesStore();
    const authStore = getAuthStore();

    mockIsAuthenticated = true;
    mockUserType = 'Patient';
    authStore.id = 'p1';

    fitbitStore.connected = true;
    fitbitStore.summaryLoading = false;
    fitbitStore.summary = {
      today: {
        steps: 4200,
        active_minutes: 32,
        sleep_minutes: 430,
        weight_kg: 70,
        bp_sys: 120,
        bp_dia: 80,
      },
      thresholds: {
        steps_goal: 10000,
        active_minutes_green: 30,
        sleep_green_min: 420,
      },
      period: {
        daily: [
          { date: '2026-03-15', steps: 3000 },
          { date: '2026-03-16', steps: 4000 },
          { date: '2026-03-17', steps: 5000 },
        ],
      },
    };

    vitalsStore.error = '';

    questionnairesStore.showFeedbackPopup = false;
    questionnairesStore.showHealthPopup = false;
    questionnairesStore.showInitialPopup = false;
    questionnairesStore.feedbackInterventionId = '';
    questionnairesStore.feedbackDateKey = '';
    questionnairesStore.feedbackQuestions = [];
    questionnairesStore.healthQuestions = [];
  });

  it('redirects to / if not authenticated', async () => {
    mockIsAuthenticated = false;

    render(<PatientView />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('redirects to / if user is not Patient', async () => {
    mockUserType = 'Therapist';

    render(<PatientView />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('loads critical patient home data on mount', async () => {
    const fitbitStore = getFitbitStore();
    const questionnairesStore = getQuestionnairesStore();
    const vitalsStore = getVitalsStore();
    const interventionsStore = getInterventionsStore();

    render(<PatientView />);

    await waitFor(() => {
      expect(fitbitStore.fetchStatus).toHaveBeenCalledWith('p1');
      expect(fitbitStore.fetchSummary).toHaveBeenCalledWith('p1', 7);
      expect(interventionsStore.fetchPlan).toHaveBeenCalledWith('p1', 'en');
      expect(questionnairesStore.checkInitialQuestionnaire).toHaveBeenCalledWith('p1');
      expect(questionnairesStore.loadHealthQuestionnaire).toHaveBeenCalledWith('p1', 'en');
      expect(vitalsStore.checkExists).toHaveBeenCalledWith('p1');
    });
  });

  it('uses patient id from localStorage when available', async () => {
    const fitbitStore = getFitbitStore();
    localStorage.setItem('id', 'patient-from-storage');

    render(<PatientView />);

    await waitFor(() => {
      expect(fitbitStore.fetchStatus).toHaveBeenCalledWith('patient-from-storage');
      expect(fitbitStore.fetchSummary).toHaveBeenCalledWith('patient-from-storage', 7);
    });
  });

  it('renders key home sections when authenticated patient', async () => {
    render(<PatientView />);

    expect(await screen.findByTestId('layout')).toBeInTheDocument();
    expect(screen.getByText('today')).toBeInTheDocument();
    expect(screen.getByTestId('daily-card')).toBeInTheDocument();
    expect(screen.getByTestId('activity-section')).toBeInTheDocument();
    expect(screen.getByTestId('health-section')).toBeInTheDocument();
  });

  it('passes expected props to DailyInterventionCard including completion badge', async () => {
    const dailyCardMock = getDailyCardMock();

    render(<PatientView />);

    await waitFor(() => {
      expect(dailyCardMock).toHaveBeenCalled();
    });

    const firstProps = (dailyCardMock as jest.Mock).mock.calls[0][0];
    expect(firstProps.title).toBe('Your recommendations');
    expect(firstProps.badgeText).toBe('1/3');
    expect(firstProps.date).toBeInstanceOf(Date);

    firstProps.onOpenIntervention({ intervention_id: 'int-77' }, new Date('2026-03-09'));
    expect(mockNavigate).toHaveBeenCalledWith('/patient-intervention/int-77?date=2026-03-09');
  });

  it('passes computed activity props and mapped history to ActivitySection', async () => {
    const activitySectionMock = getActivitySectionMock();

    render(<PatientView />);

    await waitFor(() => {
      expect(activitySectionMock).toHaveBeenCalled();
    });

    const firstProps = (activitySectionMock as jest.Mock).mock.calls[0][0];
    expect(firstProps.loading).toBe(false);
    expect(firstProps.connected).toBe(true);
    expect(firstProps.stepsToday).toBe(4200);
    expect(firstProps.stepsGoal).toBe(10000);
    expect(firstProps.activeMinutes).toBe(32);
    expect(firstProps.sleepMinutes).toBe(430);
    expect(firstProps.stepsHistoryData).toEqual([
      { date: '03-15', steps: 3000 },
      { date: '03-16', steps: 4000 },
      { date: '03-17', steps: 5000 },
    ]);
  });

  it('passes selected-date and vitals props to HealthCheckInSection', async () => {
    const healthCheckInSectionMock = getHealthCheckInSectionMock();

    render(<PatientView />);

    await waitFor(() => {
      expect(healthCheckInSectionMock).toHaveBeenCalled();
    });

    const firstProps = (healthCheckInSectionMock as jest.Mock).mock.calls[0][0];
    expect(firstProps.loading).toBe(false);
    expect(firstProps.selectedDateLabel).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    expect(firstProps.weightKg).toBe(70);
    expect(firstProps.bpSys).toBe(120);
    expect(firstProps.bpDia).toBe(80);
  });

  it('manual sheet submit callbacks call stores with correct payloads', async () => {
    const fitbitStore = getFitbitStore();
    const vitalsStore = getVitalsStore();
    const manualStepsSheetMock = getManualStepsSheetMock();
    const manualWeightSheetMock = getManualWeightSheetMock();
    const manualBloodPressureSheetMock = getManualBloodPressureSheetMock();

    render(<PatientView />);

    await waitFor(() => {
      expect(manualStepsSheetMock).toHaveBeenCalled();
      expect(manualWeightSheetMock).toHaveBeenCalled();
      expect(manualBloodPressureSheetMock).toHaveBeenCalled();
    });

    const stepsProps = (manualStepsSheetMock as jest.Mock).mock.calls[0][0];
    await stepsProps.onSubmit(6789);
    expect(fitbitStore.submitManualSteps).toHaveBeenCalledWith(
      'p1',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      6789
    );

    const weightProps = (manualWeightSheetMock as jest.Mock).mock.calls[0][0];
    await weightProps.onSubmit(72.5);
    expect(vitalsStore.submit).toHaveBeenCalledWith('p1', { weight_kg: 72.5 });
    expect(fitbitStore.fetchSummary).toHaveBeenCalledWith('p1', 7);

    const bpProps = (manualBloodPressureSheetMock as jest.Mock).mock.calls[0][0];
    await bpProps.onSubmit(125, 84);
    expect(vitalsStore.submit).toHaveBeenCalledWith('p1', { bp_sys: 125, bp_dia: 84 });
    expect(fitbitStore.fetchSummary).toHaveBeenCalledWith('p1', 7);
  });

  it('shows fitbit error alert when fitbit_status=error', async () => {
    const routerMocks = getRouterMocks();
    (routerMocks.useSearchParams as jest.Mock).mockReturnValue([
      new URLSearchParams('fitbit_status=error'),
    ]);

    render(<PatientView />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Fitbit connection failed.');
  });

  it('renders both feedback popups when intervention and health popups are enabled', async () => {
    const questionnairesStore = getQuestionnairesStore();
    const feedbackPopupMock = getFeedbackPopupMock();

    questionnairesStore.showFeedbackPopup = true;
    questionnairesStore.showHealthPopup = true;
    questionnairesStore.feedbackInterventionId = 'intervention-1';
    questionnairesStore.feedbackDateKey = '2026-03-02';
    questionnairesStore.feedbackQuestions = [{ questionKey: 'q1' }];
    questionnairesStore.healthQuestions = [{ questionKey: 'q2' }];

    render(<PatientView />);

    expect(await screen.findAllByTestId('feedback-popup')).toHaveLength(2);

    const calledWithProps = (feedbackPopupMock as jest.Mock).mock.calls.map((call) => call[0]);
    expect(calledWithProps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          interventionId: 'intervention-1',
          date: '2026-03-02',
          questions: [{ questionKey: 'q1' }],
        }),
        expect.objectContaining({
          interventionId: '',
          date: '2026-03-02',
          questions: [{ questionKey: 'q2' }],
        }),
      ])
    );
  });

  it('renders initial questionnaire popup when required', async () => {
    const questionnairesStore = getQuestionnairesStore();
    questionnairesStore.showInitialPopup = true;

    render(<PatientView />);

    expect(await screen.findByTestId('initial-questionnaire')).toBeInTheDocument();
  });
});
