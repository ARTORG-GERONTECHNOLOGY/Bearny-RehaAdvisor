import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import ManualWeightSheet from '@/components/PatientPage/ManualWeightSheet';
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

describe('ManualWeightSheet', () => {
  const baseProps = {
    open: true,
    dateLabel: '22.03.2026',
    onClose: jest.fn(),
    onSubmit: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title and date', () => {
    render(<ManualWeightSheet {...baseProps} />);
    expect(screen.getByText('WeightLabel')).toBeInTheDocument();
    expect(screen.getByText('22.03.2026')).toBeInTheDocument();
  });

  it('does not submit when input is invalid', async () => {
    render(<ManualWeightSheet {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(baseProps.onSubmit).not.toHaveBeenCalled();
    });
  });

  it('submits valid weight and closes', async () => {
    render(<ManualWeightSheet {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '72.3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(baseProps.onSubmit).toHaveBeenCalledWith(
        72.3,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
      );
      expect(baseProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('renders a date picker defaulting to today and capped at today', () => {
    render(<ManualWeightSheet {...baseProps} />);
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement;
    const today = format(new Date(), 'yyyy-MM-dd');
    expect(dateInput).toBeInTheDocument();
    expect(dateInput.value).toBe(today);
    expect(dateInput.max).toBe(today);
  });

  it('sends the selected past date to onSubmit', async () => {
    render(<ManualWeightSheet {...baseProps} />);

    const dateInput = screen.getByLabelText('Date');
    fireEvent.change(dateInput, { target: { value: '2026-01-15' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '68.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(baseProps.onSubmit).toHaveBeenCalledWith(68.5, '2026-01-15');
    });
  });

  it('shows translated error when submit fails', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('failedSave'));
    render(<ManualWeightSheet {...baseProps} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '68.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('failedSave')).toBeInTheDocument();
  });

  it('calls onClose when the sheet is dismissed via the close button', () => {
    render(<ManualWeightSheet {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('resets the input and error state once the sheet is closed and reopened', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('failedSave'));
    const { rerender } = render(<ManualWeightSheet {...baseProps} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '68.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('failedSave')).toBeInTheDocument();

    await act(async () => {
      rerender(<ManualWeightSheet {...baseProps} onSubmit={onSubmit} open={false} />);
    });
    await act(async () => {
      rerender(<ManualWeightSheet {...baseProps} onSubmit={onSubmit} open={true} />);
    });

    expect(screen.queryByText('failedSave')).not.toBeInTheDocument();
  });
});
