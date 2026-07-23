import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import InterventionRepeatModal from '@/components/RehaTablePage/InterventionRepeatModal';
import apiClient from '@/api/client';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));
jest.mock('i18next', () => ({
  t: (key: string, values?: Record<string, unknown>) =>
    key.replace(/{{(\w+)}}/g, (_match, name) => String(values?.[name] ?? '')),
}));
jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { id: 'therapist-1', specialisations: ['Cardiology'] },
}));

// Radix RadioGroup (via @radix-ui/react-use-size) needs ResizeObserver, which jsdom
// doesn't implement.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Radix Select (used for the repeat "unit" dropdown) relies on pointer capture /
// scrollIntoView APIs that jsdom doesn't implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

const selectUnit = async (unitLabel: string) => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: unitLabel }));
};

const defaultProps = {
  show: true,
  onHide: jest.fn(),
  onSuccess: jest.fn(),
  patient: 'patient-1',
  intervention: 'int-1',
};

describe('InterventionRepeatModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  describe('rendering', () => {
    it('shows the "Frequency" title in create mode', () => {
      render(<InterventionRepeatModal {...defaultProps} />);
      expect(screen.getByText('Frequency')).toBeInTheDocument();
    });

    it('shows the "Modify schedule" title in modify mode', () => {
      render(<InterventionRepeatModal {...defaultProps} mode="modify" />);
      expect(screen.getByText('Modify schedule')).toBeInTheDocument();
    });

    it('does not render when show=false', () => {
      render(<InterventionRepeatModal {...defaultProps} show={false} />);
      expect(screen.queryByText('Frequency')).not.toBeInTheDocument();
    });

    it('shows Start Date in create mode and Effective from in modify mode', () => {
      const { rerender } = render(<InterventionRepeatModal {...defaultProps} />);
      expect(screen.getByText('Start Date')).toBeInTheDocument();

      rerender(<InterventionRepeatModal {...defaultProps} mode="modify" />);
      expect(screen.getByText('Effective from')).toBeInTheDocument();
    });

    it('shows the "Keep current schedule" checkbox only in modify mode', () => {
      const { rerender } = render(<InterventionRepeatModal {...defaultProps} />);
      expect(screen.queryByText(/Keep current schedule/i)).not.toBeInTheDocument();

      rerender(<InterventionRepeatModal {...defaultProps} mode="modify" />);
      expect(screen.getByText(/Keep current schedule/i)).toBeInTheDocument();
    });

    it('shows the weekday buttons only when unit is week', async () => {
      render(<InterventionRepeatModal {...defaultProps} />);
      expect(screen.queryByRole('button', { name: 'Mon' })).not.toBeInTheDocument();

      await selectUnit('Week');
      expect(screen.getByRole('button', { name: 'Mon' })).toBeInTheDocument();
    });

    it('hides the schedule fields in modify mode when keepCurrent is checked', () => {
      render(<InterventionRepeatModal {...defaultProps} mode="modify" />);
      expect(screen.getByText('Repeat every')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('checkbox', { name: /Keep current schedule/i }));
      expect(screen.queryByText('Repeat every')).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Save button state
  // ------------------------------------------------------------------
  describe('Save button state', () => {
    it('is disabled until a start date is chosen (already set by default) and enabled for day unit', () => {
      render(<InterventionRepeatModal {...defaultProps} />);
      expect(screen.getByRole('button', { name: /^Save$/i })).not.toBeDisabled();
    });

    it('is disabled when unit is week and no weekday is selected', async () => {
      render(<InterventionRepeatModal {...defaultProps} />);
      await selectUnit('Week');
      expect(screen.getByRole('button', { name: /^Save$/i })).toBeDisabled();
    });

    it('is enabled once a weekday is selected', async () => {
      render(<InterventionRepeatModal {...defaultProps} />);
      await selectUnit('Week');
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
      expect(screen.getByRole('button', { name: /^Save$/i })).not.toBeDisabled();
    });
  });

  // ------------------------------------------------------------------
  // Submission
  // ------------------------------------------------------------------
  describe('submission', () => {
    it('posts to add-to-patient for a non-diagnosis target patient', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200 });

      render(<InterventionRepeatModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          'interventions/add-to-patient/',
          expect.objectContaining({ therapistId: 'therapist-1', patientId: 'patient-1' })
        );
      });
    });

    it('posts to assign-to-patient-types when patient matches a diagnosis', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200 });

      render(<InterventionRepeatModal {...defaultProps} patient="Stroke" />);
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          'interventions/assign-to-patient-types/',
          expect.anything()
        );
      });
    });

    it('closes the modal and calls onSuccess after a successful save', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200 });

      render(<InterventionRepeatModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(defaultProps.onHide).toHaveBeenCalled();
      });
    });

    it('shows an error alert when submission fails, dismissible via its close button', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { message: 'Save failed' } },
      });

      render(<InterventionRepeatModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      const alertText = await screen.findByText('Save failed');
      expect(alertText).toBeInTheDocument();
      expect(defaultProps.onHide).not.toHaveBeenCalled();

      const alert = alertText.closest('[role="alert"]') as HTMLElement;
      fireEvent.click(within(alert).getByRole('button', { name: /close/i }));
      expect(screen.queryByText('Save failed')).not.toBeInTheDocument();
    });

    it('shows field errors when client-side validation fails on submit', async () => {
      render(<InterventionRepeatModal {...defaultProps} />);

      // Pick "On date" without ever choosing a date so validate() rejects it,
      // while canSubmit (which doesn't check endDate) stays true.
      const radios = screen.getAllByRole('radio');
      fireEvent.click(radios[1]);

      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      expect(await screen.findByText('Pick an end date.')).toBeInTheDocument();
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('calls onHide when Cancel is clicked', () => {
      render(<InterventionRepeatModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(defaultProps.onHide).toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // Field interactions
  // ------------------------------------------------------------------
  describe('field interactions', () => {
    it('updates the interval field', () => {
      render(<InterventionRepeatModal {...defaultProps} />);
      const intervalInput = screen.getByDisplayValue('1');
      fireEvent.change(intervalInput, { target: { value: '3' } });
      expect(screen.getByText(/Occurs every 3rd day/i)).toBeInTheDocument();
    });

    it('updates the personal note textarea', () => {
      render(<InterventionRepeatModal {...defaultProps} />);
      const textarea = screen.getByPlaceholderText(/Keep shoulders relaxed/i);
      fireEvent.change(textarea, { target: { value: 'Take it slow' } });
      expect(textarea).toHaveValue('Take it slow');
    });

    it('toggles the video feedback checkbox', () => {
      render(<InterventionRepeatModal {...defaultProps} />);
      const checkbox = screen.getByRole('checkbox', { name: /Ask video feedback/i });
      expect(checkbox).not.toBeChecked();
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();
    });

    it('shows the end-date picker when "On date" is selected', () => {
      render(<InterventionRepeatModal {...defaultProps} />);
      const radios = screen.getAllByRole('radio');
      fireEvent.click(radios[1]); // "On date"
      // Two date pickers now: start date + end date
      expect(document.querySelectorAll('input.border-input').length).toBeGreaterThanOrEqual(2);
    });

    it('shows the occurrence count field when "After N times" is selected and updates it', () => {
      render(<InterventionRepeatModal {...defaultProps} />);
      const radios = screen.getAllByRole('radio');
      fireEvent.click(radios[2]); // "After N times"
      const countInput = screen.getByDisplayValue('10');
      fireEvent.change(countInput, { target: { value: '5' } });
      expect(screen.getByDisplayValue('5')).toBeInTheDocument();
    });

    it('switches back to "Never" after choosing another end option', () => {
      render(<InterventionRepeatModal {...defaultProps} />);
      const radios = screen.getAllByRole('radio');
      fireEvent.click(radios[2]); // "After N times"
      expect(screen.getByDisplayValue('10')).toBeInTheDocument();

      fireEvent.click(radios[0]); // "Never"
      expect(screen.queryByDisplayValue('10')).not.toBeInTheDocument();
    });

    it('updates the start time field', () => {
      render(<InterventionRepeatModal {...defaultProps} />);
      const timeInput = document.querySelector('input[type="time"]')!;
      fireEvent.change(timeInput, { target: { value: '14:30' } });
      expect(timeInput).toHaveValue('14:30');
    });
  });
});
