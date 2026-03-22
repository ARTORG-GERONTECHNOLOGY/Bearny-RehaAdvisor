import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ManualBloodPressureSheet from '@/components/PatientPage/ManualBloodPressureSheet';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ManualBloodPressureSheet', () => {
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
    render(<ManualBloodPressureSheet {...baseProps} />);
    expect(screen.getByText('Blood pressure')).toBeInTheDocument();
    expect(screen.getByText('22.03.2026')).toBeInTheDocument();
  });

  it('does not submit when fields are invalid', async () => {
    render(<ManualBloodPressureSheet {...baseProps} />);
    fireEvent.change(screen.getByPlaceholderText('120'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByPlaceholderText('80'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(baseProps.onSubmit).not.toHaveBeenCalled();
    });
  });

  it('submits valid blood pressure values and closes', async () => {
    render(<ManualBloodPressureSheet {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText('120'), { target: { value: '123' } });
    fireEvent.change(screen.getByPlaceholderText('80'), { target: { value: '81' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(baseProps.onSubmit).toHaveBeenCalledWith(123, 81);
      expect(baseProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('shows error and does not close when submit fails', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('failedSave'));
    const onClose = jest.fn();
    render(<ManualBloodPressureSheet {...baseProps} onSubmit={onSubmit} onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('120'), { target: { value: '126' } });
    fireEvent.change(screen.getByPlaceholderText('80'), { target: { value: '84' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('failedSave')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
