import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import LoginForm from '@/components/HomePage/LoginForm';

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
    Modal: Object.assign(
      ({ show, children }: any) => (show ? <div data-testid="modal">{children}</div> : null),
      {
        Header: ({ children }: any) => <div>{children}</div>,
        Title: ({ children }: any) => <h5>{children}</h5>,
        Body: ({ children }: any) => <div>{children}</div>,
      }
    ),
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
jest.mock('@/components/forms/input/InputField', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ id, label, value, onChange, placeholder, required, type }: any) => {
      const [internalValue, setInternalValue] = React.useState(value || '');
      return (
        <div>
          <label htmlFor={id}>{typeof label === 'string' ? label : 'LABEL'}</label>
          <input
            id={id}
            type={type}
            aria-label={id}
            value={internalValue}
            onChange={(e) => {
              setInternalValue(e.target.value);
              onChange?.(e);
            }}
            placeholder={placeholder}
            required={required}
          />
        </div>
      );
    },
  };
});

jest.mock('@/components/forms/input/PasswordField', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ id, value, onChange, required }: any) => {
      const [internalValue, setInternalValue] = React.useState(value || '');
      return (
        <div>
          <label htmlFor={id}>Password</label>
          <input
            id={id}
            type="password"
            aria-label="password"
            value={internalValue}
            onChange={(e) => {
              setInternalValue(e.target.value);
              onChange?.(e);
            }}
            required={required}
          />
        </div>
      );
    },
  };
});

jest.mock('@/components/common/ForgotPasswordLink', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ onClick, text }: any) => <button onClick={onClick}>{text}</button>,
  };
});

jest.mock('@/components/common/ErrorAlert', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ message, onClose }: any) => (
      <div role="alert">
        <span>{message}</span>
        <button onClick={onClose}>close-alert</button>
      </div>
    ),
  };
});

jest.mock('@/components/common/InfoBubble', () => {
  return {
    __esModule: true,
    default: () => null,
  };
});

// Mock api client
const apiPost = jest.fn();
jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    post: (...args: any[]) => apiPost(...args),
    get: jest.fn(),
  },
}));

// Mock error handler (called in catch on submitCredentials)
const handleApiError = jest.fn();
jest.mock('@/utils/errorHandler', () => ({
  __esModule: true,
  default: (...args: any[]) => handleApiError(...args),
}));

// Mock authStore singleton (must be defined before jest.mock due to hoisting)
const mockAuthStore = {
  email: '',
  password: '',
  isAuthenticated: false,
  loginErrorMessage: '',
  loginError: '',
  userType: '' as any,
  id: 'u1',

  setEmail: jest.fn((v: string) => {
    mockAuthStore.email = v;
  }),
  setPassword: jest.fn((v: string) => {
    mockAuthStore.password = v;
  }),
  setAuthenticated: jest.fn((v: boolean) => {
    mockAuthStore.isAuthenticated = v;
  }),
  reset: jest.fn(() => {
    mockAuthStore.email = '';
    mockAuthStore.password = '';
    mockAuthStore.loginErrorMessage = '';
    mockAuthStore.loginError = '';
    mockAuthStore.userType = '';
  }),

  loginWithHttp: jest.fn(),
  complete2FA: jest.fn(),
};

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  get default() {
    return mockAuthStore;
  },
}));

// Get the mocked authStore for test setup
const authStore = mockAuthStore;

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

    authStore.email = '';
    authStore.password = '';
    authStore.isAuthenticated = false;
    authStore.loginErrorMessage = '';
    authStore.loginError = '';
    authStore.userType = '';
    authStore.id = 'u1';
  });

  it('patient login success navigates to /patient and sets authenticated', async () => {
    authStore.loginWithHttp.mockImplementation(async () => {
      authStore.userType = 'Patient';
      authStore.loginErrorMessage = '';
    });

    openModal();

    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'p@x.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'pw' } });

    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(authStore.loginWithHttp).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/patient');
    });
  });

  it('admin login success navigates to /admin', async () => {
    authStore.loginWithHttp.mockImplementation(async () => {
      authStore.userType = 'Admin';
      authStore.loginErrorMessage = '';
      authStore.id = 'admin1';
    });

    apiPost.mockResolvedValueOnce({ status: 200, data: {} }); // send-verification-code

    openModal();

    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'admin@x.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'pw' } });

    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    // Admin requires 2FA, so should trigger verification code
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/auth/send-verification-code/', { userId: 'admin1' });
    });

    // 2FA view should appear
    expect(screen.getByText('Entertheverificationcodesenttoyourphone')).toBeInTheDocument();
    expect(screen.getByLabelText('verificationCode')).toBeInTheDocument();

    // Complete 2FA
    apiPost.mockResolvedValueOnce({
      status: 200,
      data: { access_token: 'a', refresh_token: 'r' },
    }); // verify-code

    fireEvent.change(screen.getByLabelText('verificationCode'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'SubmitCode' }));

    await waitFor(() => {
      expect(authStore.complete2FA).toHaveBeenCalledWith('a', 'r');
      expect(mockNavigate).toHaveBeenCalledWith('/admin');
    });
  });

  it('therapist login triggers 2FA and sends verification code', async () => {
    authStore.loginWithHttp.mockImplementation(async () => {
      authStore.userType = 'Therapist';
      authStore.loginErrorMessage = '';
      authStore.id = 'ther1';
    });

    apiPost.mockResolvedValueOnce({ status: 200, data: {} }); // send-verification-code

    openModal();
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 't@x.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    // after login, 2FA view should appear
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/auth/send-verification-code/', { userId: 'ther1' });
    });

    expect(screen.getByText('Entertheverificationcodesenttoyourphone')).toBeInTheDocument();
    expect(screen.getByLabelText('verificationCode')).toBeInTheDocument();
  });

  it('therapist login shows informative error if sending verification code fails', async () => {
    authStore.loginWithHttp.mockImplementation(async () => {
      authStore.userType = 'Therapist';
      authStore.loginErrorMessage = '';
      authStore.id = 'ther1';
    });

    apiPost.mockRejectedValueOnce(new Error('SMS provider down')); // send-verification-code

    openModal();
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 't@x.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Login succeeded but failed to send verification code.'
      );
    });
  });

  it('shows store loginErrorMessage and does not navigate', async () => {
    authStore.loginWithHttp.mockImplementation(async () => {
      authStore.loginErrorMessage = 'Invalid credentials';
      authStore.userType = '';
    });

    openModal();
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'bad@x.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it('handles thrown error on login and calls handleApiError + shows fallback message', async () => {
    authStore.loginWithHttp.mockRejectedValueOnce(new Error('Network error'));

    openModal();
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'err@x.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(handleApiError).toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    });
  });

  it('2FA success calls complete2FA and navigates to /therapist', async () => {
    // Step 1: therapist login -> 2FA required
    authStore.loginWithHttp.mockImplementation(async () => {
      authStore.userType = 'Therapist';
      authStore.loginErrorMessage = '';
      authStore.id = 'ther1';
    });

    apiPost
      .mockResolvedValueOnce({ status: 200, data: {} }) // send-verification-code
      .mockResolvedValueOnce({
        status: 200,
        data: { access_token: 'a', refresh_token: 'r' },
      }); // verify-code

    openModal();
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 't@x.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(screen.getByLabelText('verificationCode')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('verificationCode'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'SubmitCode' }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/auth/verify-code/', {
        userId: 'ther1',
        verificationCode: '123456',
      });
      expect(authStore.complete2FA).toHaveBeenCalledWith('a', 'r');
      expect(mockNavigate).toHaveBeenCalledWith('/therapist');
    });
  });

  it('2FA failure shows error from data.error key (primary backend path)', async () => {
    authStore.loginWithHttp.mockImplementation(async () => {
      authStore.userType = 'Therapist';
      authStore.loginErrorMessage = '';
      authStore.id = 'ther1';
    });

    apiPost
      .mockResolvedValueOnce({ status: 200, data: {} }) // send-verification-code
      .mockRejectedValueOnce({ response: { data: { error: 'Invalid verification code' } } }); // verify-code

    openModal();
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 't@x.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(screen.getByLabelText('verificationCode')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('verificationCode'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'SubmitCode' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid verification code');
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it('2FA failure still shows error from data.detail key (legacy path)', async () => {
    authStore.loginWithHttp.mockImplementation(async () => {
      authStore.userType = 'Therapist';
      authStore.loginErrorMessage = '';
      authStore.id = 'ther1';
    });

    apiPost
      .mockResolvedValueOnce({ status: 200, data: {} }) // send-verification-code
      .mockRejectedValueOnce({ response: { data: { detail: 'Some detail error' } } }); // verify-code

    openModal();
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 't@x.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(screen.getByLabelText('verificationCode')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('verificationCode'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'SubmitCode' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Some detail error');
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it('2FA shows "Verification code expired" from backend', async () => {
    authStore.loginWithHttp.mockImplementation(async () => {
      authStore.userType = 'Therapist';
      authStore.loginErrorMessage = '';
      authStore.id = 'ther1';
    });

    apiPost
      .mockResolvedValueOnce({ status: 200, data: {} })
      .mockRejectedValueOnce({ response: { data: { error: 'Verification code expired' } } });

    openModal();
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 't@x.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(screen.getByLabelText('verificationCode')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('verificationCode'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'SubmitCode' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Verification code expired');
    });
  });

  it('2FA shows "Missing user ID or verification code" from backend', async () => {
    authStore.loginWithHttp.mockImplementation(async () => {
      authStore.userType = 'Therapist';
      authStore.loginErrorMessage = '';
      authStore.id = 'ther1';
    });

    apiPost.mockResolvedValueOnce({ status: 200, data: {} }).mockRejectedValueOnce({
      response: { data: { error: 'Missing user ID or verification code' } },
    });

    openModal();
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 't@x.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(screen.getByLabelText('verificationCode')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('verificationCode'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'SubmitCode' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Missing user ID or verification code');
    });
  });

  it('2FA shows fallback message when no backend error message is present', async () => {
    authStore.loginWithHttp.mockImplementation(async () => {
      authStore.userType = 'Therapist';
      authStore.loginErrorMessage = '';
      authStore.id = 'ther1';
    });

    apiPost
      .mockResolvedValueOnce({ status: 200, data: {} })
      .mockRejectedValueOnce({ response: { data: {} } }); // no error/detail key

    openModal();
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 't@x.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(screen.getByLabelText('verificationCode')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('verificationCode'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'SubmitCode' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Verification failed. Please try again.');
    });
  });
});
