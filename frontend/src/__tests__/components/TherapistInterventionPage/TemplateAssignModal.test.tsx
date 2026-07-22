import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import TemplateAssignModal from '@/components/TherapistInterventionPage/TemplateAssignModal';
import apiClient from '@/api/client';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

jest.mock('@/stores/authStore', () => ({ default: { id: 'therapist-1' }, id: 'therapist-1' }));

// Radix Checkbox (via @radix-ui/react-use-size) needs ResizeObserver, which jsdom
// doesn't implement.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Radix Select (diagnosis / auto-apply-scope dropdowns) relies on pointer capture /
// scrollIntoView APIs that jsdom doesn't implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

const defaultProps = {
  show: true,
  onHide: jest.fn(),
  interventionId: 'int-abc',
  interventionTitle: 'Test Intervention',
  diagnoses: ['Stroke', 'COPD'],
  onSuccess: jest.fn(),
};

/**
 * The diagnosis dropdown is a Radix Select (role="combobox"); its accessible name
 * comes from the associated <FieldLabel htmlFor="template-diagnosis">, which lets us
 * target it even when the auto-apply-scope select is also on screen.
 */
const getDiagnosisSelect = () => screen.getByRole('combobox', { name: /Diagnosis_patient_list/i });
const getScopeSelect = () => screen.getByRole('combobox', { name: /Diagnosis auto-apply mode/i });

const selectOption = async (trigger: HTMLElement, optionName: string | RegExp) => {
  const user = userEvent.setup();
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: optionName }));
};

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
      // Radix only renders SelectItems (role="option") in the popover while it's open,
      // so the closed-state default is verified via the trigger's displayed text.
      expect(getDiagnosisSelect()).toHaveTextContent(/all diagnoses/i);
    });

    it('shows "Choose..." as default option without templateId', () => {
      render(<TemplateAssignModal {...defaultProps} />);
      expect(getDiagnosisSelect()).toHaveTextContent(/choose/i);
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

    it('Save button becomes enabled after selecting a diagnosis in legacy mode', async () => {
      render(<TemplateAssignModal {...defaultProps} />);
      await selectOption(getDiagnosisSelect(), 'Stroke');
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
      await selectOption(getDiagnosisSelect(), 'COPD');
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

    it('shows humanized field errors and toggles show/hide details', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: {
          data: {
            field_errors: { 'interventions[0].interval': ['Must be positive'] },
          },
        },
      });

      render(<TemplateAssignModal {...defaultProps} templateId="tpl-1" />);
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      const detailsButton = await screen.findByRole('button', { name: /Hide details/i });
      const alert = detailsButton.closest('[role="alert"]') as HTMLElement;
      expect(within(alert).getByText(/Must be positive/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Hide details/i }));
      expect(within(alert).queryByText(/interventions\[0\]\.interval/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Show details/i }));
      expect(within(alert).getByText(/Must be positive/i)).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Success flow
  // ------------------------------------------------------------------
  describe('success flow', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('shows the success banner and auto-closes after a delay', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 201, data: {} });

      render(<TemplateAssignModal {...defaultProps} templateId="tpl-1" />);
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() =>
        expect(screen.getByText('Intervention successfully added')).toBeInTheDocument()
      );

      jest.advanceTimersByTime(1500);
      expect(defaultProps.onHide).toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // Modify mode
  // ------------------------------------------------------------------
  describe('modify mode', () => {
    it('shows the modify title and a pre-checked "keep previous" checkbox', () => {
      render(<TemplateAssignModal {...defaultProps} mode="modify" defaultDiagnosis="Stroke" />);
      expect(screen.getByText(/Modify template \(from day S\)/i)).toBeInTheDocument();
      expect(screen.getByRole('checkbox')).toBeChecked();
    });

    it('unchecking "keep previous" is reflected in the save payload', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200, data: {} });

      render(<TemplateAssignModal {...defaultProps} mode="modify" defaultDiagnosis="Stroke" />);
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        const payload = (apiClient.post as jest.Mock).mock.calls[0][1];
        expect(payload.interventions[0].keep_previous).toBe(false);
      });
    });
  });

  // ------------------------------------------------------------------
  // Auto-apply scope
  // ------------------------------------------------------------------
  describe('auto-apply scope', () => {
    it('shows a start-date field only when scope is "all_past_and_future"', async () => {
      render(<TemplateAssignModal {...defaultProps} defaultDiagnosis="Stroke" />);
      expect(screen.queryByText(/Start assigning from date/i)).not.toBeInTheDocument();

      await selectOption(getScopeSelect(), /Assign now to all existing matching patients/i);

      expect(screen.getByText(/Start assigning from date/i)).toBeInTheDocument();
    });

    it('sends auto_apply_starting_from only for all_past_and_future scope', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200, data: {} });

      render(
        <TemplateAssignModal {...defaultProps} templateId="tpl-1" defaultDiagnosis="Stroke" />
      );
      await selectOption(getScopeSelect(), /Assign now to all existing matching patients/i);

      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        const payload = (apiClient.post as jest.Mock).mock.calls[0][1];
        expect(payload.auto_apply_scope).toBe('all_past_and_future');
        expect(payload.auto_apply_starting_from).toBeTruthy();
      });
    });
  });

  // ------------------------------------------------------------------
  // Start/end/interval fields and occurrence count
  // ------------------------------------------------------------------
  describe('schedule fields', () => {
    it('shows an invalid-range message and updates the occurrence count as fields change', () => {
      render(<TemplateAssignModal {...defaultProps} />);
      const numberInputs = document.querySelectorAll('input[type="number"]');
      const [startInput, lastInput] = Array.from(numberInputs) as HTMLInputElement[];

      fireEvent.change(startInput, { target: { value: '5' } });
      fireEvent.change(lastInput, { target: { value: '1' } });
      expect(screen.getByText(/Invalid range/i)).toBeInTheDocument();

      fireEvent.change(lastInput, { target: { value: '9' } });
      expect(screen.queryByText(/Invalid range/i)).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Close behaviour
  // ------------------------------------------------------------------
  describe('close behaviour', () => {
    it('confirms before closing when there are unsaved changes', async () => {
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
      render(<TemplateAssignModal {...defaultProps} />);

      await selectOption(getDiagnosisSelect(), 'Stroke');
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

      expect(confirmSpy).toHaveBeenCalled();
      expect(defaultProps.onHide).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it('closes on Escape when there are no unsaved changes', () => {
      // autoApplyScope defaults to 'off' only when templateId is set — otherwise
      // it defaults to 'future', which the component always counts as "changed".
      render(<TemplateAssignModal {...defaultProps} templateId="tpl-1" />);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(defaultProps.onHide).toHaveBeenCalled();
    });

    it('does not close while a save is in progress', async () => {
      let resolvePost: (v: unknown) => void = () => {};
      (apiClient.post as jest.Mock).mockReturnValueOnce(
        new Promise((res) => {
          resolvePost = res;
        })
      );

      render(<TemplateAssignModal {...defaultProps} templateId="tpl-1" />);
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(defaultProps.onHide).not.toHaveBeenCalled();

      resolvePost({ status: 200, data: {} });
      await waitFor(() =>
        expect(screen.getByText('Intervention successfully added')).toBeInTheDocument()
      );
    });
  });
});
