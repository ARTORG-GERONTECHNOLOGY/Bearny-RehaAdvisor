import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import SettingsPage from '@/pages/SettingsPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

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
    logout: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockAuthStore = jest.requireMock('@/stores/authStore').default as {
  isAuthenticated: boolean;
  logout: jest.Mock;
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

// Mock Layout
jest.mock('@/components/Layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
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

const renderSettingsPage = () =>
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockUseNotifications.mockReturnValue({
    enabled: false,
    permission: 'default' as NotificationPermission,
    supportsPeriodicSync: true,
    toggleNotifications: mockToggleNotifications,
  });
  mockAuthStore.isAuthenticated = true;

  // Mock localStorage
  Storage.prototype.getItem = jest.fn(() => 'en');
  Storage.prototype.setItem = jest.fn();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SettingsPage - Notifications', () => {
  it('renders notification settings card', () => {
    renderSettingsPage();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Receive daily reminders')).toBeInTheDocument();
  });

  it('displays notification switch in unchecked state by default', () => {
    renderSettingsPage();
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

    renderSettingsPage();
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toBeChecked();
  });

  it('calls toggleNotifications when switch is clicked', async () => {
    renderSettingsPage();
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

    renderSettingsPage();
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

    renderSettingsPage();
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

    renderSettingsPage();
    expect(
      screen.queryByText('Notification permission denied. Please enable in browser settings.')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Background notifications not supported in this browser.')
    ).not.toBeInTheDocument();
  });
});

describe('SettingsPage - General UI', () => {
  it('renders settings page with title', () => {
    renderSettingsPage();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders all settings sections', () => {
    renderSettingsPage();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getAllByText('Help')[0]).toBeInTheDocument(); // Title
  });

  it('shows logout button when authenticated', () => {
    mockAuthStore.isAuthenticated = true;
    renderSettingsPage();
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('hides logout button when not authenticated', () => {
    mockAuthStore.isAuthenticated = false;
    renderSettingsPage();
    expect(screen.queryByText('Logout')).not.toBeInTheDocument();
  });

  it('calls authStore.logout when logout button is clicked', async () => {
    delete (window as any).location;
    (window as any).location = { href: '' };

    renderSettingsPage();
    const logoutButton = screen.getByText('Logout');

    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(mockAuthStore.logout).toHaveBeenCalled();
      expect(window.location.href).toBe('/');
    });
  });

  it('opens help center when help button is clicked', () => {
    renderSettingsPage();
    const helpButton = screen.getAllByText('Help')[1]; // Second one is the button

    fireEvent.click(helpButton);

    const helpCenter = screen.getByTestId('help-center');
    expect(helpCenter).toHaveAttribute('data-open', 'true');
  });
});
