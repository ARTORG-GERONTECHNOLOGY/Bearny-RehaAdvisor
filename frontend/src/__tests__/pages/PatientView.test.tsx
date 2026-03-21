import { render, screen, waitFor } from '@testing-library/react';
import PatientView from '@/pages/Patient';
import '@testing-library/jest-dom';

// Mock api client to avoid import.meta error
jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

// Globals to manipulate auth state
let mockIsAuthenticated = true;
let mockUserType = 'Patient';

// Mocks
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
    items: [],
    fetchPlan: jest.fn(),
    isCompletedOn: jest.fn(() => false),
  },
}));

jest.mock('@/stores/patientQuestionnairesStore', () => ({
  patientQuestionnairesStore: {
    healthQuestions: [],
    showHealthPopup: false,
    showFeedbackPopup: false,
    checkInitialQuestionnaire: jest.fn(),
    loadHealthQuestionnaire: jest.fn(),
    closeHealth: jest.fn(),
    closeFeedback: jest.fn(),
  },
}));

jest.mock('@/components/common/Header', () => () => <div>Mocked Header</div>);
jest.mock('@/components/common/Footer', () => () => <div>Mocked Footer</div>);
jest.mock('@/components/common/WelcomeArea', () => () => <div>Mocked Welcome Area</div>);
jest.mock('@/components/Layout', () => ({ children }: any) => <div>{children}</div>);
jest.mock('@/components/PatientPage/DailyInterventionCard', () => () => (
  <div>Daily Intervention Card</div>
));
jest.mock('@/components/PatientPage/FitbitStatus', () => () => <div>Fitbit Status</div>);
jest.mock('@/components/PatientPage/FeedbackPopup', () => () => <div>Feedback Popup</div>);
jest.mock('@/components/PatientPage/PatientQuestionaire', () => () => <div>Questionnaire</div>);

jest.mock('@/stores/patientUiStore', () => ({
  patientUiStore: {
    selectedDate: new Date('2026-03-02'),
  },
}));

jest.mock('@/hooks/useInterventions', () => ({
  useInterventions: jest.fn(() => ({
    interventions: [],
    sortedInterventions: [],
    completionCount: { completed: 0, total: 0 },
    busyKey: null,
    openFeedbackFor: jest.fn(),
    toggleCompleted: jest.fn(),
  })),
}));

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
    useSearchParams: () => [new URLSearchParams()],
  };
});

describe('PatientView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAuthenticated = true;
    mockUserType = 'Patient';
    mockNavigate.mockClear();
  });

  test('redirects to / if not authenticated', async () => {
    mockIsAuthenticated = false;
    mockUserType = 'Patient';

    render(<PatientView />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  test('redirects to / if user is not Patient', async () => {
    mockIsAuthenticated = true;
    mockUserType = 'Therapist';

    render(<PatientView />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  test('renders PatientView content if authenticated and userType is Patient', async () => {
    mockIsAuthenticated = true;
    mockUserType = 'Patient';

    render(<PatientView />);

    // Check that the main components are rendered
    expect(await screen.findByText('Fitbit Status')).toBeInTheDocument();
    expect(screen.getByText('Vitals Prompt')).toBeInTheDocument();
    expect(screen.getByText('Activity Summary')).toBeInTheDocument();
    expect(screen.getByText('Daily Intervention Card')).toBeInTheDocument();
  });
});
