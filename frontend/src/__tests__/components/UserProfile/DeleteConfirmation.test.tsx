import { render, screen, fireEvent } from '@testing-library/react';
import DeleteConfirmation from '@/components/UserProfile/DeleteConfirmation';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

jest.mock('@/components/common/StandardModal', () => ({
  __esModule: true,
  default: ({ show, title, children, footer }: any) =>
    show ? (
      <div data-testid="modal">
        <div data-testid="title">{title}</div>
        <div>{children}</div>
        <div>{footer}</div>
      </div>
    ) : null,
}));

jest.mock('react-bootstrap', () => ({
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Spinner: () => <div data-testid="spinner" />,
}));

describe('DeleteConfirmation', () => {
  it('does not render when show is false', () => {
    render(<DeleteConfirmation show={false} handleClose={jest.fn()} handleConfirm={jest.fn()} />);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders content and calls handleClose/handleConfirm', () => {
    const handleClose = jest.fn();
    const handleConfirm = jest.fn();

    render(
      <DeleteConfirmation
        show
        handleClose={handleClose}
        handleConfirm={handleConfirm}
        isLoading={false}
      />
    );

    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId('title')).toHaveTextContent('Delete Account');
    expect(
      screen.getByText(
        'Are you sure you want to delete your account? This action cannot be undone.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handleClose).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));
    expect(handleConfirm).toHaveBeenCalled();
  });

  it('when loading, disables buttons and shows spinners/text', () => {
    render(<DeleteConfirmation show handleClose={jest.fn()} handleConfirm={jest.fn()} isLoading />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
    expect(screen.getAllByTestId('spinner').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Deleting account...')).toBeInTheDocument();
  });
});
