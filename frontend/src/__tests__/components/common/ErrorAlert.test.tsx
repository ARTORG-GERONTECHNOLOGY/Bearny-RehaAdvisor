import { render, screen, fireEvent } from '@testing-library/react';
import ErrorAlert from '@/components/common/ErrorAlert';

describe('ErrorAlert component', () => {
  const testMessage = 'Something went wrong';

  it('renders the error message', () => {
    render(<ErrorAlert message={testMessage} />);
    expect(screen.getByText(testMessage)).toBeInTheDocument();
  });

  it('calls onClose when dismissed', () => {
    const onCloseMock = jest.fn();
    render(<ErrorAlert message={testMessage} onClose={onCloseMock} />);

    const closeButton = screen.getByRole('button');
    fireEvent.click(closeButton);

    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('renders as a Bootstrap alert with "danger" variant', () => {
    const { container } = render(<ErrorAlert message={testMessage} />);
    const alertDiv = container.querySelector('.alert-danger');
    expect(alertDiv).toBeInTheDocument();
  });
});
