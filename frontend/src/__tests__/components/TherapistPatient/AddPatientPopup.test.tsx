import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AddPatientPopup from '../../../components/AddPatient/AddPatientPopUp';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
// Mock the apiClient
jest.mock('../../../api/client', () => require('../../../__mocks__/api/client'));
// Mock the authStore
jest.mock('../../../stores/authStore', () => ({
  checkAuthentication: jest.fn(),
  isAuthenticated: true,
  userType: 'Therapist',
  id: 'therapist123',
}));

// Mock react-i18next translation
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('AddPatientPopup Component', () => {
  const handleClose = jest.fn();

  const renderComponent = (props = {}) =>
    render(
      <BrowserRouter>
        <AddPatientPopup show={true} handleClose={handleClose} {...props} />
      </BrowserRouter>
    );

  it('renders modal with title', () => {
    renderComponent();
    expect(screen.getByText('AddaNewPatient')).toBeInTheDocument();
  });

  it('calls handleClose when the close button is clicked', () => {
    renderComponent();
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);
    expect(handleClose).toHaveBeenCalled();
  });

  it('renders the registration form inside the modal', () => {
    renderComponent();
    expect(screen.getByText(/Next/i)).toBeInTheDocument();
  });
});
