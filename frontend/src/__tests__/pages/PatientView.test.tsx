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
  },
}));

jest.mock('@/components/common/Header', () => () => <div>Mocked Header</div>);
jest.mock('@/components/common/Footer', () => () => <div>Mocked Footer</div>);
jest.mock('@/components/common/WelcomeArea', () => () => <div>Mocked Welcome Area</div>);
jest.mock('@/components/Layout', () => ({ children }: any) => <div>{children}</div>);
jest.mock('@/components/PatientPage/InterventionList', () => () => (
  <div>Mocked Intervention List</div>
));
jest.mock('@/components/PatientPage/FitbitStatus', () => () => <div>Fitbit Status</div>);
jest.mock('@/components/PatientPage/ActivitySummary', () => () => <div>Activity Summary</div>);
jest.mock('@/components/PatientPage/DailyVitalsPrompt', () => () => <div>Vitals Prompt</div>);

jest.mock('@/stores/patientUiStore', () => ({
  patientUiStore: {
    selectedDate: new Date('2026-03-02'),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Globals to manipulate auth state
let mockIsAuthenticated = true;
let mockUserType = 'Patient';

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
    expect(await screen.findByText('Mocked Welcome Area')).toBeInTheDocument();
    expect(screen.getByText('Fitbit Status')).toBeInTheDocument();
    expect(screen.getByText('Vitals Prompt')).toBeInTheDocument();
    expect(screen.getByText('Activity Summary')).toBeInTheDocument();
    expect(screen.getByText('Mocked Intervention List')).toBeInTheDocument();
  });
});
