import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// D3 is ESM-only — mock before any import that uses it.
jest.mock('d3', () => ({
  groups: () => [],
  sum: () => 0,
}));
jest.mock('jspdf', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('file-saver', () => ({ saveAs: jest.fn() }));
jest.mock('@/utils/healthCharts', () => ({ isInRange: jest.fn(), svgToImageDataUrl: jest.fn() }));

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/utils/healthExport', () => ({
  buildHealthCsvBlob: jest.fn(() => new Blob(['csv'])),
  buildHealthPdf: jest.fn(() => Promise.resolve({ save: jest.fn() })),
}));

// Mock heavy sub-components so rendering is fast and deterministic.
jest.mock('@/components/Health/HealthMetricsCards', () => () => (
  <div data-testid="metrics-cards" />
));
jest.mock('@/components/Health/HealthViewControls', () => (props: any) => (
  <button data-testid="health-controls" onClick={props.onExportClick}>
    open-export
  </button>
));
jest.mock('@/components/Health/ExportModal', () => (props: any) =>
  props.show ? (
    <div data-testid="export-modal">
      <button onClick={() => props.onExportCSV(props.initialFrom, props.initialTo, props.selections)}>
        export-csv
      </button>
      <button onClick={() => props.onExportPDF(props.initialFrom, props.initialTo, props.selections)}>
        export-pdf
      </button>
    </div>
  ) : null
);

// Mock the store class — gives full control over state returned per test.
const mockStore = {
  loading: false,
  error: '',
  thresholdsError: null,
  fitbitData: [],
  questionnaireData: [],
  adherenceData: [],
  viewMode: 'monthly',
  referenceDate: new Date(),
  thresholds: null,
  get startDate() {
    return new Date();
  },
  get endDate() {
    return new Date();
  },
  fetchThresholds: jest.fn(),
  fetchCombinedHistoryForPatient: jest.fn(),
  setViewMode: jest.fn(),
  setReferenceDate: jest.fn(),
  goPrev: jest.fn(),
  goNext: jest.fn(),
};

jest.mock('@/stores/healthPageStore', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockStore),
  healthPageStore: mockStore,
}));

import HealthPageContent from '@/components/Health/HealthPageContent';

describe('HealthPageContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.loading = false;
    mockStore.error = '';
    mockStore.thresholdsError = null;
  });

  it('fetches data for the given patientId on mount', async () => {
    render(<HealthPageContent patientId="patient-abc" />);

    await waitFor(() => {
      expect(mockStore.fetchThresholds).toHaveBeenCalledWith('patient-abc', expect.any(Function));
      expect(mockStore.fetchCombinedHistoryForPatient).toHaveBeenCalledWith(
        'patient-abc',
        expect.any(String),
        expect.any(String),
        expect.any(Function)
      );
    });
  });

  it('does not fetch when patientId is empty', () => {
    render(<HealthPageContent patientId="" />);

    expect(mockStore.fetchThresholds).not.toHaveBeenCalled();
    expect(mockStore.fetchCombinedHistoryForPatient).not.toHaveBeenCalled();
  });

  it('shows loading spinner while data is loading', () => {
    mockStore.loading = true;
    render(<HealthPageContent patientId="patient-abc" />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByTestId('metrics-cards')).not.toBeInTheDocument();
  });

  it('shows charts accordion and controls when loaded', () => {
    mockStore.loading = false;
    render(<HealthPageContent patientId="patient-abc" />);

    expect(screen.getByTestId('metrics-cards')).toBeInTheDocument();
    expect(screen.getByTestId('health-controls')).toBeInTheDocument();
  });

  it('shows error alert when store reports an error', () => {
    mockStore.error = 'Failed to load health data.';
    render(<HealthPageContent patientId="patient-abc" />);

    expect(screen.getByText('Failed to load health data.')).toBeInTheDocument();
  });

  it('shows a warning alert when the store reports a thresholdsError', () => {
    mockStore.thresholdsError = 'Failed to load thresholds.';
    render(<HealthPageContent patientId="patient-abc" />);

    expect(screen.getByText('Failed to load thresholds.')).toBeInTheDocument();
  });

  it('opens the export modal via the controls callback', () => {
    render(<HealthPageContent patientId="patient-abc" />);

    fireEvent.click(screen.getByTestId('health-controls'));
    expect(screen.getByTestId('export-modal')).toBeInTheDocument();
  });

  it('exports a CSV, saves it, and closes the modal', async () => {
    const { buildHealthCsvBlob } = jest.requireMock('@/utils/healthExport');
    const { saveAs } = jest.requireMock('file-saver');

    render(<HealthPageContent patientId="patient-abc" />);
    fireEvent.click(screen.getByTestId('health-controls'));
    fireEvent.click(screen.getByText('export-csv'));

    expect(buildHealthCsvBlob).toHaveBeenCalled();
    expect(saveAs).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('export-modal')).not.toBeInTheDocument());
  });

  it('exports a PDF, saves it, and closes the modal', async () => {
    const { buildHealthPdf } = jest.requireMock('@/utils/healthExport');

    render(<HealthPageContent patientId="patient-abc" />);
    fireEvent.click(screen.getByTestId('health-controls'));
    fireEvent.click(screen.getByText('export-pdf'));

    await waitFor(() => expect(buildHealthPdf).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('export-modal')).not.toBeInTheDocument());
  });

  it('uses patientId from prop, not localStorage', async () => {
    localStorage.setItem('selectedPatient', 'wrong-patient');
    render(<HealthPageContent patientId="correct-patient" />);

    await waitFor(() => {
      expect(mockStore.fetchThresholds).toHaveBeenCalledWith(
        'correct-patient',
        expect.any(Function)
      );
    });
    localStorage.removeItem('selectedPatient');
  });
});
