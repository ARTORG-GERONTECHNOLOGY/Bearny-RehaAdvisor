import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationsCard from '@/components/UserProfile/NotificationsCard';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
  }: {
    checked: boolean;
    disabled?: boolean;
    onCheckedChange: (value: boolean) => void;
  }) => (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { getStoredUserId: jest.fn(() => 'patient-1') },
}));

const mockFetchPreferences = jest.fn();
let mockPreferences = {
  education: true,
  exercise: true,
  instructions: true,
  reminder: true,
  behavior_change: true,
  other: true,
};
let mockError = '';

jest.mock('@/stores/notificationPreferencesStore', () => {
  const actual = jest.requireActual('@/stores/notificationPreferencesStore');
  return {
    ...actual,
    notificationPreferencesStore: {
      get preferences() {
        return mockPreferences;
      },
      get error() {
        return mockError;
      },
      fetchPreferences: (...args: unknown[]) => mockFetchPreferences(...args),
    },
  };
});

const mockToggleCategory = jest.fn();
const mockToggleAll = jest.fn();
const mockEnableOnThisDevice = jest.fn();
const mockUseNotifications = jest.fn(() => ({
  permission: 'default' as NotificationPermission,
  supportsPush: true,
  // Default represents a fully synced device: preferences are on and this
  // device is subscribed, so the "not on this device" hint stays hidden
  // unless a test explicitly sets isSubscribedOnThisDevice to false.
  isSubscribedOnThisDevice: true,
  deviceCheckComplete: true,
  enableOnThisDevice: mockEnableOnThisDevice,
  pendingDeviceEnable: false,
  toggleCategory: mockToggleCategory,
  toggleAll: mockToggleAll,
  pendingCategories: new Set<string>(),
  pendingAll: false,
}));

jest.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => mockUseNotifications(),
}));

describe('NotificationsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferences = {
      education: true,
      exercise: true,
      instructions: true,
      reminder: true,
      behavior_change: true,
      other: true,
    };
    mockError = '';
    mockUseNotifications.mockReturnValue({
      permission: 'default' as NotificationPermission,
      supportsPush: true,
      isSubscribedOnThisDevice: true,
      deviceCheckComplete: true,
      enableOnThisDevice: mockEnableOnThisDevice,
      pendingDeviceEnable: false,
      toggleCategory: mockToggleCategory,
      toggleAll: mockToggleAll,
      pendingCategories: new Set<string>(),
      pendingAll: false,
    });
  });

  it('fetches preferences for the current patient on mount', () => {
    render(<NotificationsCard />);
    expect(mockFetchPreferences).toHaveBeenCalledWith('patient-1');
  });

  it('renders a master switch plus one switch per category', () => {
    render(<NotificationsCard />);
    // 1 master + 6 categories
    expect(screen.getAllByRole('switch')).toHaveLength(7);
  });

  it('renders a label for every category', () => {
    render(<NotificationsCard />);
    ['Education', 'Exercise', 'Instructions', 'Reminder', 'Behavior change', 'Other'].forEach(
      (label) => {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    );
  });

  it('master switch is checked when all categories are enabled', () => {
    render(<NotificationsCard />);
    const switches = screen.getAllByRole('switch');
    expect(switches[0]).toBeChecked();
  });

  it('master switch is unchecked when any category is disabled', () => {
    mockPreferences = { ...mockPreferences, education: false };
    render(<NotificationsCard />);
    const switches = screen.getAllByRole('switch');
    expect(switches[0]).not.toBeChecked();
  });

  it('calls toggleAll with the patient id when the master switch is clicked', () => {
    render(<NotificationsCard />);
    fireEvent.click(screen.getAllByRole('switch')[0]);
    expect(mockToggleAll).toHaveBeenCalledWith('patient-1', false);
  });

  it('calls toggleCategory with the patient id and category when a category switch is clicked', () => {
    render(<NotificationsCard />);
    // switches[1] corresponds to the first category, "education"
    fireEvent.click(screen.getAllByRole('switch')[1]);
    expect(mockToggleCategory).toHaveBeenCalledWith('patient-1', 'education', false);
  });

  it('shows permission denied warning when permission is denied', () => {
    mockUseNotifications.mockReturnValue({
      permission: 'denied' as NotificationPermission,
      supportsPush: true,
      isSubscribedOnThisDevice: true,
      deviceCheckComplete: true,
      enableOnThisDevice: mockEnableOnThisDevice,
      pendingDeviceEnable: false,
      toggleCategory: mockToggleCategory,
      toggleAll: mockToggleAll,
      pendingCategories: new Set<string>(),
      pendingAll: false,
    });
    render(<NotificationsCard />);
    expect(
      screen.getByText('Notification permission denied. Please enable in browser settings.')
    ).toBeInTheDocument();
  });

  it('shows unsupported warning when push is not supported', () => {
    mockUseNotifications.mockReturnValue({
      permission: 'default' as NotificationPermission,
      supportsPush: false,
      isSubscribedOnThisDevice: true,
      deviceCheckComplete: true,
      enableOnThisDevice: mockEnableOnThisDevice,
      pendingDeviceEnable: false,
      toggleCategory: mockToggleCategory,
      toggleAll: mockToggleAll,
      pendingCategories: new Set<string>(),
      pendingAll: false,
    });
    render(<NotificationsCard />);
    expect(
      screen.getByText('Push notifications are not supported in this browser.')
    ).toBeInTheDocument();
  });

  it('does not show warnings when everything is supported and permission is granted', () => {
    mockUseNotifications.mockReturnValue({
      permission: 'granted' as NotificationPermission,
      supportsPush: true,
      isSubscribedOnThisDevice: true,
      deviceCheckComplete: true,
      enableOnThisDevice: mockEnableOnThisDevice,
      pendingDeviceEnable: false,
      toggleCategory: mockToggleCategory,
      toggleAll: mockToggleAll,
      pendingCategories: new Set<string>(),
      pendingAll: false,
    });
    render(<NotificationsCard />);
    expect(
      screen.queryByText('Notification permission denied. Please enable in browser settings.')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Push notifications are not supported in this browser.')
    ).not.toBeInTheDocument();
  });

  it('shows the store error message when a save/subscribe attempt fails (regression: errors were tracked but never rendered)', () => {
    mockError = 'Failed to enable push notifications';
    render(<NotificationsCard />);
    expect(screen.getByText('Failed to enable push notifications')).toBeInTheDocument();
  });

  it('does not show an error message when there is none', () => {
    render(<NotificationsCard />);
    expect(screen.queryByText(/Failed to/)).not.toBeInTheDocument();
  });

  describe('pending state disables the corresponding switch', () => {
    it('disables the master switch while pendingAll is true', () => {
      mockUseNotifications.mockReturnValue({
        permission: 'default' as NotificationPermission,
        supportsPush: true,
        isSubscribedOnThisDevice: true,
        deviceCheckComplete: true,
        enableOnThisDevice: mockEnableOnThisDevice,
        pendingDeviceEnable: false,
        toggleCategory: mockToggleCategory,
        toggleAll: mockToggleAll,
        pendingCategories: new Set<string>(),
        pendingAll: true,
      });
      render(<NotificationsCard />);
      const switches = screen.getAllByRole('switch');
      expect(switches[0]).toBeDisabled();
      // Category switches are also disabled while a bulk operation is in flight.
      expect(switches[1]).toBeDisabled();
    });

    it('disables only the pending category switch, not the others', () => {
      mockUseNotifications.mockReturnValue({
        permission: 'default' as NotificationPermission,
        supportsPush: true,
        isSubscribedOnThisDevice: true,
        deviceCheckComplete: true,
        enableOnThisDevice: mockEnableOnThisDevice,
        pendingDeviceEnable: false,
        toggleCategory: mockToggleCategory,
        toggleAll: mockToggleAll,
        pendingCategories: new Set(['education']),
        pendingAll: false,
      });
      render(<NotificationsCard />);
      const switches = screen.getAllByRole('switch');
      expect(switches[0]).not.toBeDisabled(); // master
      expect(switches[1]).toBeDisabled(); // education (first category)
      expect(switches[2]).not.toBeDisabled(); // exercise
    });

    it('does not call toggleCategory when clicking a disabled switch', () => {
      mockUseNotifications.mockReturnValue({
        permission: 'default' as NotificationPermission,
        supportsPush: true,
        isSubscribedOnThisDevice: true,
        deviceCheckComplete: true,
        enableOnThisDevice: mockEnableOnThisDevice,
        pendingDeviceEnable: false,
        toggleCategory: mockToggleCategory,
        toggleAll: mockToggleAll,
        pendingCategories: new Set(['education']),
        pendingAll: false,
      });
      render(<NotificationsCard />);
      fireEvent.click(screen.getAllByRole('switch')[1]);
      expect(mockToggleCategory).not.toHaveBeenCalled();
    });
  });

  describe('device hint banner', () => {
    const HINT_TEXT = 'Notifications are enabled on your account, but not on this device.';

    it('shows the hint when a category is enabled but this device has no subscription', () => {
      mockUseNotifications.mockReturnValue({
        permission: 'default' as NotificationPermission,
        supportsPush: true,
        isSubscribedOnThisDevice: false,
        deviceCheckComplete: true,
        enableOnThisDevice: mockEnableOnThisDevice,
        pendingDeviceEnable: false,
        toggleCategory: mockToggleCategory,
        toggleAll: mockToggleAll,
        pendingCategories: new Set<string>(),
        pendingAll: false,
      });
      render(<NotificationsCard />);
      expect(screen.getByText(HINT_TEXT)).toBeInTheDocument();
      expect(screen.getByText('Enable on this device')).toBeInTheDocument();
    });

    it('hides the hint while the device subscription check is still in flight (regression: hint flashed on for already-subscribed devices)', () => {
      mockUseNotifications.mockReturnValue({
        permission: 'default' as NotificationPermission,
        supportsPush: true,
        isSubscribedOnThisDevice: false,
        deviceCheckComplete: false,
        enableOnThisDevice: mockEnableOnThisDevice,
        pendingDeviceEnable: false,
        toggleCategory: mockToggleCategory,
        toggleAll: mockToggleAll,
        pendingCategories: new Set<string>(),
        pendingAll: false,
      });
      render(<NotificationsCard />);
      expect(screen.queryByText(HINT_TEXT)).not.toBeInTheDocument();
    });

    it('hides the hint once this device is subscribed', () => {
      render(<NotificationsCard />); // default mock: isSubscribedOnThisDevice: true
      expect(screen.queryByText(HINT_TEXT)).not.toBeInTheDocument();
    });

    it('hides the hint when no category is enabled, even without a local subscription', () => {
      mockPreferences = {
        education: false,
        exercise: false,
        instructions: false,
        reminder: false,
        behavior_change: false,
        other: false,
      };
      mockUseNotifications.mockReturnValue({
        permission: 'default' as NotificationPermission,
        supportsPush: true,
        isSubscribedOnThisDevice: false,
        deviceCheckComplete: true,
        enableOnThisDevice: mockEnableOnThisDevice,
        pendingDeviceEnable: false,
        toggleCategory: mockToggleCategory,
        toggleAll: mockToggleAll,
        pendingCategories: new Set<string>(),
        pendingAll: false,
      });
      render(<NotificationsCard />);
      expect(screen.queryByText(HINT_TEXT)).not.toBeInTheDocument();
    });

    it('hides the hint when push is not supported in this browser', () => {
      mockUseNotifications.mockReturnValue({
        permission: 'default' as NotificationPermission,
        supportsPush: false,
        isSubscribedOnThisDevice: false,
        deviceCheckComplete: true,
        enableOnThisDevice: mockEnableOnThisDevice,
        pendingDeviceEnable: false,
        toggleCategory: mockToggleCategory,
        toggleAll: mockToggleAll,
        pendingCategories: new Set<string>(),
        pendingAll: false,
      });
      render(<NotificationsCard />);
      expect(screen.queryByText(HINT_TEXT)).not.toBeInTheDocument();
    });

    it('hides the hint when permission is denied, deferring to the denied warning instead', () => {
      mockUseNotifications.mockReturnValue({
        permission: 'denied' as NotificationPermission,
        supportsPush: true,
        isSubscribedOnThisDevice: false,
        deviceCheckComplete: true,
        enableOnThisDevice: mockEnableOnThisDevice,
        pendingDeviceEnable: false,
        toggleCategory: mockToggleCategory,
        toggleAll: mockToggleAll,
        pendingCategories: new Set<string>(),
        pendingAll: false,
      });
      render(<NotificationsCard />);
      expect(screen.queryByText(HINT_TEXT)).not.toBeInTheDocument();
    });

    it('calls enableOnThisDevice with the patient id when the hint action is clicked', () => {
      mockUseNotifications.mockReturnValue({
        permission: 'default' as NotificationPermission,
        supportsPush: true,
        isSubscribedOnThisDevice: false,
        deviceCheckComplete: true,
        enableOnThisDevice: mockEnableOnThisDevice,
        pendingDeviceEnable: false,
        toggleCategory: mockToggleCategory,
        toggleAll: mockToggleAll,
        pendingCategories: new Set<string>(),
        pendingAll: false,
      });
      render(<NotificationsCard />);
      fireEvent.click(screen.getByText('Enable on this device'));
      expect(mockEnableOnThisDevice).toHaveBeenCalledWith('patient-1');
    });

    it('disables the hint action while pendingDeviceEnable is true', () => {
      mockUseNotifications.mockReturnValue({
        permission: 'default' as NotificationPermission,
        supportsPush: true,
        isSubscribedOnThisDevice: false,
        deviceCheckComplete: true,
        enableOnThisDevice: mockEnableOnThisDevice,
        pendingDeviceEnable: true,
        toggleCategory: mockToggleCategory,
        toggleAll: mockToggleAll,
        pendingCategories: new Set<string>(),
        pendingAll: false,
      });
      render(<NotificationsCard />);
      expect(screen.getByText('Enable on this device')).toBeDisabled();
    });
  });
});
