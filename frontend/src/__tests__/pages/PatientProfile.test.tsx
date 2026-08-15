import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import '@testing-library/jest-dom';
import PatientProfile from '@/pages/PatientProfile';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();

jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useNavigate: () => mockNavigate,
}));

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    isAuthenticated: true,
    userType: 'Patient',
    firstName: null,
    id: 'test-patient-id',
    logout: jest.fn().mockResolvedValue(undefined),
    checkAuthentication: jest.fn().mockResolvedValue(undefined),
    getStoredUserId: jest.fn(function (this: { id: string }) {
      return this.id || localStorage.getItem('id') || '';
    }),
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
    disconnect: jest.fn().mockResolvedValue(undefined),
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
const mockUseNotifications = jest.fn(() => ({
  permission: 'default' as NotificationPermission,
  supportsPush: true,
  toggleCategory: jest.fn(),
  toggleAll: jest.fn(),
  pendingCategories: new Set<string>(),
  pendingAll: false,
}));

jest.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => mockUseNotifications(),
}));

// Mock notificationPreferencesStore
jest.mock('@/stores/notificationPreferencesStore', () => {
  const actual = jest.requireActual('@/stores/notificationPreferencesStore');
  return {
    ...actual,
    notificationPreferencesStore: {
      preferences: {
        ...actual.NOTIFICATION_CATEGORIES.reduce((a: any, c: string) => ({ ...a, [c]: true }), {}),
      },
      loading: false,
      saving: false,
      error: '',
      fetchPreferences: jest.fn(),
      savePreferences: jest.fn(),
    },
  };
});

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
  default: jest.requireActual('@/__mocks__/components/Layout').default,
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
    permission: 'default' as NotificationPermission,
    supportsPush: true,
    toggleCategory: jest.fn(),
    toggleAll: jest.fn(),
    pendingCategories: new Set<string>(),
    pendingAll: false,
  });
  mockAuthStore.isAuthenticated = true;
  mockAuthStore.userType = 'Patient';
  mockAuthStore.firstName = null;

  // Mock localStorage
  Storage.prototype.getItem = jest.fn(() => 'en');
  Storage.prototype.setItem = jest.fn();
});

// ── Tests ────────────────────────────────────────────────────────────────────

// Detailed per-category switch/permission behaviour is covered in
// components/UserProfile/NotificationsCard.test.tsx — these just confirm the
// card is composed into the page.
describe('PatientProfile - Notifications', () => {
  it('renders notification settings card', () => {
    renderPatientProfile();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Receive reminders')).toBeInTheDocument();
  });

  it('shows permission denied warning when permission is denied', () => {
    mockUseNotifications.mockReturnValue({
      permission: 'denied' as NotificationPermission,
      supportsPush: true,
      toggleCategory: jest.fn(),
      toggleAll: jest.fn(),
      pendingCategories: new Set<string>(),
      pendingAll: false,
    });

    renderPatientProfile();
    expect(
      screen.getByText('Notification permission denied. Please enable in browser settings.')
    ).toBeInTheDocument();
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
    expect(screen.getByText('Logout')).toBeInTheDocument();
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

  it('shows a Disconnect button when Fitbit is connected', () => {
    mockFitbitConnected = true;
    renderPatientProfile();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('does not show a Disconnect button when Fitbit is not connected', () => {
    mockFitbitConnected = false;
    renderPatientProfile();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
  });

  it('opens a confirmation sheet when Disconnect is clicked', async () => {
    mockFitbitConnected = true;
    renderPatientProfile();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => {
      expect(screen.getByText('Disconnect Fitbit')).toBeInTheDocument();
    });
  });
});
