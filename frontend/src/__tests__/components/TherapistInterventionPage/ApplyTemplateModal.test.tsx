import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ApplyTemplateModal from '@/components/TherapistInterventionPage/ApplyTemplateModal';
import apiClient from '@/api/client';
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

jest.mock('@/stores/authStore', () => ({ default: { id: 'therapist-1' }, id: 'therapist-1' }));

// The Checkbox (select-all / per-patient rows, overwrite, force-video) relies on
// ResizeObserver, and the diagnosis Select relies on pointer capture / scrollIntoView —
// none of which jsdom implements.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

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

/** Switch to "By diagnosis" mode and return the diagnosis Select's trigger (combobox button). */
const switchToDiagnosisMode = async () => {
  // Radix's Tabs.Trigger activates on pointer events, which fireEvent.click
  // doesn't dispatch — userEvent simulates the full pointer sequence.
  await userEvent.click(screen.getByRole('tab', { name: /by diagnosis/i }));
  return screen.getByRole('combobox');
};

/** Open the (already-mounted) diagnosis Select trigger and pick an option by label. */
const chooseDiagnosis = async (trigger: HTMLElement, label: string) => {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('option', { name: label }));
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

    it('shows mode-toggle tabs', () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      expect(screen.getByRole('tab', { name: /select patients/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /by diagnosis/i })).toBeInTheDocument();
    });

    it('shows "Choose..." as default option in diagnosis mode', async () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      // With no diagnosis selected, the Select's placeholder text is shown on the
      // trigger itself (there is no more empty/native <option> to query for).
      await switchToDiagnosisMode();
      expect(screen.getByText(/choose/i)).toBeInTheDocument();
    });

    it('shows diagnoses as options in diagnosis mode', async () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      const trigger = await switchToDiagnosisMode();
      await userEvent.click(trigger);
      expect(await screen.findByRole('option', { name: 'Stroke' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'COPD' })).toBeInTheDocument();
    });

    it('pre-selects defaultDiagnosis in diagnosis mode', async () => {
      render(<ApplyTemplateModal {...defaultProps} defaultDiagnosis="Stroke" />);
      const trigger = await switchToDiagnosisMode();
      expect(trigger).toHaveTextContent('Stroke');
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
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: /^Apply$/i })).toBeDisabled();
    });

    it('Apply button is disabled when diagnosis mode has no diagnosis selected', async () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      await switchToDiagnosisMode();
      expect(screen.getByRole('button', { name: /^Apply$/i })).toBeDisabled();
    });

    it('Apply button is enabled after selecting a patient', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [PATIENT_A] });
      render(<ApplyTemplateModal {...defaultProps} />);
      await waitFor(() => screen.getByText(/Alice.*Smith/i));
      fireEvent.click(screen.getByText(/Alice.*Smith/i).closest('label')!);
      expect(screen.getByRole('button', { name: /^Apply$/i })).not.toBeDisabled();
    });

    it('Apply button is enabled after selecting a diagnosis', async () => {
      render(<ApplyTemplateModal {...defaultProps} />);
      const trigger = await switchToDiagnosisMode();
      await chooseDiagnosis(trigger, 'Stroke');
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
      fireEvent.click(screen.getByText(/Alice.*Smith/i).closest('label')!);

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
      fireEvent.click(screen.getByText(/Alice.*Smith/i).closest('label')!);

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
      fireEvent.click(screen.getByText(/Alice.*Smith/i).closest('label')!);

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
      const trigger = await switchToDiagnosisMode();
      await chooseDiagnosis(trigger, 'COPD');

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
      fireEvent.click(screen.getByText(/Alice.*Smith/i).closest('label')!);

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
      fireEvent.click(screen.getByText(/Alice.*Smith/i).closest('label')!);

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
  // Patient search and select-all
  // ------------------------------------------------------------------
  describe('patient search and select all', () => {
    const PATIENT_B = {
      _id: 'p-002',
      patient_code: 'PT002',
      first_name: 'Bob',
      name: 'Jones',
      diagnosis: ['COPD'],
    };

    it('filters the patient list by search text', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [PATIENT_A, PATIENT_B] });
      render(<ApplyTemplateModal {...defaultProps} />);
      await waitFor(() => screen.getByText(/Alice.*Smith/i));

      fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'bob' } });

      expect(screen.getByText(/Bob.*Jones/i)).toBeInTheDocument();
      expect(screen.queryByText(/Alice.*Smith/i)).not.toBeInTheDocument();
    });

    it('selects and deselects all filtered patients via the Select All row', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [PATIENT_A, PATIENT_B] });
      render(<ApplyTemplateModal {...defaultProps} />);
      await waitFor(() => screen.getByText(/Alice.*Smith/i));

      fireEvent.click(screen.getByText('Select All'));
      expect(screen.getByText(/2 selected/i)).toBeInTheDocument();

      fireEvent.click(screen.getByText('Select All'));
      expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Field-level values
  // ------------------------------------------------------------------
  describe('effectiveFrom / overwrite / forceVideo / notes fields', () => {
    it('updates effectiveFrom, overwrite, forceVideo and notes and sends them on submit', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [PATIENT_A] });
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { applied: 1, sessions_created: 1 },
      });

      render(<ApplyTemplateModal {...defaultProps} templateId="tpl-1" />);
      await waitFor(() => screen.getByText(/Alice.*Smith/i));
      fireEvent.click(screen.getByText(/Alice.*Smith/i).closest('label')!);

      fireEvent.change(document.querySelector('input[type="date"]')!, {
        target: { value: '2026-01-01' },
      });
      fireEvent.click(screen.getByLabelText('Overwrite future sessions'));
      fireEvent.click(screen.getByLabelText('Ask video feedback for all'));
      fireEvent.change(document.querySelector('textarea')!, {
        target: { value: 'Please review' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
      });

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          'templates/tpl-1/apply/',
          expect.objectContaining({
            effectiveFrom: '2026-01-01',
            overwrite: true,
            require_video_feedback: true,
            notes: 'Please review',
          })
        );
      });
    });
  });

  // ------------------------------------------------------------------
  // Partial success and field error details
  // ------------------------------------------------------------------
  describe('partial success and field-error details', () => {
    it('shows a warning and keeps the modal open when there are partial errors', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [PATIENT_A] });
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {
          applied: 1,
          sessions_created: 1,
          partial_errors: [{ patient: 'PT002', reason: 'No active plan' }],
          warning: 'Some patients were skipped.',
        },
      });

      render(<ApplyTemplateModal {...defaultProps} templateId="tpl-1" />);
      await waitFor(() => screen.getByText(/Alice.*Smith/i));
      fireEvent.click(screen.getByText(/Alice.*Smith/i).closest('label')!);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
      });

      // non_field_errors takes precedence over `message` in applyErrors()
      expect(await screen.findByText(/PT002: No active plan/i)).toBeInTheDocument();
      expect(defaultProps.onApplied).toHaveBeenCalled();
      // Modal stays open on partial success — onHide should not be called.
      expect(defaultProps.onHide).not.toHaveBeenCalled();
    });

    it('shows humanized field errors and toggles show/hide details', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [PATIENT_A] });
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: {
          data: {
            field_errors: { patientIds: ['Required'], effectiveFrom: ['Must be in the future'] },
          },
        },
      });

      render(<ApplyTemplateModal {...defaultProps} templateId="tpl-1" />);
      await waitFor(() => screen.getByText(/Alice.*Smith/i));
      fireEvent.click(screen.getByText(/Alice.*Smith/i).closest('label')!);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
      });

      expect(await screen.findByText(/Patients:/i)).toBeInTheDocument();
      expect(screen.getByText(/Effective from:/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Hide details/i }));
      expect(screen.queryByText(/Patients:/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Show details/i }));
      expect(screen.getByText(/Patients:/i)).toBeInTheDocument();
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

    it('confirms before closing when there are unsaved changes, and respects Cancel', async () => {
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
      render(<ApplyTemplateModal {...defaultProps} />);

      const trigger = await switchToDiagnosisMode();
      await chooseDiagnosis(trigger, 'Stroke');

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(confirmSpy).toHaveBeenCalled();
      expect(defaultProps.onHide).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it('closes on Escape when confirmed', async () => {
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
      render(<ApplyTemplateModal {...defaultProps} />);

      const trigger = await switchToDiagnosisMode();
      await chooseDiagnosis(trigger, 'Stroke');

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(defaultProps.onHide).toHaveBeenCalled();

      confirmSpy.mockRestore();
    });
  });
});
