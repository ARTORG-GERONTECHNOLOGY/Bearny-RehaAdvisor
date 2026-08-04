import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import LogoutListener from '@/LogoutListener';
import authStore from '@/stores/authStore';
import '@testing-library/jest-dom';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

// Mock useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router', () => {
  const actual = jest.requireActual('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Clear mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

describe('LogoutListener', () => {
  it('sets the logout callback to navigate on logout', () => {
    render(
      <MemoryRouter>
        <LogoutListener />
      </MemoryRouter>
    );

    // Simulate triggering the logout callback manually
    authStore.onLogoutCallback?.();

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
