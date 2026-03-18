import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TemplateAssignModal from '@/components/TherapistInterventionPage/TemplateAssignModal';
import apiClient from '@/api/client';

jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

jest.mock('@/stores/authStore', () => ({ default: { id: 'therapist-1' }, id: 'therapist-1' }));

const defaultProps = {
  show: true,
  onHide: jest.fn(),
  interventionId: 'int-abc',
  interventionTitle: 'Test Intervention',
  diagnoses: ['Stroke', 'COPD'],
  onSuccess: jest.fn(),
};

/**
 * The diagnosis <select> is the only combobox in this form.
 * Form.Group without controlId has no aria association, so we can't query by label name.
 */
const getDiagnosisSelect = () => screen.getByRole('combobox');

describe('TemplateAssignModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  describe('rendering', () => {
    it('renders the modal title', () => {
      render(<TemplateAssignModal {...defaultProps} />);
      expect(screen.getByText(/Add to template/i)).toBeInTheDocument();
    });

    it('renders a diagnosis dropdown', () => {
      render(<TemplateAssignModal {...defaultProps} />);
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('shows "(optional — leave blank for all)" hint when templateId is set', () => {
      render(<TemplateAssignModal {...defaultProps} templateId="tpl-1" />);
      expect(screen.getByText(/optional — leave blank for all/i)).toBeInTheDocument();
    });

    it('shows "All diagnoses" as default option when templateId is set', () => {
      render(<TemplateAssignModal {...defaultProps} templateId="tpl-1" />);
      expect(screen.getByRole('option', { name: /all diagnoses/i })).toBeInTheDocument();
    });

    it('shows "Choose..." as default option without templateId', () => {
      render(<TemplateAssignModal {...defaultProps} />);
      expect(screen.getByRole('option', { name: /choose/i })).toBeInTheDocument();
    });

    it('does not render when show=false', () => {
      render(<TemplateAssignModal {...defaultProps} show={false} />);
      expect(screen.queryByText(/Add to template/i)).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // canSubmit / Save button state
  // ------------------------------------------------------------------
  describe('canSubmit logic', () => {
    it('Save button is disabled when no diagnosis selected in legacy mode', () => {
      render(<TemplateAssignModal {...defaultProps} />);
      expect(screen.getByRole('button', { name: /^Save$/i })).toBeDisabled();
    });

    it('Save button is enabled without diagnosis when templateId is provided', () => {
      render(<TemplateAssignModal {...defaultProps} templateId="tpl-1" />);
      expect(screen.getByRole('button', { name: /^Save$/i })).not.toBeDisabled();
    });

    it('Save button becomes enabled after selecting a diagnosis in legacy mode', () => {
      render(<TemplateAssignModal {...defaultProps} />);
      fireEvent.change(getDiagnosisSelect(), { target: { value: 'Stroke' } });
      expect(screen.getByRole('button', { name: /^Save$/i })).not.toBeDisabled();
    });
  });

  // ------------------------------------------------------------------
  // API routing
  // ------------------------------------------------------------------
  describe('API call routing', () => {
    it('posts to named template endpoint when templateId is set', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200, data: {} });

      render(<TemplateAssignModal {...defaultProps} templateId="tpl-42" />);
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          'templates/tpl-42/interventions/',
          expect.objectContaining({ interventionId: 'int-abc' })
        );
      });
    });

    it('posts to legacy endpoint when templateId is absent', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200, data: {} });

      render(<TemplateAssignModal {...defaultProps} defaultDiagnosis="Stroke" />);
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        const url = (apiClient.post as jest.Mock).mock.calls[0][0] as string;
        expect(url).toContain('therapists/');
        expect(url).toContain('interventions/assign-to-patient-types');
      });
    });

    it('sends empty string for diagnosis when templateId set and none selected', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200, data: {} });

      render(<TemplateAssignModal {...defaultProps} templateId="tpl-1" />);
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          'templates/tpl-1/interventions/',
          expect.objectContaining({ diagnosis: '' })
        );
      });
    });

    it('sends selected diagnosis to named template endpoint', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200, data: {} });

      render(<TemplateAssignModal {...defaultProps} templateId="tpl-1" />);
      fireEvent.change(getDiagnosisSelect(), { target: { value: 'COPD' } });
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          'templates/tpl-1/interventions/',
          expect.objectContaining({ diagnosis: 'COPD' })
        );
      });
    });

    it('calls onSuccess callback after successful save', async () => {
      // The component checks `res.status === 200 || res.status === 201` before calling onSuccess
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200, data: {} });

      render(<TemplateAssignModal {...defaultProps} templateId="tpl-1" />);
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalled();
      });
    });
  });

  // ------------------------------------------------------------------
  // Error handling
  // ------------------------------------------------------------------
  describe('error handling', () => {
    it('shows error text on API failure', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { error: 'Not found' } },
      });

      render(<TemplateAssignModal {...defaultProps} templateId="tpl-1" />);
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        expect(screen.getByText('Not found')).toBeInTheDocument();
      });
    });

    it('shows fallback error message when no error field in response', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce({});

      render(<TemplateAssignModal {...defaultProps} templateId="tpl-1" />);
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      });
    });
  });
});
