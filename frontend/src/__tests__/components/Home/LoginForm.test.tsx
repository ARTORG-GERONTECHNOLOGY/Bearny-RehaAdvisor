import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginForm from '@/components/HomePage/LoginForm';
import authStore from '@/stores/authStore';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (str: string) => str }),
}));

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    email: '',
    password: '',
    loginErrorMessage: '',
    setEmail: jest.fn(),
    setPassword: jest.fn(),
    reset: jest.fn(),
    loginWithHttp: jest.fn(),
    setAuthenticated: jest.fn(),
    setLoginError: jest.fn(),
    userType: 'Therapist',
    id: '123',
    loginError: '',
  },
}));

import { MemoryRouter } from 'react-router-dom';

describe('LoginForm - ErrorAlert integration', () => {
  const setup = (props = {}) =>
    render(
      <MemoryRouter>
        <LoginForm show={true} handleClose={jest.fn()} {...props} />
      </MemoryRouter>
    );

  it('displays ErrorAlert when error is set', async () => {
    authStore.loginWithHttp.mockImplementation(() => {
      throw new Error('Invalid credentials');
    });

    setup();

    fireEvent.submit(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument());
  });

  it('hides ErrorAlert when dismiss button is clicked', async () => {
    authStore.loginWithHttp.mockImplementation(() => {
      throw new Error('Invalid credentials');
    });

    setup();

    fireEvent.submit(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /close alert/i }));
    expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument();
  });
});
