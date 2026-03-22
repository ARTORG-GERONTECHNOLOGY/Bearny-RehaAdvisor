import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ManualWeightSheet from '@/components/PatientPage/ManualWeightSheet';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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
      expect(baseProps.onSubmit).toHaveBeenCalledWith(72.3);
      expect(baseProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('shows translated error when submit fails', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('failedSave'));
    render(<ManualWeightSheet {...baseProps} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '68.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('failedSave')).toBeInTheDocument();
  });
});
