import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FitbitConnectButton from '@/components/PatientPage/FitbitStatus';

const mockFetchStatus = jest.fn();
const mockDisconnect = jest.fn();
let mockConnected: boolean | null = false;
let mockAuthId = 'auth-patient-id';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    get id() {
      return mockAuthId;
    },
    getStoredUserId: jest.fn(function (this: { id: string }) {
      return this.id || localStorage.getItem('id') || '';
    }),
  },
}));

jest.mock('@/stores/patientFitbitStore', () => ({
  patientFitbitStore: {
    get connected() {
      return mockConnected;
    },
    fetchStatus: (...args: unknown[]) => mockFetchStatus(...args),
    disconnect: () => mockDisconnect(),
  },
}));

// Mock the API client used to fetch the nonce
const mockApiGet = jest.fn();
jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

// Capture window.location.href assignments.
// jsdom marks window.location non-configurable, so Object.defineProperty can't
// redefine it directly. Deleting it first (a jsdom-permitted quirk) lets us
// assign a plain stub object with a captured href setter.
const originalLocation = window.location;
let locationHref = '';
beforeAll(() => {
  delete (window as any).location;
  (window as any).location = {
    get href() {
      return locationHref;
    },
    set href(v: string) {
      locationHref = v;
    },
    assign: jest.fn(),
    replace: jest.fn(),
  };
});
afterAll(() => {
  (window as any).location = originalLocation;
});

describe('FitbitStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockConnected = false;
    mockAuthId = 'auth-patient-id';
    locationHref = '';
    mockApiGet.mockResolvedValue({ data: { nonce: 'test-nonce-abc' } });
  });

  // ── Status polling ──────────────────────────────────────────────────────

  it('fetches status using localStorage patient id', async () => {
    mockAuthId = '';
    localStorage.setItem('id', 'storage-patient-id');
    render(<FitbitConnectButton />);

    await waitFor(() => {
      expect(mockFetchStatus).toHaveBeenCalledWith('storage-patient-id');
    });
  });

  it('falls back to auth store id when localStorage id is missing', async () => {
    render(<FitbitConnectButton />);

    await waitFor(() => {
      expect(mockFetchStatus).toHaveBeenCalledWith('auth-patient-id');
    });
  });

  it('does not fetch the connection status when there is no patient id at all', async () => {
    mockAuthId = '';
    render(<FitbitConnectButton />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockFetchStatus).not.toHaveBeenCalled();
  });

  // ── Render states ───────────────────────────────────────────────────────

  it('renders nothing when connection state is unknown', () => {
    mockConnected = null;
    const { container } = render(<FitbitConnectButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a disconnect button when already connected', () => {
    mockConnected = true;
    render(<FitbitConnectButton />);
    expect(screen.getByRole('button', { name: 'Disconnect Fitbit' })).toBeInTheDocument();
  });

  it('renders a connect button (not a plain link) when disconnected', () => {
    render(<FitbitConnectButton />);
    // The button must be a <button>, not an <a>, so it can use the async nonce flow
    expect(screen.getByRole('button', { name: 'Connect Fitbit' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  // ── Nonce-based OAuth flow ──────────────────────────────────────────────

  it('calls /fitbit/auth-init/ with patientId when Connect is clicked', async () => {
    localStorage.setItem('id', 'patient-77');
    mockAuthId = '';
    render(<FitbitConnectButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect Fitbit' }));

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(
        '/fitbit/auth-init/',
        expect.objectContaining({ params: { patientId: 'patient-77' } })
      );
    });
  });

  it('redirects to Fitbit with nonce:patientId in the state parameter', async () => {
    mockAuthId = 'patient-99';
    render(<FitbitConnectButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect Fitbit' }));

    await waitFor(() => {
      expect(locationHref).toContain('https://www.fitbit.com/oauth2/authorize');
      // state must be <nonce>:<patientId>
      const url = new URL(locationHref);
      const state = url.searchParams.get('state');
      expect(state).toMatch(/^test-nonce-abc:patient-99$/);
    });
  });

  it('includes prompt=login in the Fitbit auth URL to prevent session reuse', async () => {
    mockAuthId = 'patient-99';
    render(<FitbitConnectButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect Fitbit' }));

    await waitFor(() => {
      expect(locationHref).toContain('prompt=login');
    });
  });

  it('does not redirect when the nonce API call fails', async () => {
    mockApiGet.mockRejectedValue(new Error('network error'));
    mockAuthId = 'patient-fail';
    render(<FitbitConnectButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect Fitbit' }));

    // Wait long enough for the async handler to settle
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(locationHref).toBe('');
  });

  // ── Disconnect ──────────────────────────────────────────────────────────

  it('calls disconnect when the Disconnect button is clicked', () => {
    mockConnected = true;
    render(<FitbitConnectButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Fitbit' }));
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
