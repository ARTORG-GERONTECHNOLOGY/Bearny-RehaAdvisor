import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

  it('leaves loading the status to the page instead of fetching it again', async () => {
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

  it('renders a Connect button when disconnected and navigates to Google OAuth on click', async () => {
    mockAuthId = '';
    localStorage.setItem('id', 'patient-77');

    const assignMock = jest.spyOn(window.location, 'assign').mockImplementation(jest.fn());

    render(<GoogleHealthConnectButton />);

    const button = screen.getByRole('button', { name: /connect google health/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);

    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith(expect.stringContaining('accounts.google.com'));
      expect(assignMock).toHaveBeenCalledWith(expect.stringContaining('state=patient-77'));
    });

    assignMock.mockRestore();
  });
});
