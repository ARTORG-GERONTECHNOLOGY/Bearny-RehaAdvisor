import { render, screen, fireEvent } from '@testing-library/react';
import ReconnectBanner from '@/components/PatientPage/ReconnectBanner';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

// Store mock — values are controlled per-test via the mutable object below
const mockStore = {
  needsReconnect: false,
  daysUntilExpiry: null as number | null,
};

jest.mock('@/stores/patientFitbitStore', () => ({
  patientFitbitStore: {
    get needsReconnect() {
      return mockStore.needsReconnect;
    },
    get daysUntilExpiry() {
      return mockStore.daysUntilExpiry;
    },
  },
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { id: 'test-patient-id' },
}));

jest.mock('@/utils/googleHealthAuthUrl', () => ({
  buildGoogleHealthAuthUrl: (id: string) => `https://accounts.google.com/oauth?state=${id}`,
}));

function setStore(needsReconnect: boolean, daysUntilExpiry: number | null) {
  mockStore.needsReconnect = needsReconnect;
  mockStore.daysUntilExpiry = daysUntilExpiry;
}

beforeEach(() => {
  setStore(false, null);
  sessionStorage.clear();
  localStorage.setItem('id', 'test-patient-id');
});

afterEach(() => {
  localStorage.clear();
});

describe('ReconnectBanner — visibility', () => {
  it('renders nothing when needsReconnect is false', () => {
    setStore(false, null);
    const { container } = render(<ReconnectBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the banner when needsReconnect is true', () => {
    setStore(true, 1);
    render(<ReconnectBanner />);
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('renders nothing when already dismissed this session', () => {
    sessionStorage.setItem('reconnect_banner_dismissed_test-patient-id', '1');
    setStore(true, 1);
    const { container } = render(<ReconnectBanner />);
    expect(container.firstChild).toBeNull();
  });
});

describe('ReconnectBanner — warning message (days remaining)', () => {
  it('shows the "expires in N day(s)" message when daysUntilExpiry >= 1', () => {
    setStore(true, 1);
    render(<ReconnectBanner />);
    // The t() mock returns the English template with interpolation applied
    expect(screen.getByText(/expires in 1 day/i)).toBeInTheDocument();
  });

  it('shows the "expires in N day(s)" message for multiple days', () => {
    setStore(true, 2);
    render(<ReconnectBanner />);
    expect(screen.getByText(/expires in 2 day/i)).toBeInTheDocument();
  });
});

describe('ReconnectBanner — expired message (days = 0)', () => {
  it('shows the "has expired" message when daysUntilExpiry is 0', () => {
    setStore(true, 0);
    render(<ReconnectBanner />);
    expect(screen.getByText(/reconnectBannerExpired/i)).toBeInTheDocument();
  });

  it('shows the "has expired" message when daysUntilExpiry is null', () => {
    setStore(true, null);
    render(<ReconnectBanner />);
    expect(screen.getByText(/reconnectBannerExpired/i)).toBeInTheDocument();
  });
});

describe('ReconnectBanner — reconnect link', () => {
  it('renders a Reconnect link pointing to the Google OAuth URL', () => {
    setStore(true, 1);
    render(<ReconnectBanner />);
    const link = screen.getByRole('link', { name: /reconnect/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('accounts.google.com'));
    expect(link).toHaveAttribute('href', expect.stringContaining('test-patient-id'));
  });
});

describe('ReconnectBanner — dismiss behaviour', () => {
  it('hides the banner when the × button is clicked', () => {
    setStore(true, 1);
    render(<ReconnectBanner />);

    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull();
  });

  it('writes dismiss flag to sessionStorage on dismiss', () => {
    setStore(true, 1);
    render(<ReconnectBanner />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(sessionStorage.getItem('reconnect_banner_dismissed_test-patient-id')).toBe('1');
  });

  it('uses localStorage id for the dismiss key when available', () => {
    localStorage.setItem('id', 'ls-patient-id');
    setStore(true, 1);
    render(<ReconnectBanner />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(sessionStorage.getItem('reconnect_banner_dismissed_ls-patient-id')).toBe('1');
  });
});
