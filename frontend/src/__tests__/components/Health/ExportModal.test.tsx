import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExportModal from '@/components/Health/ExportModal';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const defaultProps = {
  show: true,
  onClose: jest.fn(),
  initialFrom: new Date('2026-01-01T00:00:00Z'),
  initialTo: new Date('2026-01-31T00:00:00Z'),
  selections: { adherence: true, wearTime: false, steps: true },
  onExportCSV: jest.fn(),
  onExportPDF: jest.fn(),
};

describe('ExportModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  describe('rendering', () => {
    it('renders the modal title', () => {
      render(<ExportModal {...defaultProps} />);
      expect(screen.getByText('Export')).toBeInTheDocument();
    });

    it('does not render when show=false', () => {
      render(<ExportModal {...defaultProps} show={false} />);
      expect(screen.queryByText('Export')).not.toBeInTheDocument();
    });

    it('renders a badge for every plot id', () => {
      render(<ExportModal {...defaultProps} />);
      expect(screen.getByText('adherence')).toBeInTheDocument();
      expect(screen.getByText('sleep')).toBeInTheDocument();
      expect(screen.getByText('breathing')).toBeInTheDocument();
    });

    it('renders the Select All control', () => {
      render(<ExportModal {...defaultProps} />);
      expect(screen.getByText('Select All')).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // toggling selections
  // ------------------------------------------------------------------
  describe('toggling plot selection', () => {
    it('toggles a single badge on click', () => {
      render(<ExportModal {...defaultProps} />);
      const badge = screen.getByText('wearTime');
      expect(badge.className).toContain('bg-light');

      fireEvent.click(badge);
      expect(badge.className).toContain('bg-primary');

      fireEvent.click(badge);
      expect(badge.className).toContain('bg-light');
    });

    it('selects all plots when none are fully selected and Select All is clicked', () => {
      render(<ExportModal {...defaultProps} selections={{ adherence: false, wearTime: false }} />);
      fireEvent.click(screen.getByText('Select All'));
      expect(screen.getByText('adherence').className).toContain('bg-primary');
      expect(screen.getByText('wearTime').className).toContain('bg-primary');
    });

    it('deselects all plots when all are already selected and Select All is clicked', () => {
      const allSelected = {
        adherence: true,
        wearTime: true,
        questionnaire: true,
        totalScore: true,
        restingHR: true,
        bloodPressure: true,
        hrZones: true,
        steps: true,
        activeMinutes: true,
        weight: true,
        exercise: true,
        sleep: true,
        breathing: true,
      };
      render(<ExportModal {...defaultProps} selections={allSelected} />);
      fireEvent.click(screen.getByText('Select All'));
      expect(screen.getByText('adherence').className).toContain('bg-light');
    });
  });

  // ------------------------------------------------------------------
  // reset on open
  // ------------------------------------------------------------------
  describe('reset on open', () => {
    it('re-applies the initial selections after being closed and reopened', () => {
      const { rerender } = render(<ExportModal {...defaultProps} />);

      fireEvent.click(screen.getByText('adherence'));
      expect(screen.getByText('adherence').className).toContain('bg-light');

      rerender(<ExportModal {...defaultProps} show={false} />);
      rerender(<ExportModal {...defaultProps} show={true} />);

      expect(screen.getByText('adherence').className).toContain('bg-primary');
    });
  });

  // ------------------------------------------------------------------
  // export actions
  // ------------------------------------------------------------------
  describe('export actions', () => {
    it('disables export buttons when dates are missing', () => {
      render(<ExportModal {...defaultProps} initialFrom={null} initialTo={null} />);
      expect(screen.getByRole('button', { name: /Export CSV/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Export PDF/i })).toBeDisabled();
    });

    it('calls onExportCSV with the selected range and selections', () => {
      render(<ExportModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));
      expect(defaultProps.onExportCSV).toHaveBeenCalledWith(
        defaultProps.initialFrom,
        defaultProps.initialTo,
        defaultProps.selections
      );
    });

    it('calls onExportPDF with the selected range and selections', () => {
      render(<ExportModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /Export PDF/i }));
      expect(defaultProps.onExportPDF).toHaveBeenCalledWith(
        defaultProps.initialFrom,
        defaultProps.initialTo,
        defaultProps.selections
      );
    });

    it('calls onClose when Cancel is clicked', () => {
      render(<ExportModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });
});
