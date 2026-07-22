// Mock dependencies BEFORE imports
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
jest.mock('@/stores/authStore', () => ({
  checkAuthentication: jest.fn(),
  isAuthenticated: true,
  userType: 'Therapist',
  id: 'therapist123',
}));
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import AddPatientPopup from '@/components/AddPatient/AddPatientPopUp';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import apiClient from '@/api/client';
import authStore from '@/stores/authStore';

beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
  // Radix Checkbox (rendered inside the wrapped RegisterPatientForm) measures
  // its own size via ResizeObserver, which jsdom doesn't implement.
  (global as any).ResizeObserver =
    (global as any).ResizeObserver ||
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
});

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

  it('redirects to /unauthorized when authenticated with a non-Therapist userType', () => {
    (authStore as any).userType = 'Patient';
    renderComponent();
    expect(mockNavigate).toHaveBeenCalledWith('/unauthorized');
    (authStore as any).userType = 'Therapist';
  });

  it('does not redirect when the user is a Therapist', () => {
    renderComponent();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not redirect when the user is not authenticated', () => {
    (authStore as any).isAuthenticated = false;
    (authStore as any).userType = 'Patient';
    renderComponent();
    expect(mockNavigate).not.toHaveBeenCalled();
    (authStore as any).isAuthenticated = true;
    (authStore as any).userType = 'Therapist';
  });

  it('shows a loading message instead of the form when authStore.id is not yet set', () => {
    (authStore as any).id = '';
    renderComponent();
    expect(screen.getByText('Loading user information...')).toBeInTheDocument();
    expect(screen.queryByText(/Next/i)).not.toBeInTheDocument();
    (authStore as any).id = 'therapist123';
  });

  it('does not re-run the auth check when show is false', () => {
    (authStore.checkAuthentication as jest.Mock).mockClear();
    renderComponent({ show: false });
    expect(authStore.checkAuthentication).not.toHaveBeenCalled();
  });
});
