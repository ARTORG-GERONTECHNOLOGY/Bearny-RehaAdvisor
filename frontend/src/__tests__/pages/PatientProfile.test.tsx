import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import PatientProfile from '@/pages/PatientProfile';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    isAuthenticated: true,
    userType: 'Patient',
    firstName: null,
    id: 'test-patient-id',
    logout: jest.fn().mockResolvedValue(undefined),
    checkAuthentication: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock patientFitbitStore
const mockFetchStatus = jest.fn();
let mockFitbitConnected: boolean | null = false;

jest.mock('@/stores/patientFitbitStore', () => ({
  patientFitbitStore: {
    get connected() {
      return mockFitbitConnected;
    },
    fetchStatus: (...args: unknown[]) => mockFetchStatus(...args),
  },
}));

const mockAuthStore = jest.requireMock('@/stores/authStore').default as {
  isAuthenticated: boolean;
  userType: string | null;
  firstName: string | null;
  logout: jest.Mock;
  checkAuthentication: jest.Mock;
};

// Mock useNotifications hook
const mockToggleNotifications = jest.fn();
const mockUseNotifications = jest.fn(() => ({
  enabled: false,
  permission: 'default' as NotificationPermission,
  supportsPeriodicSync: true,
  toggleNotifications: mockToggleNotifications,
}));

jest.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => mockUseNotifications(),
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean;
    onCheckedChange: (value: boolean) => void;
  }) => <button role="switch" aria-checked={checked} onClick={() => onCheckedChange(!checked)} />,
}));

jest.mock('@/components/Layout', () => ({
  __esModule: true,
  default: require('@/__mocks__/components/Layout').default,
}));

// Mock FitbitConnectButton
jest.mock('@/components/PatientPage/FitbitStatus', () => ({
  __esModule: true,
  default: () => <button data-testid="fitbit-connect-button">Connect Fitbit</button>,
}));

// Mock Skeleton component
jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const renderPatientProfile = () =>
  render(
    <MemoryRouter>
      <PatientProfile />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigate.mockClear();
  mockFetchStatus.mockClear();
  mockFitbitConnected = false;
  mockUseNotifications.mockReturnValue({
    enabled: false,
    permission: 'default' as NotificationPermission,
    supportsPeriodicSync: true,
    toggleNotifications: mockToggleNotifications,
  });
  mockAuthStore.isAuthenticated = true;
  mockAuthStore.userType = 'Patient';
  mockAuthStore.firstName = null;

  // Mock localStorage
  Storage.prototype.getItem = jest.fn(() => 'en');
  Storage.prototype.setItem = jest.fn();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PatientProfile - Notifications', () => {
  it('renders notification settings card', () => {
    renderPatientProfile();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Receive reminders')).toBeInTheDocument();
  });

  it('displays notification switch in unchecked state by default', () => {
    renderPatientProfile();
    const switchElement = screen.getByRole('switch');
    expect(switchElement).not.toBeChecked();
  });

  it('displays notification switch in checked state when enabled', () => {
    mockUseNotifications.mockReturnValue({
      enabled: true,
      permission: 'granted' as NotificationPermission,
      supportsPeriodicSync: true,
      toggleNotifications: mockToggleNotifications,
    });

    renderPatientProfile();
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toBeChecked();
  });

  it('calls toggleNotifications when switch is clicked', async () => {
    renderPatientProfile();
    const switchElement = screen.getByRole('switch');

    fireEvent.click(switchElement);

    await waitFor(() => {
      expect(mockToggleNotifications).toHaveBeenCalledWith(true);
    });
  });

  it('shows permission denied warning when permission is denied', () => {
    mockUseNotifications.mockReturnValue({
      enabled: false,
      permission: 'denied' as NotificationPermission,
      supportsPeriodicSync: true,
      toggleNotifications: mockToggleNotifications,
    });

    renderPatientProfile();
    expect(
      screen.getByText('Notification permission denied. Please enable in browser settings.')
    ).toBeInTheDocument();
  });

  it('shows browser not supported warning when periodicSync is not supported', () => {
    mockUseNotifications.mockReturnValue({
      enabled: false,
      permission: 'default' as NotificationPermission,
      supportsPeriodicSync: false,
      toggleNotifications: mockToggleNotifications,
    });

    renderPatientProfile();
    expect(
      screen.getByText('Background notifications not supported in this browser.')
    ).toBeInTheDocument();
  });

  it('does not show warnings when everything is supported', () => {
    mockUseNotifications.mockReturnValue({
      enabled: true,
      permission: 'granted' as NotificationPermission,
      supportsPeriodicSync: true,
      toggleNotifications: mockToggleNotifications,
    });

    renderPatientProfile();
    expect(
      screen.queryByText('Notification permission denied. Please enable in browser settings.')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Background notifications not supported in this browser.')
    ).not.toBeInTheDocument();
  });
});

describe('PatientProfile - General UI', () => {
  it('renders patient profile page with title', () => {
    renderPatientProfile();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('renders all patient profile sections', () => {
    renderPatientProfile();
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Fitness Tracker')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
  });

  it('shows logout button when authenticated', () => {
    mockAuthStore.isAuthenticated = true;
    renderPatientProfile();
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('redirects to home when not authenticated', async () => {
    mockAuthStore.isAuthenticated = false;
    renderPatientProfile();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('redirects to home when user is not a Patient', async () => {
    mockAuthStore.userType = 'Therapist';
    renderPatientProfile();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('calls authStore.logout when logout button is clicked', async () => {
    renderPatientProfile();
    const logoutButton = screen.getByText('Logout');

    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(mockAuthStore.logout).toHaveBeenCalled();
    });
  });
});

describe('PatientProfile - Fitbit', () => {
  it('renders fitbit card in the profile', () => {
    renderPatientProfile();
    expect(screen.getByText('Fitness Tracker')).toBeInTheDocument();
  });

  it('displays connected state when fitbit is connected', () => {
    mockFitbitConnected = true;
    renderPatientProfile();

    expect(screen.getByText('Fitness Tracker')).toBeInTheDocument();
    expect(screen.getByText('Fitbit Connected')).toBeInTheDocument();
    expect(screen.queryByTestId('fitbit-connect-button')).not.toBeInTheDocument();
  });

  it('displays disconnected state with connect button when fitbit is not connected', () => {
    mockFitbitConnected = false;
    renderPatientProfile();

    expect(screen.getByText('Fitbit')).toBeInTheDocument();
    expect(screen.getByText('Fitness Tracker')).toBeInTheDocument();
    expect(screen.getByTestId('fitbit-connect-button')).toBeInTheDocument();
  });

  it('displays loading skeletons when fitbit connection status is unknown', () => {
    mockFitbitConnected = null;
    renderPatientProfile();

    // When connected is null, the card should display skeleton loaders
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('applies correct styling for connected state', () => {
    mockFitbitConnected = true;
    renderPatientProfile();

    // Find the fitbit card container by looking for the element with the styling classes
    // The container should have p-4, rounded-3xl, and border/accent classes
    const fitbitTextEl = screen.getByText('Fitbit Connected');
    let cardContainer = fitbitTextEl.closest('div');

    // Navigate up the DOM to find the container with p-4 class
    while (cardContainer && !cardContainer.className.includes('p-4')) {
      cardContainer = cardContainer.parentElement;
    }

    expect(cardContainer?.className).toContain('p-4');
    expect(cardContainer?.className).toContain('rounded-3xl');
    expect(cardContainer?.className).toMatch(/border/);
    expect(cardContainer?.className).toMatch(/accent/);
  });

  it('applies correct styling for disconnected state', () => {
    mockFitbitConnected = false;
    renderPatientProfile();

    // Find the disconnect fitbit card container
    const fitbitTextEl = screen.getByText('Fitbit');
    let cardContainer = fitbitTextEl.closest('div');

    // Navigate up the DOM to find the container with p-4 class
    while (cardContainer && !cardContainer.className.includes('p-4')) {
      cardContainer = cardContainer.parentElement;
    }

    expect(cardContainer?.className).toContain('p-4');
    expect(cardContainer?.className).toContain('rounded-3xl');
    expect(cardContainer?.className).toContain('bg-zinc-100');
  });

  it('displays proper labels and hierarchy in connected state', () => {
    mockFitbitConnected = true;
    renderPatientProfile();

    // Check that the small label appears before the large label
    const labels = screen.getAllByText('Fitness Tracker');
    expect(labels[0]).toBeInTheDocument();
    expect(screen.getByText('Fitbit Connected')).toBeInTheDocument();
  });

  it('displays proper labels and hierarchy in disconnected state', () => {
    mockFitbitConnected = false;
    renderPatientProfile();

    expect(screen.getByText('Fitbit')).toBeInTheDocument();
    expect(screen.getByText('Fitness Tracker')).toBeInTheDocument();
    const button = screen.getByTestId('fitbit-connect-button');
    expect(button).toBeInTheDocument();
  });
});
