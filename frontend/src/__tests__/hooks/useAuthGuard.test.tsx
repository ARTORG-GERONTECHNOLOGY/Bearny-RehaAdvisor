import { render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import useAuthGuard from '../../hooks/useAuthGuard'; // adjust path as needed
import authStore from '../../stores/authStore';

// Mock react-router's useNavigate
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}));

// Mock authStore
jest.mock('../../stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    isAuthenticated: true,
    userType: 'Therapist',
  },
}));

const TestComponent = ({ role }: { role: string }) => {
  useAuthGuard(role);
  return <div>Protected Content</div>;
};

describe('useAuthGuard hook', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
  });

  it('calls checkAuthentication on mount', () => {
    render(
      <MemoryRouter>
        <TestComponent role="Therapist" />
      </MemoryRouter>
    );

    expect(authStore.checkAuthentication).toHaveBeenCalled();
  });

  it('does not redirect if user is authenticated and role matches', () => {
    authStore.isAuthenticated = true;
    authStore.userType = 'Therapist';

    render(
      <MemoryRouter>
        <TestComponent role="Therapist" />
      </MemoryRouter>
    );

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects if user is not authenticated', () => {
    authStore.isAuthenticated = false;

    render(
      <MemoryRouter>
        <TestComponent role="Therapist" />
      </MemoryRouter>
    );

    expect(mockNavigate).toHaveBeenCalledWith('/unauthorized');
  });

  it('redirects if user role does not match', () => {
    authStore.isAuthenticated = true;
    authStore.userType = 'Admin';

    render(
      <MemoryRouter>
        <TestComponent role="Therapist" />
      </MemoryRouter>
    );

    expect(mockNavigate).toHaveBeenCalledWith('/unauthorized');
  });
});
