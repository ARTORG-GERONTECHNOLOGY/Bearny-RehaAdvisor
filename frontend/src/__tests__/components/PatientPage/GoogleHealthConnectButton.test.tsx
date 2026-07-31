import { render, screen, waitFor } from '@testing-library/react';
import GoogleHealthConnectButton from '@/components/PatientPage/GoogleHealthConnectButton';

const mockFetchStatus = jest.fn();
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
  },
}));

jest.mock('@/utils/googleHealthAuthUrl', () => ({
  buildGoogleHealthAuthUrl: (id: string) => `https://accounts.google.com/oauth?state=${id}`,
}));

describe('GoogleHealthConnectButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockConnected = false;
    mockAuthId = 'auth-patient-id';
  });

  it('fetches status using localStorage patient id', async () => {
    mockAuthId = '';
    localStorage.setItem('id', 'storage-patient-id');
    render(<GoogleHealthConnectButton />);

    await waitFor(() => {
      expect(mockFetchStatus).toHaveBeenCalledWith('storage-patient-id');
    });
  });

  it('falls back to auth store id when localStorage id is missing', async () => {
    render(<GoogleHealthConnectButton />);

    await waitFor(() => {
      expect(mockFetchStatus).toHaveBeenCalledWith('auth-patient-id');
    });
  });

  it('does not fetch the connection status when there is no patient id at all', async () => {
    mockAuthId = '';
    render(<GoogleHealthConnectButton />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockFetchStatus).not.toHaveBeenCalled();
  });

  it('renders nothing when connection state is unknown', () => {
    mockConnected = null;
    const { container } = render(<GoogleHealthConnectButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when already connected', () => {
    mockConnected = true;
    const { container } = render(<GoogleHealthConnectButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a Google Health authorize link when disconnected', async () => {
    mockAuthId = '';
    localStorage.setItem('id', 'patient-77');
    render(<GoogleHealthConnectButton />);

    const link = await screen.findByRole('link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', expect.stringContaining('accounts.google.com'));
    expect(link).toHaveAttribute('href', expect.stringContaining('state=patient-77'));
    expect(screen.getByRole('button', { name: 'Connect Google Health' })).toBeInTheDocument();
  });
});
