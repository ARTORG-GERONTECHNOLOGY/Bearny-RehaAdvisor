// src/pages/__tests__/PatientView.test.tsx
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

jest.mock('@/stores/patientUiStore', () => ({
  patientUiStore: { selectedDate: new Date('2026-02-16T00:00:00Z') },
}));

// Keep page unit tests small: mock children
jest.mock('@/components/common/Header', () => () => <div data-testid="header" />);
jest.mock('@/components/common/Footer', () => () => <div data-testid="footer" />);
jest.mock('@/components/common/WelcomeArea', () => () => <div data-testid="welcome" />);
jest.mock('@/components/Layout', () => ({ children }: any) => (
  <div data-testid="layout">{children}</div>
));
jest.mock('@/components/PatientPage/FitbitStatus', () => () => <div data-testid="fitbit-btn" />);
jest.mock('@/components/PatientPage/ActivitySummary', () => () => <div data-testid="summary" />);
jest.mock('@/components/PatientPage/DailyInterventionCard', () => () => (
  <div data-testid="daily-card" />
));
jest.mock('@/components/PatientPage/FeedbackPopup', () => () => <div data-testid="feedback" />);
jest.mock('@/components/common/ErrorAlert', () => ({ message, onClose }: any) => (
  <div role="alert">
    {message}
    <button onClick={onClose}>Close</button>
  </div>
));

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

const navigateMock = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => navigateMock,
  useSearchParams: () => [mockSearchParams],
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (x: any) => x, i18n: { language: 'en' } }),
}));

describe('PatientView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAuthenticated = true;
    mockUserType = 'Patient';
    mockSearchParams = new URLSearchParams();
    navigateMock.mockClear();
  });

  it('redirects to / when not authenticated or not Patient', async () => {
    mockIsAuthenticated = false;
    mockUserType = 'Patient';

    render(<PatientView />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/');
    });
  });

  it('shows fitbit error alert when fitbit_status=error', async () => {
    mockIsAuthenticated = true;
    mockUserType = 'Patient';
    mockSearchParams = new URLSearchParams('fitbit_status=error');

    render(<PatientView />);

    // Wait for error alert to appear
    expect(await screen.findByRole('alert')).toHaveTextContent('Fitbit connection failed.');
  });

  it('renders main sections when authenticated', async () => {
    mockIsAuthenticated = true;
    mockUserType = 'Patient';

    render(<PatientView />);

    await screen.findByTestId('layout');
    expect(screen.getByTestId('fitbit-btn')).toBeInTheDocument();
    expect(screen.getByTestId('vitals')).toBeInTheDocument();
    expect(screen.getByTestId('summary')).toBeInTheDocument();
    expect(screen.getByTestId('daily-card')).toBeInTheDocument();
  });
});
