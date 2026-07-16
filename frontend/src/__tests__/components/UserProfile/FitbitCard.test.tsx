import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const mockDisconnect = jest.fn();
let mockConnected: boolean | null = null;

jest.mock('@/stores/patientFitbitStore', () => ({
  patientFitbitStore: {
    get connected() {
      return mockConnected;
    },
    disconnect: (...args: unknown[]) => mockDisconnect(...args),
  },
}));

jest.mock('@/components/PatientPage/FitbitStatus', () => ({
  __esModule: true,
  default: () => <button data-testid="fitbit-connect-button">Connect Fitbit</button>,
}));

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

import FitbitCard from '@/components/UserProfile/FitbitCard';

const renderCard = () => render(<FitbitCard />);

beforeEach(() => {
  jest.clearAllMocks();
  mockConnected = null;
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe('FitbitCard — loading state (connected === null)', () => {
  it('renders skeleton placeholders while status is unknown', () => {
    mockConnected = null;
    renderCard();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(2);
  });

  it('does not render the connect button while loading', () => {
    mockConnected = null;
    renderCard();
    expect(screen.queryByTestId('fitbit-connect-button')).not.toBeInTheDocument();
  });

  it('does not render the disconnect button while loading', () => {
    mockConnected = null;
    renderCard();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
  });
});

// ── Disconnected state ────────────────────────────────────────────────────────

describe('FitbitCard — disconnected state', () => {
  beforeEach(() => {
    mockConnected = false;
  });

  it('renders the Fitbit label and subtitle', () => {
    renderCard();
    expect(screen.getByText('Fitbit')).toBeInTheDocument();
    expect(screen.getByText('Fitness Tracker')).toBeInTheDocument();
  });

  it('shows the connect button when disconnected', () => {
    renderCard();
    expect(screen.getByTestId('fitbit-connect-button')).toBeInTheDocument();
  });

  it('does not show the disconnect button when disconnected', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
  });

  it('applies the grey background style when disconnected', () => {
    renderCard();
    const label = screen.getByText('Fitbit');
    let container = label.closest('div');
    while (container && !container.className.includes('p-4')) {
      container = container.parentElement as HTMLElement | null;
    }
    expect(container?.className).toContain('bg-zinc-100');
  });
});

// ── Connected state ───────────────────────────────────────────────────────────

describe('FitbitCard — connected state', () => {
  beforeEach(() => {
    mockConnected = true;
  });

  it('shows "Fitbit Connected" label', () => {
    renderCard();
    expect(screen.getByText('Fitbit Connected')).toBeInTheDocument();
    expect(screen.getByText('Fitness Tracker')).toBeInTheDocument();
  });

  it('does not show the connect button when already connected', () => {
    renderCard();
    expect(screen.queryByTestId('fitbit-connect-button')).not.toBeInTheDocument();
  });

  it('renders a Disconnect button when connected', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('applies the border/accent style when connected', () => {
    renderCard();
    const label = screen.getByText('Fitbit Connected');
    let container = label.closest('div');
    while (container && !container.className.includes('p-4')) {
      container = container.parentElement as HTMLElement | null;
    }
    expect(container?.className).toMatch(/border/);
    expect(container?.className).toMatch(/accent/);
  });
});

// ── Disconnect confirmation sheet ─────────────────────────────────────────────

describe('FitbitCard — disconnect confirmation flow', () => {
  beforeEach(() => {
    mockConnected = true;
  });

  it('does not show the confirmation sheet initially', () => {
    renderCard();
    expect(screen.queryByText('Disconnect Fitbit')).not.toBeInTheDocument();
  });

  it('opens the confirmation sheet when Disconnect is clicked', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => {
      expect(screen.getByText('Disconnect Fitbit')).toBeInTheDocument();
    });
  });

  it('shows Cancel and a confirm Disconnect button in the sheet', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    });
  });

  it('closes the sheet when Cancel is clicked without calling disconnect', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByText('Disconnect Fitbit')).not.toBeInTheDocument();
    });
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('calls patientFitbitStore.disconnect() when the confirm button is clicked', async () => {
    mockDisconnect.mockResolvedValueOnce(undefined);
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => {
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });
  });

  it('closes the sheet after a successful disconnect', async () => {
    mockDisconnect.mockResolvedValueOnce(undefined);
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => {
      expect(screen.queryByText('Disconnect Fitbit')).not.toBeInTheDocument();
    });
  });
});
