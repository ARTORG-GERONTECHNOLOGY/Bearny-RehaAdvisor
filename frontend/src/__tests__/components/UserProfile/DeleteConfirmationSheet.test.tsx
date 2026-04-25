import { render, screen, fireEvent } from '@testing-library/react';
import DeleteConfirmation from '@/components/UserProfile/DeleteConfirmationSheet';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

describe('DeleteConfirmation', () => {
  it('does not render when show is false', () => {
    render(<DeleteConfirmation show={false} handleClose={jest.fn()} handleConfirm={jest.fn()} />);
    expect(screen.queryByText('Delete Account')).not.toBeInTheDocument();
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

    expect(screen.getByRole('heading', { name: 'Delete Account' })).toBeInTheDocument();
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

  it('when loading, disables action buttons and shows loading label', () => {
    render(<DeleteConfirmation show handleClose={jest.fn()} handleConfirm={jest.fn()} isLoading />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
  });
});
