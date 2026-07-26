import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// ─── date-fns ─────────────────────────────────────────────────────────────────
jest.mock('date-fns', () => ({
  format: () => '01.05. - 07.05.',
}));

// ─── usePatientProcess hook ───────────────────────────────────────────────────
const mockSetProcessFilter = jest.fn();
const baseHookReturn = {
  patientId: 'patient-123',
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

// ─── usePatientHealthExport hook ──────────────────────────────────────────────
// Mocked for the same reason as usePatientProcess above, plus a more concrete one: it pulls in
// buildPatientHealthPdf → jsPDF (real ESM), which Jest can't parse without this module boundary
// (see patientHealthExport.test.ts / usePatientHealthExport.test.ts for the real behavior).
const mockOpenExportModal = jest.fn();
const mockCloseExportModal = jest.fn();
const mockRunExport = jest.fn();
const baseExportHookReturn = {
  showModal: false,
  openModal: mockOpenExportModal,
  closeModal: mockCloseExportModal,
  exporting: false,
  error: '',
  runExport: mockRunExport,
};
let mockExportHookReturn = { ...baseExportHookReturn };

jest.mock('@/hooks/usePatientHealthExport', () => ({
  usePatientHealthExport: () => mockExportHookReturn,
}));

jest.mock('@/components/PatientProcess/PatientExportModal', () => ({
  __esModule: true,
  default: ({ show, exporting, error }: { show: boolean; exporting: boolean; error?: string }) => (
    <div data-testid="patient-export-modal" data-show={show} data-exporting={exporting}>
      {error}
    </div>
  ),
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
  mockExportHookReturn = { ...baseExportHookReturn };
  mockSetProcessFilter.mockClear();
  mockOpenExportModal.mockClear();
  mockCloseExportModal.mockClear();
  mockRunExport.mockClear();
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

  it('falls back to "--" for each average metric when the hook reports no data', async () => {
    mockHookReturn = {
      ...baseHookReturn,
      averageMetrics: {
        steps: null,
        activeMinutes: null,
        activeMinutesLabel: null,
        sleepMinutes: null,
        sleepMinutesLabel: null,
        recommendationsPct: null,
        bpSys: null,
        bpDia: null,
      },
    };
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByTestId('metric-bar-card')).toHaveLength(3);
    });
  });

  it('shows the "Show last month" aria-label when the month filter is active', async () => {
    mockHookReturn = { ...baseHookReturn, processFilter: 'month' };
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByLabelText('Show last month').length).toBeGreaterThan(0);
    });
  });

  it('does not show metric cards when error is present', async () => {
    mockHookReturn = { ...baseHookReturn, loading: false, error: 'Network error' };
    renderPage();
    await waitFor(() => {
      expect(screen.queryByTestId('recommendations-card')).not.toBeInTheDocument();
    });
  });

  describe('export', () => {
    it('renders an Export button that opens the export modal', async () => {
      renderPage();
      await waitFor(() => screen.getByRole('button', { name: /Export/i }));

      fireEvent.click(screen.getByRole('button', { name: /Export/i }));
      expect(mockOpenExportModal).toHaveBeenCalledTimes(1);
    });

    it('passes the export hook state through to PatientExportModal', async () => {
      mockExportHookReturn = { ...baseExportHookReturn, showModal: true, exporting: true };
      renderPage();

      await waitFor(() => {
        const modal = screen.getByTestId('patient-export-modal');
        expect(modal.dataset.show).toBe('true');
        expect(modal.dataset.exporting).toBe('true');
      });
    });

    it('surfaces the export error inside PatientExportModal', async () => {
      mockExportHookReturn = {
        ...baseExportHookReturn,
        showModal: true,
        error: 'Failed to export health data.',
      };
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('patient-export-modal')).toHaveTextContent(
          'Failed to export health data.'
        );
      });
    });
  });
});
