import { render, screen, fireEvent } from '@testing-library/react';
import ReconnectBanner from '@/components/PatientPage/ReconnectBanner';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

// Store mock — values are controlled per-test via the mutable object below
const mockStore = {
  needsReconnect: false,
  daysUntilExpiry: null as number | null,
  hrScopeOk: null as boolean | null,
  hrDataMissing: null as boolean | null,
  sleepScopeOk: null as boolean | null,
  noDataEver: null as boolean | null,
  accountNotLinked: null as boolean | null,
  wearableDevice: 'fitbit' as string,
};

jest.mock('@/stores/patientFitbitStore', () => ({
  patientFitbitStore: {
    get needsReconnect() {
      return mockStore.needsReconnect;
    },
    get daysUntilExpiry() {
      return mockStore.daysUntilExpiry;
    },
    get hrScopeOk() {
      return mockStore.hrScopeOk;
    },
    get hrDataMissing() {
      return mockStore.hrDataMissing;
    },
    get sleepScopeOk() {
      return mockStore.sleepScopeOk;
    },
    get noDataEver() {
      return mockStore.noDataEver;
    },
    get accountNotLinked() {
      return mockStore.accountNotLinked;
    },
    get wearableDevice() {
      return mockStore.wearableDevice;
    },
  },
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    id: 'test-patient-id',
    getStoredUserId: jest.fn(function (this: { id: string }) {
      return this.id || localStorage.getItem('id') || '';
    }),
  },
}));

jest.mock('@/utils/googleHealthAuthUrl', () => ({
  buildGoogleHealthAuthUrl: (id: string) =>
    Promise.resolve(`https://accounts.google.com/oauth?state=${id}`),
}));

const mockAuthStore = jest.requireMock('@/stores/authStore').default as { id: string };

function setStore(
  needsReconnect: boolean,
  daysUntilExpiry: number | null,
  overrides: Partial<typeof mockStore> = {}
) {
  mockStore.needsReconnect = needsReconnect;
  mockStore.daysUntilExpiry = daysUntilExpiry;
  mockStore.hrScopeOk = overrides.hrScopeOk ?? null;
  mockStore.hrDataMissing = overrides.hrDataMissing ?? null;
  mockStore.sleepScopeOk = overrides.sleepScopeOk ?? null;
  mockStore.noDataEver = overrides.noDataEver ?? null;
  mockStore.accountNotLinked = overrides.accountNotLinked ?? null;
  mockStore.wearableDevice = overrides.wearableDevice ?? 'fitbit';
}

beforeEach(() => {
  setStore(false, null);
  sessionStorage.clear();
  mockAuthStore.id = 'test-patient-id';
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

describe('ReconnectBanner — layout', () => {
  it("wraps its actions below long text and takes the caller's grid classes", () => {
    setStore(true, 3);
    const { container } = render(<ReconnectBanner className="lg:col-span-3" />);
    const banner = container.firstChild as HTMLElement;
    expect(banner).toHaveClass('flex-wrap', 'lg:col-span-3');
    // The compact size; the default one is too large to sit next to the text.
    expect(screen.getByRole('button', { name: 'Reconnect' })).toHaveClass('text-sm');
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

describe('ReconnectBanner — reconnect button', () => {
  it('renders a Reconnect button', () => {
    setStore(true, 1);
    render(<ReconnectBanner />);
    expect(screen.getByRole('button', { name: /reconnect/i })).toBeInTheDocument();
  });
});

describe('ReconnectBanner — account not linked banner', () => {
  it('asks the patient to reconnect with the right Google account', () => {
    setStore(false, null, { accountNotLinked: true, wearableDevice: 'google_health' });
    render(<ReconnectBanner />);
    expect(screen.getByText(/notLinkedBannerTitle/i)).toBeInTheDocument();
    expect(screen.getByText(/notLinkedBannerReason/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reconnect/i })).toBeInTheDocument();
  });

  it("links to Google's sign-up page for patients already on the right account", () => {
    setStore(false, null, { accountNotLinked: true, wearableDevice: 'google_health' });
    render(<ReconnectBanner />);
    const link = screen.getByRole('link', { name: /set up google health/i });
    expect(link).toHaveAttribute('href', 'https://fitbit.google.com/auth/signup');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows the set-up link only on the not-linked banner', () => {
    setStore(false, null, { hrScopeOk: false, wearableDevice: 'google_health' });
    render(<ReconnectBanner />);
    expect(screen.queryByRole('link', { name: /set up google health/i })).toBeNull();
  });

  it('takes precedence over the no-data banner', () => {
    setStore(false, null, {
      accountNotLinked: true,
      noDataEver: true,
      hrScopeOk: true,
      sleepScopeOk: true,
    });
    render(<ReconnectBanner />);
    expect(screen.getByText(/notLinkedBannerTitle/i)).toBeInTheDocument();
    expect(screen.queryByText(/noDataBannerTitle/i)).toBeNull();
  });

  it('renders nothing when accountNotLinked is false', () => {
    setStore(false, null, { accountNotLinked: false });
    const { container } = render(<ReconnectBanner />);
    expect(container.firstChild).toBeNull();
  });
});

describe('ReconnectBanner — noDataEver banner', () => {
  it('shows the no-data banner when connected but no data has ever been received', () => {
    setStore(false, null, { noDataEver: true, hrScopeOk: true, sleepScopeOk: true });
    render(<ReconnectBanner />);
    expect(screen.getByText(/noDataBannerTitle/i)).toBeInTheDocument();
    expect(screen.getByText(/noDataBannerReason/i)).toBeInTheDocument();
  });

  it('does not show a Reconnect button for the no-data banner', () => {
    setStore(false, null, { noDataEver: true, hrScopeOk: true, sleepScopeOk: true });
    render(<ReconnectBanner />);
    expect(screen.queryByRole('button', { name: /reconnect/i })).toBeNull();
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('shows the hr-scope banner instead when scopes are missing even if noDataEver is true', () => {
    setStore(false, null, { noDataEver: true, hrScopeOk: false });
    render(<ReconnectBanner />);
    expect(screen.getByText(/hrScopeBannerTitle/i)).toBeInTheDocument();
  });

  it('renders nothing when noDataEver is false', () => {
    setStore(false, null, { noDataEver: false });
    const { container } = render(<ReconnectBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when noDataEver is null', () => {
    setStore(false, null, { noDataEver: null });
    const { container } = render(<ReconnectBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when a scope probe result is unknown', () => {
    setStore(false, null, { noDataEver: true, hrScopeOk: null, sleepScopeOk: true });
    const { container } = render(<ReconnectBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('dismissing the no-data banner does not hide a later hr-scope banner', () => {
    setStore(false, null, { noDataEver: true, hrScopeOk: true, sleepScopeOk: true });
    const { unmount } = render(<ReconnectBanner />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    unmount();

    setStore(false, null, { noDataEver: true, hrScopeOk: false, sleepScopeOk: true });
    render(<ReconnectBanner />);
    expect(screen.getByText(/hrScopeBannerTitle/i)).toBeInTheDocument();
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

  it('prefers the authStore id over localStorage for the dismiss key when both are set', () => {
    localStorage.setItem('id', 'ls-patient-id');
    mockAuthStore.id = 'test-patient-id';
    setStore(true, 1);
    render(<ReconnectBanner />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(sessionStorage.getItem('reconnect_banner_dismissed_test-patient-id')).toBe('1');
  });

  it('falls back to the localStorage id for the dismiss key when authStore id is empty', () => {
    mockAuthStore.id = '';
    localStorage.setItem('id', 'ls-patient-id');
    setStore(true, 1);
    render(<ReconnectBanner />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(sessionStorage.getItem('reconnect_banner_dismissed_ls-patient-id')).toBe('1');
  });
});

describe('ReconnectBanner — remaining variants and priority', () => {
  it('shows the hr-sync banner without a Reconnect button', () => {
    setStore(false, null, { hrDataMissing: true, hrScopeOk: true });
    render(<ReconnectBanner />);
    expect(screen.getByText(/hrSyncBannerTitle/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reconnect/i })).not.toBeInTheDocument();
  });

  it('shows the sleep-scope banner with a Reconnect button', () => {
    setStore(false, null, { sleepScopeOk: false });
    render(<ReconnectBanner />);
    expect(screen.getByText(/sleepScopeBannerTitle/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reconnect/i })).toBeInTheDocument();
  });

  it('prefers the hr-sync banner when heart rate and sleep access are both affected', () => {
    setStore(false, null, { hrDataMissing: true, hrScopeOk: true, sleepScopeOk: false });
    render(<ReconnectBanner />);
    expect(screen.getByText(/hrSyncBannerTitle/i)).toBeInTheDocument();
    expect(screen.queryByText(/sleepScopeBannerTitle/i)).not.toBeInTheDocument();
  });

  it('shows the next applicable banner once the first one is dismissed', () => {
    setStore(false, null, { hrDataMissing: true, hrScopeOk: true, sleepScopeOk: false });
    render(<ReconnectBanner />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(/hrSyncBannerTitle/i)).not.toBeInTheDocument();
    expect(screen.getByText(/sleepScopeBannerTitle/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reconnect/i })).toBeInTheDocument();
  });

  it('keeps a banner hidden that was dismissed earlier in the session', () => {
    sessionStorage.setItem('reconnect_banner_dismissed_test-patient-id_hrSync', '1');
    setStore(false, null, { hrDataMissing: true, hrScopeOk: true, sleepScopeOk: false });
    render(<ReconnectBanner />);
    expect(screen.queryByText(/hrSyncBannerTitle/i)).not.toBeInTheDocument();
    expect(screen.getByText(/sleepScopeBannerTitle/i)).toBeInTheDocument();
  });
});
