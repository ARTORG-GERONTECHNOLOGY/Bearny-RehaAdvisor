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
    logout: jest.fn().mockResolvedValue(undefined),
    checkAuthentication: jest.fn().mockResolvedValue(undefined),
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

// Mock HelpCenter
jest.mock('@/components/help/HelpCenter', () => ({
  __esModule: true,
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    <div data-testid="help-center" data-open={open}>
      <button onClick={onClose}>Close Help</button>
    </div>
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
    expect(screen.getByText('Receive daily reminders')).toBeInTheDocument();
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
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getAllByText('Help')[0]).toBeInTheDocument(); // Title
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

  it('opens help center when help button is clicked', () => {
    renderPatientProfile();
    fireEvent.click(screen.getByText('Help'));

    const helpCenter = screen.getByTestId('help-center');
    expect(helpCenter).toHaveAttribute('data-open', 'true');
  });
});
