import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithRouter } from '../../../test-utils/renderWithRouter';
import DeleteConfirmation from '../DeleteConfirmation';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../common/StandardModal', () => ({
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
  it('renders and calls handleClose/handleConfirm', () => {
    const handleClose = jest.fn();
    const handleConfirm = jest.fn();

    renderWithRouter(
      <DeleteConfirmation
        show
        handleClose={handleClose}
        handleConfirm={handleConfirm}
        isLoading={false}
      />
    );

    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId('title')).toHaveTextContent('Delete Account');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handleClose).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));
    expect(handleConfirm).toHaveBeenCalled();
  });

  it('when loading, disables buttons and shows spinners/text', () => {
    renderWithRouter(
      <DeleteConfirmation show handleClose={jest.fn()} handleConfirm={jest.fn()} isLoading />
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();

    // both spinners appear (one in button + one in body)
    expect(screen.getAllByTestId('spinner').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Deleting account...')).toBeInTheDocument();
  });
});
