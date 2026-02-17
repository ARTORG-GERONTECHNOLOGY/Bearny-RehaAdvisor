import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from '../../../test-utils/renderWithRouter';
import LoginForm from '../LoginForm';

// ---------- Mocks ----------
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Simplify Bootstrap Modal: render children only when show=true
jest.mock('react-bootstrap', () => {
  const actual = jest.requireActual('react-bootstrap');
  return {
    ...actual,
    Modal: ({ show, children }: any) => (show ? <div data-testid="modal">{children}</div> : null),
    Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    Form: ({ children, onSubmit }: any) => (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.(e);
        }}
      >
        {children}
      </form>
    ),
  };
});

// Mock the small UI components used by LoginForm (keep tests focused on logic)
jest.mock('../../forms/input/InputField', () => ({
  __esModule: true,
  default: ({ id, label, value, onChange, placeholder, required }: any) => (
    <div>
      <label htmlFor={id}>{typeof label === 'string' ? label : 'LABEL'}</label>
      <input
        id={id}
        aria-label={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
      />
    </div>
  ),
}));

jest.mock('../../forms/input/PasswordField', () => ({
  __esModule: true,
  default: ({ id, value, onChange, required }: any) => (
    <div>
      <label htmlFor={id}>Password</label>
      <input id={id} aria-label="password" value={value} onChange={onChange} required={required} />
    </div>
  ),
}));

jest.mock('../../common/ForgotPasswordLink', () => ({
  __esModule: true,
  default: ({ onClick, text }: any) => <button onClick={onClick}>{text}</button>,
}));

jest.mock('../../common/ErrorAlert', () => ({
  __esModule: true,
  default: ({ message, onClose }: any) => (
    <div role="alert">
      <span>{message}</span>
      <button onClick={onClose}>close-alert</button>
    </div>
  ),
}));

jest.mock('../../common/InfoBubble', () => ({
  __esModule: true,
  default: () => null,
}));

// Mock api client
const apiPost = jest.fn();
jest.mock('../../../api/client', () => ({
  __esModule: true,
  default: {
    post: (...args: any[]) => apiPost(...args),
    get: jest.fn(),
  },
}));

// Mock error handler (called in catch on submitCredentials)
const handleApiError = jest.fn();
jest.mock('../../../utils/errorHandler', () => ({
  __esModule: true,
  default: (...args: any[]) => handleApiError(...args),
}));

// Mock authStore singleton
const authStoreMock = {
  email: '',
  password: '',
  isAuthenticated: false,
  loginErrorMessage: '',
  loginError: '',
  userType: '' as any,
  id: 'u1',

  setEmail: jest.fn((v: string) => (authStoreMock.email = v)),
  setPassword: jest.fn((v: string) => (authStoreMock.password = v)),
  setAuthenticated: jest.fn((v: boolean) => (authStoreMock.isAuthenticated = v)),
  reset: jest.fn(() => {
    authStoreMock.email = '';
    authStoreMock.password = '';
    authStoreMock.loginErrorMessage = '';
    authStoreMock.loginError = '';
    authStoreMock.userType = '';
  }),

  loginWithHttp: jest.fn(),
  complete2FA: jest.fn(),
};
jest.mock('../../../stores/authStore', () => ({
  __esModule: true,
  default: authStoreMock,
}));

// ---------- Helpers ----------
function openModal() {
  const handleClose = jest.fn();
  renderWithRouter(<LoginForm show={true} handleClose={handleClose} />);
  return { handleClose };
}

describe('LoginForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockReset();
    apiPost.mockReset();

    authStoreMock.email = '';
    authStoreMock.password = '';
    authStoreMock.isAuthenticated = false;
    authStoreMock.loginErrorMessage = '';
    authStoreMock.loginError = '';
    authStoreMock.userType = '';
    authStoreMock.id = 'u1';
  });

  it('patient login success navigates to /patient and sets authenticated', async () => {
    authStoreMock.loginWithHttp.mockImplementation(async () => {
      authStoreMock.userType = 'Patient';
      authStoreMock.loginErrorMessage = '';
    });

    openModal();

    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'p@x.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'pw' } });

    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(authStoreMock.loginWithHttp).toHaveBeenCalled();
      expect(authStoreMock.setAuthenticated).toHaveBeenCalledWith(true);
      expect(mockNavigate).toHaveBeenCalledWith('/patient');
    });
  });

  it('admin login success navigates to /admin', async () => {
    authStoreMock.loginWithHttp.mockImplementation(async () => {
      authStoreMock.userType = 'Admin';
      authStoreMock.loginErrorMessage = '';
    });

    openModal();

    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(authStoreMock.setAuthenticated).toHaveBeenCalledWith(true);
      expect(mockNavigate).toHaveBeenCalledWith('/admin');
    });
  });

  it('therapist login triggers 2FA and sends verification code', async () => {
    authStoreMock.loginWithHttp.mockImplementation(async () => {
      authStoreMock.userType = 'Therapist';
      authStoreMock.loginErrorMessage = '';
      authStoreMock.id = 'ther1';
    });

    apiPost.mockResolvedValueOnce({ status: 200, data: {} }); // send-verification-code

    openModal();
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    // after login, 2FA view should appear
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/auth/send-verification-code/', { userId: 'ther1' });
    });

    expect(screen.getByText('Entertheverificationcodesenttoyourphone')).toBeInTheDocument();
    expect(screen.getByLabelText('verificationCode')).toBeInTheDocument();
  });

  it('therapist login shows informative error if sending verification code fails', async () => {
    authStoreMock.loginWithHttp.mockImplementation(async () => {
      authStoreMock.userType = 'Therapist';
      authStoreMock.loginErrorMessage = '';
      authStoreMock.id = 'ther1';
    });

    apiPost.mockRejectedValueOnce(new Error('SMS provider down')); // send-verification-code

    openModal();
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Login succeeded but failed to send verification code.'
      );
    });
  });

  it('shows store loginErrorMessage and does not navigate', async () => {
    authStoreMock.loginWithHttp.mockImplementation(async () => {
      authStoreMock.loginErrorMessage = 'Invalid credentials';
      authStoreMock.userType = '';
    });

    openModal();
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it('handles thrown error on login and calls handleApiError + shows fallback message', async () => {
    authStoreMock.loginWithHttp.mockRejectedValueOnce(new Error('Network error'));

    openModal();
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(handleApiError).toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    });
  });

  it('2FA success calls complete2FA and navigates to /therapist', async () => {
    // Step 1: therapist login -> 2FA required
    authStoreMock.loginWithHttp.mockImplementation(async () => {
      authStoreMock.userType = 'Therapist';
      authStoreMock.loginErrorMessage = '';
      authStoreMock.id = 'ther1';
    });

    apiPost
      .mockResolvedValueOnce({ status: 200, data: {} }) // send-verification-code
      .mockResolvedValueOnce({
        status: 200,
        data: { access_token: 'a', refresh_token: 'r' },
      }); // verify-code

    openModal();
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(screen.getByLabelText('verificationCode')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('verificationCode'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'SubmitCode' }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/auth/verify-code/', {
        userId: 'ther1',
        verificationCode: '123456',
      });
      expect(authStoreMock.complete2FA).toHaveBeenCalledWith('a', 'r');
      expect(mockNavigate).toHaveBeenCalledWith('/therapist');
    });
  });

  it('2FA failure shows informative error (try/catch path)', async () => {
    authStoreMock.loginWithHttp.mockImplementation(async () => {
      authStoreMock.userType = 'Therapist';
      authStoreMock.loginErrorMessage = '';
      authStoreMock.id = 'ther1';
    });

    apiPost
      .mockResolvedValueOnce({ status: 200, data: {} }) // send-verification-code
      .mockRejectedValueOnce({ response: { data: { detail: 'Invalid code' } } }); // verify-code

    openModal();
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(screen.getByLabelText('verificationCode')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('verificationCode'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'SubmitCode' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid code');
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
