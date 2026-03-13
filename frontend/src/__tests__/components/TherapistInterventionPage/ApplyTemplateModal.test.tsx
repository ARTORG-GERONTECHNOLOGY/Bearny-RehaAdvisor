import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ApplyTemplateModal from '@/components/TherapistInterventionPage/ApplyTemplateModal';
import apiClient from '@/api/client';

jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

jest.mock('@/stores/authStore', () => ({ default: { id: 'therapist-1' }, id: 'therapist-1' }));

const defaultProps = {
  show: true,
  onHide: jest.fn(),
  diagnoses: ['Stroke', 'COPD'],
  onApplied: jest.fn(),
};

/**
 * Fill the patient-ID text box.
 * Form.Label "Patient ID or username" has no htmlFor/controlId association in
 * the component, so we query by role and take the first textbox.
 */
const fillPatientId = (value: string) => {
  const inputs = screen.getAllByRole('textbox');
  fireEvent.change(inputs[0], { target: { value } });
};

/** The diagnosis <select> is the first combobox in the rendered modal. */
const getDiagnosisSelect = () => screen.getAllByRole('combobox')[0];

describe('ApplyTemplateModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  describe('rendering', () => {
    it('renders the modal title', () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      expect(screen.getByText(/Apply template to patient/i)).toBeInTheDocument();
    });

    it('shows "Choose..." as default option without templateId', () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      expect(screen.getByRole('option', { name: /choose/i })).toBeInTheDocument();
    });

    it('shows "(optional)" hint on diagnosis label when templateId is provided', () => {
      render(<ApplyTemplateModal {...defaultProps} templateId="tpl-1" />);
      // The diagnosis label has a <span>(optional)</span>; "Notes (optional)" also exists
      const optionalSpans = screen.getAllByText(/\(optional\)/i);
      expect(optionalSpans.length).toBeGreaterThan(0);
    });

    it('shows "All diagnoses" default option when templateId is set', () => {
      render(<ApplyTemplateModal {...defaultProps} templateId="tpl-1" />);
      expect(screen.getByRole('option', { name: /all diagnoses/i })).toBeInTheDocument();
    });

    it('pre-selects defaultDiagnosis when provided', () => {
      render(<ApplyTemplateModal {...defaultProps} defaultDiagnosis="Stroke" />);
      const select = getDiagnosisSelect() as HTMLSelectElement;
      expect(select.value).toBe('Stroke');
    });

    it('does not render when show=false', () => {
      render(<ApplyTemplateModal {...defaultProps} show={false} />);
      expect(screen.queryByText(/Apply template to patient/i)).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // canSubmit / Apply button state
  // ------------------------------------------------------------------
  describe('canSubmit / Apply button state', () => {
    it('Apply button is disabled when patientId is empty', () => {
      render(<ApplyTemplateModal {...defaultProps} defaultDiagnosis="Stroke" />);
      expect(screen.getByRole('button', { name: /^Apply$/i })).toBeDisabled();
    });

    it('Apply button is disabled when diagnosis is missing in legacy mode', () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      fillPatientId('p-001');
      expect(screen.getByRole('button', { name: /^Apply$/i })).toBeDisabled();
    });

    it('Apply button is enabled with patientId only when templateId is provided', () => {
      render(<ApplyTemplateModal {...defaultProps} templateId="tpl-1" />);
      fillPatientId('p-001');
      expect(screen.getByRole('button', { name: /^Apply$/i })).not.toBeDisabled();
    });

    it('Apply button is enabled with patientId + diagnosis in legacy mode', () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      fillPatientId('p-001');
      fireEvent.change(getDiagnosisSelect(), { target: { value: 'Stroke' } });
      expect(screen.getByRole('button', { name: /^Apply$/i })).not.toBeDisabled();
    });
  });

  // ------------------------------------------------------------------
  // API routing
  // ------------------------------------------------------------------
  describe('API call routing', () => {
    it('posts to named template endpoint when templateId is set', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { applied: 3, sessions_created: 3 },
      });

      render(<ApplyTemplateModal {...defaultProps} templateId="tpl-42" />);
      fillPatientId('p-001');
      fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          'templates/tpl-42/apply/',
          expect.objectContaining({ patientId: 'p-001' })
        );
      });
    });

    it('posts to legacy therapist endpoint when templateId is absent', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { applied: 2, sessions_created: 2 },
      });

      render(<ApplyTemplateModal {...defaultProps} />);
      fillPatientId('p-001');
      fireEvent.change(getDiagnosisSelect(), { target: { value: 'Stroke' } });
      fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));

      await waitFor(() => {
        const url = (apiClient.post as jest.Mock).mock.calls[0][0] as string;
        expect(url).toContain('therapists/');
        expect(url).toContain('templates/apply');
      });
    });

    it('calls onApplied with response data on success', async () => {
      const result = { applied: 5, sessions_created: 5 };
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ data: result });

      render(<ApplyTemplateModal {...defaultProps} templateId="tpl-1" />);
      fillPatientId('p-001');
      fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));

      await waitFor(() => {
        expect(defaultProps.onApplied).toHaveBeenCalledWith(result);
      });
    });
  });

  // ------------------------------------------------------------------
  // Error handling
  // ------------------------------------------------------------------
  describe('error handling', () => {
    it('displays error banner on API failure', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { error: 'Patient not found' } },
      });

      render(<ApplyTemplateModal {...defaultProps} templateId="tpl-1" />);
      fillPatientId('bad-id');
      fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Patient not found')).toBeInTheDocument();
      });
    });

    it('falls back to generic error message when response has no error field', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce({});

      render(<ApplyTemplateModal {...defaultProps} templateId="tpl-1" />);
      fillPatientId('p-001');
      fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('An error occurred.')).toBeInTheDocument();
      });
    });
  });

  // ------------------------------------------------------------------
  // Close behaviour
  // ------------------------------------------------------------------
  describe('close behaviour', () => {
    it('calls onHide when Cancel is clicked and form is pristine', () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(defaultProps.onHide).toHaveBeenCalled();
    });
  });
});
