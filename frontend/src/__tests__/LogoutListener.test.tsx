import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LogoutListener from '../../src/LogoutListener';
import authStore from '../../src/stores/authStore';
import '@testing-library/jest-dom';

jest.mock('../../src/api/client', () => require('../../src/__mocks__/api/client'));
// ✅ Mock useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ✅ Clear mocks before each test
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

    expect(mockNavigate).toHaveBeenCalledWith('/'); // ✅ This matches your component logic
  });
});
