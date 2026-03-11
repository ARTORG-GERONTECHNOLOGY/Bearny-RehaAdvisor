// Mock dependencies BEFORE imports
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/api/client', () => require('@/__mocks__/api/client'));
jest.mock('@/stores/authStore', () => ({
  checkAuthentication: jest.fn(),
  isAuthenticated: true,
  userType: 'Therapist',
  id: 'therapist123',
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import AddPatientPopup from '@/components/AddPatient/AddPatientPopUp';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import apiClient from '@/api/client';

describe('AddPatientPopup Component', () => {
  const handleClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock apiClient methods to return resolved promises
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        clinics: [],
        projects: [],
      },
    });
  });

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
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    fireEvent.click(closeButtons[0]); // Click the first close button (X in header)
    expect(handleClose).toHaveBeenCalled();
  });

  it('renders the registration form inside the modal', () => {
    renderComponent();
    expect(screen.getByText(/Next/i)).toBeInTheDocument();
  });
});
