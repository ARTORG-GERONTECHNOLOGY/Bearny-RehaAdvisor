// src/pages/__tests__/PatientView.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import PatientView from '@/pages/Patient';
import authStore from '@/stores/authStore';

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

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    isAuthenticated: true,
    userType: 'Patient',
    id: 'p1',
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
jest.mock('@/components/PatientPage/DailyVitalsPrompt', () => () => <div data-testid="vitals" />);
jest.mock('@/components/PatientPage/ActivitySummary', () => () => <div data-testid="summary" />);
jest.mock('@/components/PatientPage/InterventionList', () => () => <div data-testid="list" />);
jest.mock('@/components/common/ErrorAlert', () => ({ message, onClose }: any) => (
  <div role="alert">
    {message}
    <button onClick={onClose}>Close</button>
  </div>
));

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
    mockSearchParams = new URLSearchParams();
    (authStore.checkAuthentication as jest.Mock).mockResolvedValue(undefined);
  });

  it('redirects to / when not authenticated or not Patient', async () => {
    (authStore as any).isAuthenticated = false;
    (authStore as any).userType = 'Patient';

    render(<PatientView />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/');
    });
  });

  it('shows fitbit error alert when fitbit_status=error', async () => {
    (authStore as any).isAuthenticated = true;
    (authStore as any).userType = 'Patient';

    // Set the search params before rendering
    mockSearchParams = new URLSearchParams('fitbit_status=error');

    render(<PatientView />);

    // Wait for error alert to appear
    expect(await screen.findByRole('alert')).toHaveTextContent('Fitbit connection failed.');
  });

  it('renders main sections when authenticated', async () => {
    (authStore as any).isAuthenticated = true;
    (authStore as any).userType = 'Patient';

    render(<PatientView />);

    await screen.findByTestId('layout');
    expect(screen.getByTestId('welcome')).toBeInTheDocument();
    expect(screen.getByTestId('fitbit-btn')).toBeInTheDocument();
    expect(screen.getByTestId('vitals')).toBeInTheDocument();
    expect(screen.getByTestId('summary')).toBeInTheDocument();
    expect(screen.getByTestId('list')).toBeInTheDocument();
  });
});
