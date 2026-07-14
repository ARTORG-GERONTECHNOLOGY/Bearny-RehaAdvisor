import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RescheduleInterventionSheet from '@/components/PatientPage/RescheduleInterventionSheet';
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

describe('RescheduleInterventionSheet', () => {
  const currentDate = new Date('2026-03-16T18:00:00+00:00');

  const baseProps = {
    open: true,
    currentDate,
    titleLabel: 'Morning Stretch',
    onClose: jest.fn(),
    onSubmit: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title and the intervention label', () => {
    render(<RescheduleInterventionSheet {...baseProps} />);
    expect(screen.getByText('Reschedule')).toBeInTheDocument();
    expect(screen.getByText('Morning Stretch')).toBeInTheDocument();
  });

  it('only shows a date picker, no time input', () => {
    render(<RescheduleInterventionSheet {...baseProps} />);
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
    expect(screen.queryByLabelText('Time')).not.toBeInTheDocument();
  });

  it('defaults the date picker to the current occurrence date, capped at today', () => {
    render(<RescheduleInterventionSheet {...baseProps} />);
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement;
    const today = new Date().toISOString().slice(0, 10);
    expect(dateInput.value).toBe('2026-03-16');
    expect(dateInput.min).toBe(today);
  });

  it('submits a new date while preserving the original time of day', async () => {
    render(<RescheduleInterventionSheet {...baseProps} />);

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-03-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(baseProps.onSubmit).toHaveBeenCalledTimes(1);
    });

    const submittedDate: Date = baseProps.onSubmit.mock.calls[0][0];
    expect(submittedDate.getUTCFullYear()).toBe(2026);
    expect(submittedDate.getUTCMonth()).toBe(2); // March
    expect(submittedDate.getUTCDate()).toBe(20);
    // Time of day carried over unchanged from currentDate (18:00 UTC).
    expect(submittedDate.getUTCHours()).toBe(currentDate.getUTCHours());
    expect(submittedDate.getUTCMinutes()).toBe(currentDate.getUTCMinutes());

    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('does not submit when currentDate is missing', () => {
    render(<RescheduleInterventionSheet {...baseProps} currentDate={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(baseProps.onSubmit).not.toHaveBeenCalled();
  });

  it('shows the backend error message when the reschedule fails', async () => {
    const onSubmit = jest.fn().mockRejectedValue({
      response: { data: { message: 'A session already exists on that day.' } },
    });
    render(<RescheduleInterventionSheet {...baseProps} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('A session already exists on that day.')).toBeInTheDocument();
    expect(baseProps.onClose).not.toHaveBeenCalled();
  });

  it('falls back to a generic translated error when there is no backend message', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('boom'));
    render(<RescheduleInterventionSheet {...baseProps} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('boom')).toBeInTheDocument();
  });

  it('resets the error state once the sheet is closed and reopened', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('boom'));
    const { rerender } = render(<RescheduleInterventionSheet {...baseProps} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('boom')).toBeInTheDocument();

    await act(async () => {
      rerender(<RescheduleInterventionSheet {...baseProps} onSubmit={onSubmit} open={false} />);
    });
    await act(async () => {
      rerender(<RescheduleInterventionSheet {...baseProps} onSubmit={onSubmit} open={true} />);
    });

    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('calls onClose when the sheet is dismissed via the close button', () => {
    render(<RescheduleInterventionSheet {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });
});
