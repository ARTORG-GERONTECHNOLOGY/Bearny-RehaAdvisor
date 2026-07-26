import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PatientExportModal from '@/components/PatientProcess/PatientExportModal';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const defaultProps = {
  show: true,
  onClose: jest.fn(),
  initialFrom: new Date('2026-01-01T00:00:00'),
  initialTo: new Date('2026-01-31T00:00:00'),
  exporting: false,
  onExport: jest.fn(),
};

describe('PatientExportModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  describe('rendering', () => {
    it('renders the sheet title and description', () => {
      render(<PatientExportModal {...defaultProps} />);
      expect(screen.getByText('Export')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Export steps, active zone minutes, sleep and blood pressure for the selected time period as a PDF.'
        )
      ).toBeInTheDocument();
    });

    it('does not render when show=false', () => {
      render(<PatientExportModal {...defaultProps} show={false} />);
      expect(screen.queryByText('Export')).not.toBeInTheDocument();
    });

    it('renders a badge for each of the four metrics', () => {
      render(<PatientExportModal {...defaultProps} />);
      expect(screen.getByText('Steps')).toBeInTheDocument();
      expect(screen.getByText('Active Minutes')).toBeInTheDocument();
      expect(screen.getByText('Sleep')).toBeInTheDocument();
      expect(screen.getByText('Blood pressure')).toBeInTheDocument();
    });

    it('does not render an error alert when no error is given', () => {
      render(<PatientExportModal {...defaultProps} />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('renders the error message when the error prop is set', () => {
      render(<PatientExportModal {...defaultProps} error="Failed to export health data." />);
      expect(screen.getByText('Failed to export health data.')).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // toggling metric selection
  // ------------------------------------------------------------------
  describe('toggling metric selection', () => {
    it('all four metrics start selected', () => {
      render(<PatientExportModal {...defaultProps} />);
      expect(screen.getByText('Steps').className).toContain('bg-pink');
      expect(screen.getByText('Blood pressure').className).toContain('bg-pink');
    });

    it('toggles a single badge off and back on', () => {
      render(<PatientExportModal {...defaultProps} />);
      const badge = screen.getByText('Sleep');

      fireEvent.click(badge);
      expect(badge.className).toContain('bg-white');

      fireEvent.click(badge);
      expect(badge.className).toContain('bg-pink');
    });

    it('disables the export button once every metric is deselected', () => {
      render(<PatientExportModal {...defaultProps} />);
      fireEvent.click(screen.getByText('Steps'));
      fireEvent.click(screen.getByText('Active Minutes'));
      fireEvent.click(screen.getByText('Sleep'));
      fireEvent.click(screen.getByText('Blood pressure'));

      expect(screen.getByRole('button', { name: /Export PDF/i })).toBeDisabled();
    });
  });

  // ------------------------------------------------------------------
  // export action
  // ------------------------------------------------------------------
  describe('export action', () => {
    it('calls onExport with the initial range and all metrics selected by default', () => {
      render(<PatientExportModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /Export PDF/i }));

      expect(defaultProps.onExport).toHaveBeenCalledWith(
        defaultProps.initialFrom,
        defaultProps.initialTo,
        { steps: true, activeMinutes: true, sleep: true, bloodPressure: true }
      );
    });

    it('calls onExport with only the metrics still selected after toggling one off', () => {
      render(<PatientExportModal {...defaultProps} />);
      fireEvent.click(screen.getByText('Sleep'));
      fireEvent.click(screen.getByRole('button', { name: /Export PDF/i }));

      expect(defaultProps.onExport).toHaveBeenCalledWith(
        defaultProps.initialFrom,
        defaultProps.initialTo,
        { steps: true, activeMinutes: true, sleep: false, bloodPressure: true }
      );
    });

    it('disables the export button and shows "Exporting..." while exporting', () => {
      render(<PatientExportModal {...defaultProps} exporting={true} />);
      const button = screen.getByRole('button', { name: /Exporting.../i });
      expect(button).toBeDisabled();
      expect(defaultProps.onExport).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // dismissal
  // ------------------------------------------------------------------
  describe('dismissal', () => {
    it('calls onClose when the sheet is dismissed via the close button', () => {
      render(<PatientExportModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close via the close button while exporting', () => {
      render(<PatientExportModal {...defaultProps} exporting={true} />);
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // reset on open
  // ------------------------------------------------------------------
  describe('reset on open', () => {
    it('re-applies the initial date range after being closed and reopened with a new range', () => {
      const { rerender } = render(<PatientExportModal {...defaultProps} />);

      const laterFrom = new Date('2026-02-01T00:00:00');
      const laterTo = new Date('2026-02-28T00:00:00');
      rerender(<PatientExportModal {...defaultProps} show={false} />);
      rerender(
        <PatientExportModal {...defaultProps} initialFrom={laterFrom} initialTo={laterTo} />
      );

      fireEvent.click(screen.getByRole('button', { name: /Export PDF/i }));
      expect(defaultProps.onExport).toHaveBeenCalledWith(laterFrom, laterTo, expect.any(Object));
    });

    it('re-selects every metric after being closed and reopened, undoing prior deselection', () => {
      const { rerender } = render(<PatientExportModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Sleep'));
      rerender(<PatientExportModal {...defaultProps} show={false} />);
      rerender(<PatientExportModal {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /Export PDF/i }));
      expect(defaultProps.onExport).toHaveBeenCalledWith(
        defaultProps.initialFrom,
        defaultProps.initialTo,
        { steps: true, activeMinutes: true, sleep: true, bloodPressure: true }
      );
    });
  });
});
