import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DeleteConfirmation from '../../../components/UserProfile/DeleteConfirmation';
import '@testing-library/jest-dom';

// ✅ Mock the global i18next `t` function
jest.mock('i18next', () => ({
  t: (key: string) => key,
}));

describe('DeleteConfirmation Component', () => {
  const mockHandleClose = jest.fn();
  const mockHandleConfirm = jest.fn();

  const setup = (show: boolean) => {
    render(
      <DeleteConfirmation
        show={show}
        handleClose={mockHandleClose}
        handleConfirm={mockHandleConfirm}
      />
    );
  };

  test('renders correctly when show is true', () => {
    setup(true);

    const elements = screen.getAllByText('Delete Account');
    expect(elements.length).toBe(2);

    expect(
      screen.getByText(
        'Are you sure you want to delete your account? This action cannot be undone.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getAllByText('Delete Account').length).toBeGreaterThanOrEqual(1);
  });

  test('does not render when show is false', () => {
    setup(false);

    expect(screen.queryByText('Delete Account')).not.toBeInTheDocument();
  });

  test('calls handleClose when Cancel button is clicked', () => {
    setup(true);

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockHandleClose).toHaveBeenCalledTimes(1);
  });

  test('calls handleConfirm when Delete Account button is clicked', () => {
    setup(true);

    // get the button explicitly using its role and name to avoid confusion with title text
    const deleteButton = screen.getByRole('button', { name: 'Delete Account' });
    fireEvent.click(deleteButton);
    expect(mockHandleConfirm).toHaveBeenCalledTimes(1);
  });
});
