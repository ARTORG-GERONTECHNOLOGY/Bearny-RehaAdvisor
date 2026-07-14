import { render, screen, fireEvent } from '@testing-library/react';
import DeleteConfirmation from '@/components/UserProfile/DeleteConfirmationSheet';
import '@testing-library/jest-dom';
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

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

  it('calls handleClose when dismissed via the header close (X) button', () => {
    const handleClose = jest.fn();
    render(<DeleteConfirmation show handleClose={handleClose} handleConfirm={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(handleClose).toHaveBeenCalled();
  });

  it('does not call handleClose when dismissed via the close (X) button while loading', () => {
    const handleClose = jest.fn();
    render(
      <DeleteConfirmation show handleClose={handleClose} handleConfirm={jest.fn()} isLoading />
    );

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(handleClose).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Delete Account' })).toBeInTheDocument();
  });

  it('closes on Escape when not loading', () => {
    const handleClose = jest.fn();
    render(<DeleteConfirmation show handleClose={handleClose} handleConfirm={jest.fn()} />);

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(handleClose).toHaveBeenCalled();
  });

  it('ignores Escape while loading', () => {
    const handleClose = jest.fn();
    render(
      <DeleteConfirmation show handleClose={handleClose} handleConfirm={jest.fn()} isLoading />
    );

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(handleClose).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Delete Account' })).toBeInTheDocument();
  });
});
