import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// ─── date-fns ─────────────────────────────────────────────────────────────────
jest.mock('date-fns', () => ({
  format: () => '01.05. - 07.05.',
}));

// ─── usePatientProcess hook ───────────────────────────────────────────────────
const mockSetProcessFilter = jest.fn();
const baseHookReturn = {
  processFilter: 'week' as const,
  setProcessFilter: mockSetProcessFilter,
  from: '2026-05-01',
  to: '2026-05-07',
  loading: false,
  error: '',
  dailyMetrics: [],
  adherenceTotals: { completed: 3, uncompleted: 1 },
  averageMetrics: {
    steps: 7500,
    activeMinutes: 35,
    activeMinutesLabel: '35 min',
    sleepMinutes: 430,
    sleepMinutesLabel: '7h 10min',
    recommendationsPct: 75,
    bpSys: 118,
    bpDia: 76,
  },
  chartThresholds: {
    stepsGreen: 10000,
    activeMinutesGreen: 30,
    activeMinutesYellow: null,
    sleepMinutesGreen: 420,
    sleepMinutesYellow: null,
    bpSysGreenMax: 130,
    bpDiaGreenMax: 85,
  },
  chartYMax: {
    steps: 15000,
    activeMinutes: 60,
    sleepMinutes: 600,
    bloodPressure: 200,
  },
};

let mockHookReturn = { ...baseHookReturn };

jest.mock('@/hooks/usePatientProcess', () => ({
  usePatientProcess: () => mockHookReturn,
}));

// ─── Child components ─────────────────────────────────────────────────────────
jest.mock('@/components/Layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/PageHeader', () => ({
  __esModule: true,
  default: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div>
      <h1>{title}</h1>
      <span>{subtitle}</span>
    </div>
  ),
}));

jest.mock('@/components/Section', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/PatientProcess/RecommendationsCard', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div data-testid="recommendations-card">{title}</div>,
}));

jest.mock('@/components/PatientProcess/MetricBarCard', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div data-testid="metric-bar-card">{title}</div>,
}));

jest.mock('@/components/PatientProcess/BloodPressureCard', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div data-testid="blood-pressure-card">{title}</div>,
}));

jest.mock('@/components/skeletons/PatientProcessSkeleton', () => ({
  PatientProcessLoadingContent: () => <div data-testid="loading-skeleton" />,
}));

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

// ─── colors ───────────────────────────────────────────────────────────────────
jest.mock('@/lib/colors', () => ({
  colors: {
    ok: '#22c55e',
    chartMuted: '#a1a1aa',
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────
import PatientProcess from '@/pages/PatientProcess';

const renderPage = () => render(<PatientProcess />);

beforeEach(() => {
  mockHookReturn = { ...baseHookReturn };
  mockSetProcessFilter.mockClear();
});

describe('PatientProcess', () => {
  it('renders the page title', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Process')).toBeInTheDocument());
  });

  it('renders filter badges for week and month', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Last Week')).toBeInTheDocument();
      expect(screen.getByText('Last Month')).toBeInTheDocument();
    });
  });

  it('calls setProcessFilter when a filter badge is clicked', async () => {
    renderPage();
    await waitFor(() => screen.getByText('Last Month'));
    fireEvent.click(screen.getByText('Last Month'));
    expect(mockSetProcessFilter).toHaveBeenCalledWith('month');
  });

  it('renders all metric cards when not loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('recommendations-card')).toBeInTheDocument();
      expect(screen.getAllByTestId('metric-bar-card')).toHaveLength(3);
      expect(screen.getByTestId('blood-pressure-card')).toBeInTheDocument();
    });
  });

  it('shows the loading skeleton while loading', async () => {
    mockHookReturn = { ...baseHookReturn, loading: true };
    renderPage();
    await waitFor(() => expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument());
  });

  it('hides metric cards while loading', async () => {
    mockHookReturn = { ...baseHookReturn, loading: true };
    renderPage();
    await waitFor(() => {
      expect(screen.queryByTestId('recommendations-card')).not.toBeInTheDocument();
    });
  });

  it('shows error message when loading failed', async () => {
    mockHookReturn = { ...baseHookReturn, loading: false, error: 'Network error' };
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Failed to load health data.')).toBeInTheDocument()
    );
  });

  it('does not show metric cards when error is present', async () => {
    mockHookReturn = { ...baseHookReturn, loading: false, error: 'Network error' };
    renderPage();
    await waitFor(() => {
      expect(screen.queryByTestId('recommendations-card')).not.toBeInTheDocument();
    });
  });
});
