import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import QuestionnaireScheduleModal from '@/components/RehaTablePage/QuestionnaireScheduleModal';
import apiClient from '@/api/client';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));
jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { id: 'therapist-1' },
}));

const questionnaire = { _id: 'q-1', key: 'health-q', title: 'Health Check-in' };

const defaultProps = {
  show: true,
  onHide: jest.fn(),
  onSuccess: jest.fn(),
  patientId: 'patient-1',
  questionnaire,
};

describe('QuestionnaireScheduleModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  describe('rendering', () => {
    it('shows the "Assign questionnaire" title in create mode', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      expect(screen.getByText('Assign questionnaire')).toBeInTheDocument();
    });

    it('shows the "Modify questionnaire schedule" title in modify mode', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} mode="modify" />);
      expect(screen.getByText('Modify questionnaire schedule')).toBeInTheDocument();
    });

    it('does not render when show=false', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} show={false} />);
      expect(screen.queryByText('Assign questionnaire')).not.toBeInTheDocument();
    });

    it('shows the questionnaire title', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      expect(screen.getByText('Health Check-in')).toBeInTheDocument();
    });

    it('falls back to a generic label when no questionnaire title is given', () => {
      render(
        <QuestionnaireScheduleModal {...defaultProps} questionnaire={{ _id: 'q-2', title: '' }} />
      );
      expect(screen.getByText('Questionnaire')).toBeInTheDocument();
    });

    it('shows Start Date in create mode and Effective from in modify mode', () => {
      // The DatePicker doesn't consume react-bootstrap's controlId context, so
      // the label has no associated control — assert on the label text instead.
      const { rerender } = render(<QuestionnaireScheduleModal {...defaultProps} />);
      expect(screen.getByText('Start Date')).toBeInTheDocument();

      rerender(<QuestionnaireScheduleModal {...defaultProps} mode="modify" />);
      expect(screen.getByText('Effective from')).toBeInTheDocument();
    });

    it('defaults to weekly and shows weekday buttons', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'Mon' })).toBeInTheDocument();
    });

    it('hides weekday buttons when the unit is day', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.change(screen.getByDisplayValue('Week'), { target: { value: 'day' } });
      expect(screen.queryByRole('button', { name: 'Mon' })).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Save button state
  // ------------------------------------------------------------------
  describe('Save button state', () => {
    it('is disabled by default (weekly with no day selected)', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      expect(screen.getByRole('button', { name: /^Save$/i })).toBeDisabled();
    });

    it('is enabled once a weekday is selected', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
      expect(screen.getByRole('button', { name: /^Save$/i })).not.toBeDisabled();
    });

    it('is disabled without a patientId', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} patientId="" />);
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
      expect(screen.getByRole('button', { name: /^Save$/i })).toBeDisabled();
    });

    it('is disabled without a questionnaire', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} questionnaire={null} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
      expect(screen.getByRole('button', { name: /^Save$/i })).toBeDisabled();
    });
  });

  // ------------------------------------------------------------------
  // Submission
  // ------------------------------------------------------------------
  describe('submission', () => {
    it('posts the schedule payload and shows a success footer', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200 });

      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/questionnaires/assign/',
          expect.objectContaining({
            therapistId: 'therapist-1',
            patientId: 'patient-1',
            questionnaireKey: 'health-q',
            questionnaireId: 'q-1',
          })
        );
      });

      expect(await screen.findByText('Success!')).toBeInTheDocument();
      expect(defaultProps.onSuccess).toHaveBeenCalled();
    });

    it('uses the questionnaire _id as the key fallback when no key is set', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200 });

      render(
        <QuestionnaireScheduleModal
          {...defaultProps}
          questionnaire={{ _id: 'q-3', title: 'No Key Q' }}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/questionnaires/assign/',
          expect.objectContaining({ questionnaireKey: 'q-3' })
        );
      });
    });

    it('includes effectiveFrom in modify mode', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200 });

      render(<QuestionnaireScheduleModal {...defaultProps} mode="modify" />);
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        const payload = (apiClient.post as jest.Mock).mock.calls[0][1];
        expect(payload.effectiveFrom).toBeDefined();
      });
    });

    it('shows a generic error when the response status is unexpected', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 500 });

      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      expect(await screen.findByText('Failed to save questionnaire schedule.')).toBeInTheDocument();
    });

    it('shows a parsed backend error message on failure', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { message: 'Conflict detected' } },
      });

      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      const alertText = await screen.findByText('Conflict detected');
      expect(alertText).toBeInTheDocument();

      const alert = alertText.closest('[role="alert"]') as HTMLElement;
      fireEvent.click(within(alert).getByRole('button', { name: /close/i }));
      expect(screen.queryByText('Conflict detected')).not.toBeInTheDocument();
    });

    it('shows field errors from the backend alongside the message', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: {
          data: {
            message: 'Validation failed',
            field_errors: { patientId: ['is invalid'] },
          },
        },
      });

      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      expect(await screen.findByText('is invalid')).toBeInTheDocument();
    });

    it('includes non_field_errors in the parsed message', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { non_field_errors: ['Overlaps with an existing schedule'] } },
      });

      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      expect(await screen.findByText('Overlaps with an existing schedule')).toBeInTheDocument();
    });

    it('falls back to a generic message when the backend gives no details', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();
    });

    it('does not submit twice while already submitting', async () => {
      let resolvePost: (v: any) => void;
      (apiClient.post as jest.Mock).mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePost = resolve;
        })
      );

      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
      fireEvent.click(screen.getByRole('button', { name: /Saving|^Save$/i }));
      fireEvent.click(screen.getByRole('button', { name: /Saving|^Save$/i }));

      expect(apiClient.post).toHaveBeenCalledTimes(1);
      resolvePost!({ status: 200 });
      await waitFor(() => expect(screen.getByText('Success!')).toBeInTheDocument());
    });

    it('calls onHide (via confirmClose) when Cancel is clicked', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(defaultProps.onHide).toHaveBeenCalled();
    });

    it('does not close via Cancel while a submission is in flight', async () => {
      let resolvePost: (v: unknown) => void;
      (apiClient.post as jest.Mock).mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePost = resolve;
        })
      );

      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(defaultProps.onHide).not.toHaveBeenCalled();

      resolvePost!({ status: 200 });
      await waitFor(() => expect(screen.getByText('Success!')).toBeInTheDocument());
    });

    it('does not close via Escape (StandardModal onHide) while a submission is in flight', async () => {
      let resolvePost: (v: unknown) => void;
      (apiClient.post as jest.Mock).mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePost = resolve;
        })
      );

      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27 });
      expect(defaultProps.onHide).not.toHaveBeenCalled();

      resolvePost!({ status: 200 });
      await waitFor(() => expect(screen.getByText('Success!')).toBeInTheDocument());
    });

    it('includes an end date in the payload when defaults pre-populate an "On date" end', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ status: 200 });
      render(
        <QuestionnaireScheduleModal
          {...defaultProps}
          defaults={{
            selectedDays: ['Mon'],
            end: { type: 'date', date: '2026-04-01' },
          }}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
      const payload = (apiClient.post as jest.Mock).mock.calls[0][1];
      expect(payload.schedule.end.type).toBe('date');
      expect(payload.schedule.end.date).toEqual(expect.any(String));
    });
  });

  // ------------------------------------------------------------------
  // Field interactions
  // ------------------------------------------------------------------
  describe('field interactions', () => {
    it('updates the summary text as the interval changes', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
      fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '2' } });
      expect(screen.getByText(/Occurs every 2nd week on Mon/i)).toBeInTheDocument();
    });

    it('shows the end-date picker when "On date" is selected', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('On date'));
      expect(document.querySelectorAll('input.form-control').length).toBeGreaterThanOrEqual(2);
    });

    it('shows and updates the occurrence count field for "After N times"', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('After N times'));
      const countInput = screen.getByDisplayValue('8');
      fireEvent.change(countInput, { target: { value: '4' } });
      expect(screen.getByDisplayValue('4')).toBeInTheDocument();
    });

    it('updates the start time', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      const timeInput = document.querySelector('input[type="time"]')!;
      fireEvent.change(timeInput, { target: { value: '09:15' } });
      expect(timeInput).toHaveValue('09:15');
    });

    it('shows the monthly summary text when unit is month', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.change(screen.getByDisplayValue('Week'), { target: { value: 'month' } });
      expect(screen.getByText('Occurs monthly on the same date.')).toBeInTheDocument();

      fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '2' } });
      expect(screen.getByText(/Occurs every 2nd month/i)).toBeInTheDocument();
    });

    it('switches back to "Never" after choosing another end option', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('After N times'));
      expect(screen.getByDisplayValue('8')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Never'));
      expect(screen.queryByDisplayValue('8')).not.toBeInTheDocument();
    });

    it('shows the singular daily summary text when unit is day and interval is 1', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.change(screen.getByDisplayValue('Week'), { target: { value: 'day' } });
      expect(screen.getByText('Occurs every day.')).toBeInTheDocument();
    });

    it('shows the ordinal daily summary text and falls back to the "th" suffix for interval 5', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.change(screen.getByDisplayValue('Week'), { target: { value: 'day' } });
      fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '5' } });
      expect(screen.getByText(/Occurs every 5th day\./i)).toBeInTheDocument();
    });

    it('shows the singular monthly summary text when interval is 1', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.change(screen.getByDisplayValue('Week'), { target: { value: 'month' } });
      expect(screen.getByText('Occurs monthly on the same date.')).toBeInTheDocument();
    });

    it('falls back to 1 when the interval field is cleared', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '' } });
      expect(screen.getByDisplayValue('1')).toBeInTheDocument();
    });

    it('falls back to 1 when the occurrence count field is cleared', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('After N times'));
      const countInput = screen.getByDisplayValue('8');
      fireEvent.change(countInput, { target: { value: '' } });
      expect(countInput).toHaveValue(1);
    });

    it('updates the create-mode start date by picking a day from the calendar', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} />);
      const dateInput = document.querySelectorAll('input.form-control')[0] as HTMLInputElement;
      const before = dateInput.value;
      fireEvent.click(dateInput);
      const dayCells = document.querySelectorAll(
        '.react-datepicker__day:not(.react-datepicker__day--outside-month)'
      );
      fireEvent.click(dayCells[dayCells.length - 1]);
      expect(dateInput.value).not.toBe(before);
    });

    it('updates the end date by picking a day from the calendar', () => {
      render(
        <QuestionnaireScheduleModal
          {...defaultProps}
          defaults={{ selectedDays: ['Mon'], end: { type: 'date', date: '2026-04-01' } }}
        />
      );
      const dateInputs = document.querySelectorAll('input.form-control');
      const endDateInput = dateInputs[dateInputs.length - 1] as HTMLInputElement;
      const before = endDateInput.value;
      fireEvent.click(endDateInput);
      const dayCells = document.querySelectorAll(
        '.react-datepicker__day:not(.react-datepicker__day--outside-month):not(.react-datepicker__day--selected)'
      );
      fireEvent.click(dayCells[0]);
      expect(endDateInput.value).not.toBe(before);
    });

    it('pre-fills the effective-from date from defaults in modify mode', () => {
      render(
        <QuestionnaireScheduleModal
          {...defaultProps}
          mode="modify"
          defaults={{ effectiveFrom: '2026-05-01' }}
        />
      );
      const dateInput = document.querySelectorAll('input.form-control')[0] as HTMLInputElement;
      expect(dateInput.value).toBe('2026-05-01');
    });

    it('updates the effective-from date in modify mode by picking a day from the calendar', () => {
      render(<QuestionnaireScheduleModal {...defaultProps} mode="modify" />);
      const dateInput = document.querySelectorAll('input.form-control')[0] as HTMLInputElement;
      const before = dateInput.value;
      fireEvent.click(dateInput);
      const dayCells = document.querySelectorAll(
        '.react-datepicker__day:not(.react-datepicker__day--outside-month):not(.react-datepicker__day--selected)'
      );
      fireEvent.click(dayCells[0]);
      expect(dateInput.value).not.toBe(before);
    });
  });
});
