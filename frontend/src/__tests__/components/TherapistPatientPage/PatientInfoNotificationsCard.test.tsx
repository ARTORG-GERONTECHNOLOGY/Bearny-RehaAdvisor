import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import PatientInfoNotificationsCard from '@/components/TherapistPatientPage/PatientInfoNotificationsCard';
import { PatientPopupStore } from '@/stores/patientPopupStore';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const mockFetchPreferences = jest.fn();
const DEFAULT_PREFERENCES = {
  education: false,
  exercise: false,
  instructions: false,
  reminder: false,
  behavior_change: false,
  other: false,
};
let mockPreferences: Record<string, boolean> = { ...DEFAULT_PREFERENCES };
let mockDeviceCount: number | null = null;
let mockLastSent: Record<string, string | null> = {
  education: null,
  exercise: null,
  instructions: null,
  reminder: null,
  behavior_change: null,
  other: null,
};

jest.mock('@/stores/notificationPreferencesStore', () => {
  const actual = jest.requireActual('@/stores/notificationPreferencesStore');
  return {
    ...actual,
    notificationPreferencesStore: {
      get preferences() {
        return mockPreferences;
      },
      get deviceCount() {
        return mockDeviceCount;
      },
      get lastSent() {
        return mockLastSent;
      },
      fetchPreferences: (...args: unknown[]) => mockFetchPreferences(...args),
    },
  };
});

const makeStore = () => new PatientPopupStore('patient-1');

describe('PatientInfoNotificationsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferences = { ...DEFAULT_PREFERENCES };
    mockDeviceCount = null;
    mockLastSent = {
      education: null,
      exercise: null,
      instructions: null,
      reminder: null,
      behavior_change: null,
      other: null,
    };
  });

  it('shows the card title and a badge for every category', () => {
    const store = makeStore();

    render(<PatientInfoNotificationsCard store={store} />);

    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Managed by the patient in their profile')).toBeInTheDocument();
    ['Education', 'Exercise', 'Instructions', 'Reminder', 'Behavior change', 'Other'].forEach(
      (label) => {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    );
  });

  it('defaults every category to disabled (neutral variant) when preferences have not loaded yet', () => {
    const store = makeStore();

    render(<PatientInfoNotificationsCard store={store} />);

    // dashboard (neutral) variant renders with border-accent (see badge.tsx)
    const badge = screen.getByText('Education');
    expect(badge.className).toContain('border-accent');
  });

  it('reflects an explicitly enabled category with the success badge variant', () => {
    const store = makeStore();
    mockPreferences = { ...DEFAULT_PREFERENCES, education: true };

    render(<PatientInfoNotificationsCard store={store} />);

    // dashboard-success variant renders with border-ok/bg-ok classes (see badge.tsx)
    const badge = screen.getByText('Education');
    expect(badge.className).toContain('border-ok');
  });

  it('ignores a stale notification_preferences snapshot on rawPatient and uses the live store instead', () => {
    const store = makeStore();
    // rawPatient is a one-time snapshot fetched when the popup opened; it must
    // not override the freshly-fetched notificationPreferencesStore data.
    store.rawPatient = { notification_preferences: { education: true } };
    mockPreferences = { ...DEFAULT_PREFERENCES, education: false };

    render(<PatientInfoNotificationsCard store={store} />);

    const badge = screen.getByText('Education');
    expect(badge.className).toContain('border-accent');
  });

  it('fetches device/last-sent data for the current patient on mount', () => {
    const store = makeStore();

    render(<PatientInfoNotificationsCard store={store} />);

    expect(mockFetchPreferences).toHaveBeenCalledWith('patient-1');
  });

  it('shows no device badge before the count has loaded', () => {
    const store = makeStore();
    mockDeviceCount = null;

    render(<PatientInfoNotificationsCard store={store} />);

    expect(screen.queryByText('No device registered')).not.toBeInTheDocument();
    expect(screen.queryByText(/devices registered/)).not.toBeInTheDocument();
  });

  it('warns when the patient has no device registered', () => {
    const store = makeStore();
    mockPreferences = { ...DEFAULT_PREFERENCES, education: true };
    mockDeviceCount = 0;

    render(<PatientInfoNotificationsCard store={store} />);

    expect(screen.getByText('No device registered')).toBeInTheDocument();
  });

  it('shows the device count once at least one device is registered', () => {
    const store = makeStore();
    mockDeviceCount = 2;

    render(<PatientInfoNotificationsCard store={store} />);

    expect(screen.getByText('2 devices registered')).toBeInTheDocument();
  });

  it('shows "Never sent" in the tooltip for a category with no send history', async () => {
    const user = userEvent.setup();
    const store = makeStore();

    render(<PatientInfoNotificationsCard store={store} />);
    await user.hover(screen.getByText('Education'));

    expect(await screen.findByText('Never sent')).toBeInTheDocument();
  });

  it('shows the last-sent timestamp in the tooltip when the category has been sent before', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    mockPreferences = { ...DEFAULT_PREFERENCES, exercise: true };
    mockLastSent = { ...mockLastSent, exercise: '2026-01-15T10:00:00.000Z' };

    render(<PatientInfoNotificationsCard store={store} />);
    await user.hover(screen.getByText('Exercise'));

    expect(await screen.findByText(/Last sent/)).toBeInTheDocument();
  });
});
