import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ApplyTemplateModal from '@/components/TherapistInterventionPage/ApplyTemplateModal';
import apiClient from '@/api/client';

jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

jest.mock('@/stores/authStore', () => ({ default: { id: 'therapist-1' }, id: 'therapist-1' }));

const PATIENT_A = {
  _id: 'p-001',
  patient_code: 'PT001',
  first_name: 'Alice',
  name: 'Smith',
  diagnosis: ['Stroke'],
};

const defaultProps = {
  show: true,
  onHide: jest.fn(),
  diagnoses: ['Stroke', 'COPD'],
  onApplied: jest.fn(),
};

/** Switch to "By diagnosis" mode and return the diagnosis <select>. */
const switchToDiagnosisMode = () => {
  fireEvent.click(screen.getByRole('button', { name: /by diagnosis/i }));
  return screen.getByRole('combobox') as HTMLSelectElement;
};

describe('ApplyTemplateModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Component fetches patients on mount; return an empty list by default.
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
  });

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  describe('rendering', () => {
    it('renders the modal title', () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      expect(screen.getByText(/Apply template to patient/i)).toBeInTheDocument();
    });

    it('shows mode-toggle buttons', () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      expect(screen.getByRole('button', { name: /select patients/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /by diagnosis/i })).toBeInTheDocument();
    });

    it('shows "Choose..." as default option in diagnosis mode', () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      switchToDiagnosisMode();
      expect(screen.getByRole('option', { name: /choose/i })).toBeInTheDocument();
    });

    it('shows diagnoses as options in diagnosis mode', () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      switchToDiagnosisMode();
      expect(screen.getByRole('option', { name: 'Stroke' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'COPD' })).toBeInTheDocument();
    });

    it('pre-selects defaultDiagnosis in diagnosis mode', () => {
      render(<ApplyTemplateModal {...defaultProps} defaultDiagnosis="Stroke" />);
      const select = switchToDiagnosisMode();
      expect(select.value).toBe('Stroke');
    });

    it('shows "(optional)" hint on Notes label', () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      const optionalSpans = screen.getAllByText(/\(optional\)/i);
      expect(optionalSpans.length).toBeGreaterThan(0);
    });

    it('does not render when show=false', () => {
      render(<ApplyTemplateModal {...defaultProps} show={false} />);
      expect(screen.queryByText(/Apply template to patient/i)).not.toBeInTheDocument();
    });

    it('shows patient list after loading with patients', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [PATIENT_A] });
      render(<ApplyTemplateModal {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByText(/Alice.*Smith/i)).toBeInTheDocument();
      });
    });

    it('shows "No data available" when patient list is empty', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      render(<ApplyTemplateModal {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByText(/No data available/i)).toBeInTheDocument();
      });
    });
  });

  // ------------------------------------------------------------------
  // canSubmit / Apply button state
  // ------------------------------------------------------------------
  describe('canSubmit / Apply button state', () => {
    it('Apply button is disabled when no patients are selected', async () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      await waitFor(() =>
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
      );
      expect(screen.getByRole('button', { name: /^Apply$/i })).toBeDisabled();
    });

    it('Apply button is disabled when diagnosis mode has no diagnosis selected', () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      switchToDiagnosisMode();
      expect(screen.getByRole('button', { name: /^Apply$/i })).toBeDisabled();
    });

    it('Apply button is enabled after selecting a patient', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [PATIENT_A] });
      render(<ApplyTemplateModal {...defaultProps} />);
      await waitFor(() => screen.getByText(/Alice.*Smith/i));
      fireEvent.click(screen.getByText(/Alice.*Smith/i).closest('div')!);
      expect(screen.getByRole('button', { name: /^Apply$/i })).not.toBeDisabled();
    });

    it('Apply button is enabled after selecting a diagnosis', () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      const select = switchToDiagnosisMode();
      fireEvent.change(select, { target: { value: 'Stroke' } });
      expect(screen.getByRole('button', { name: /^Apply$/i })).not.toBeDisabled();
    });
  });

  // ------------------------------------------------------------------
  // API routing
  // ------------------------------------------------------------------
  describe('API call routing', () => {
    it('posts to named template endpoint when templateId is set', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [PATIENT_A] });
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { applied: 1, sessions_created: 1 },
      });

      render(<ApplyTemplateModal {...defaultProps} templateId="tpl-42" />);
      await waitFor(() => screen.getByText(/Alice.*Smith/i));
      fireEvent.click(screen.getByText(/Alice.*Smith/i).closest('div')!);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
      });

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          'templates/tpl-42/apply/',
          expect.objectContaining({ patientIds: ['p-001'] })
        );
      });
    });

    it('posts to therapist endpoint when templateId is absent', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [PATIENT_A] });
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { applied: 1, sessions_created: 1 },
      });

      render(<ApplyTemplateModal {...defaultProps} />);
      await waitFor(() => screen.getByText(/Alice.*Smith/i));
      fireEvent.click(screen.getByText(/Alice.*Smith/i).closest('div')!);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
      });

      await waitFor(() => {
        const url = (apiClient.post as jest.Mock).mock.calls[0][0] as string;
        expect(url).toContain('therapists/');
        expect(url).toContain('templates/apply');
      });
    });

    it('calls onApplied with response data on success', async () => {
      const result = { applied: 5, sessions_created: 5 };
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [PATIENT_A] });
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ data: result });

      render(<ApplyTemplateModal {...defaultProps} templateId="tpl-1" />);
      await waitFor(() => screen.getByText(/Alice.*Smith/i));
      fireEvent.click(screen.getByText(/Alice.*Smith/i).closest('div')!);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
      });

      await waitFor(() => {
        expect(defaultProps.onApplied).toHaveBeenCalledWith(result);
      });
    });

    it('posts diagnosis in bulk mode', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { applied: 3, sessions_created: 3 },
      });

      render(<ApplyTemplateModal {...defaultProps} templateId="tpl-1" />);
      const select = switchToDiagnosisMode();
      fireEvent.change(select, { target: { value: 'COPD' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
      });

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          'templates/tpl-1/apply/',
          expect.objectContaining({ diagnosis: 'COPD' })
        );
      });
    });
  });

  // ------------------------------------------------------------------
  // Error handling
  // ------------------------------------------------------------------
  describe('error handling', () => {
    it('displays error banner on API failure', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [PATIENT_A] });
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { error: 'Patient not found' } },
      });

      render(<ApplyTemplateModal {...defaultProps} templateId="tpl-1" />);
      await waitFor(() => screen.getByText(/Alice.*Smith/i));
      fireEvent.click(screen.getByText(/Alice.*Smith/i).closest('div')!);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Patient not found')).toBeInTheDocument();
      });
    });

    it('falls back to generic error message when response has no error field', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [PATIENT_A] });
      (apiClient.post as jest.Mock).mockRejectedValueOnce({});

      render(<ApplyTemplateModal {...defaultProps} templateId="tpl-1" />);
      await waitFor(() => screen.getByText(/Alice.*Smith/i));
      fireEvent.click(screen.getByText(/Alice.*Smith/i).closest('div')!);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
      });

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
