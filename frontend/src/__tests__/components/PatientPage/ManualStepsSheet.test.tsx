import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ManualStepsSheet from '@/components/PatientPage/ManualStepsSheet';
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

describe('ManualStepsSheet', () => {
  const baseProps = {
    open: true,
    dateLabel: '22.03.2026',
    onClose: jest.fn(),
    onSubmit: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title and date when open', () => {
    render(<ManualStepsSheet {...baseProps} />);
    expect(screen.getByRole('heading', { name: 'Steps' })).toBeInTheDocument();
    expect(screen.getByText('22.03.2026')).toBeInTheDocument();
  });

  it('does not submit invalid empty value', async () => {
    render(<ManualStepsSheet {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(baseProps.onSubmit).not.toHaveBeenCalled();
      expect(baseProps.onClose).not.toHaveBeenCalled();
    });
  });

  it('submits valid value and closes sheet', async () => {
    render(<ManualStepsSheet {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '6789' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(baseProps.onSubmit).toHaveBeenCalledWith(6789);
      expect(baseProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('shows error and keeps sheet open when submit fails', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('stepsSaveFailed'));
    const onClose = jest.fn();

    render(<ManualStepsSheet {...baseProps} onSubmit={onSubmit} onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('stepsSaveFailed')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when the sheet is dismissed via the close button', () => {
    render(<ManualStepsSheet {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('resets the input and error state once the sheet is closed and reopened', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('stepsSaveFailed'));
    const { rerender } = render(<ManualStepsSheet {...baseProps} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('stepsSaveFailed')).toBeInTheDocument();

    await act(async () => {
      rerender(<ManualStepsSheet {...baseProps} onSubmit={onSubmit} open={false} />);
    });
    await act(async () => {
      rerender(<ManualStepsSheet {...baseProps} onSubmit={onSubmit} open={true} />);
    });

    expect(screen.queryByText('stepsSaveFailed')).not.toBeInTheDocument();
  });
});
