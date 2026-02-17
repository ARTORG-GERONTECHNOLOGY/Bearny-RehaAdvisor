import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Home from '../Home';

// --- Mock i18n: return the key as-is so text is stable in tests
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// --- Mock navigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// --- Mock authStore singleton
type MockAuthStore = {
  email: string;
  password: string;
  isAuthenticated: boolean;
  userType: string;
  id: string;
  checkAuthentication: jest.Mock;
};

const mockAuthStore: MockAuthStore = {
  email: '',
  password: '',
  isAuthenticated: false,
  userType: '',
  id: '',
  checkAuthentication: jest.fn(),
};

jest.mock('../../stores/authStore', () => ({
  __esModule: true,
  default: mockAuthStore,
}));

// --- Mock Header/Footer/LoginForm/FormRegister so Home tests focus on Home logic
const HeaderMock = jest.fn(
  ({
    isLoggedIn,
    showRegisterAction,
    onRegister,
  }: {
    isLoggedIn: boolean;
    showRegisterAction: boolean;
    onRegister: () => void;
  }) => (
    <div data-testid="header">
      <div data-testid="header-isLoggedIn">{String(isLoggedIn)}</div>
      <div data-testid="header-showRegisterAction">{String(showRegisterAction)}</div>
      <button onClick={onRegister}>open-register</button>
    </div>
  )
);

jest.mock('../../components/common/Header', () => ({
  __esModule: true,
  default: (props: any) => HeaderMock(props),
}));

jest.mock('../../components/common/Footer', () => ({
  __esModule: true,
  default: () => <div data-testid="footer" />,
}));

const LoginFormMock = jest.fn(
  ({ show, handleClose }: { show: boolean; handleClose: () => void }) => (
    <div data-testid="login-form">
      <div data-testid="login-form-show">{String(show)}</div>
      <button onClick={handleClose}>close-login</button>
    </div>
  )
);

jest.mock('../../components/HomePage/LoginForm', () => ({
  __esModule: true,
  default: (props: any) => LoginFormMock(props),
}));

const RegisterFormMock = jest.fn(
  ({ show, handleRegShow }: { show: boolean; handleRegShow: () => void }) => (
    <div data-testid="register-form">
      <div data-testid="register-form-show">{String(show)}</div>
      <button onClick={handleRegShow}>close-register</button>
    </div>
  )
);

jest.mock('../../components/HomePage/RegisteringForm', () => ({
  __esModule: true,
  default: (props: any) => RegisterFormMock(props),
}));

describe('Home page', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // default auth state for most tests
    mockAuthStore.isAuthenticated = false;
    mockAuthStore.userType = '';
    mockAuthStore.checkAuthentication.mockImplementation(() => {
      // default: do nothing (logged out)
    });
  });

  it('calls authStore.checkAuthentication on mount', () => {
    render(<Home />);
    expect(mockAuthStore.checkAuthentication).toHaveBeenCalledTimes(1);
  });

  it('redirects to /{userTypeLowercase} when authenticated after checkAuthentication', () => {
    mockAuthStore.checkAuthentication.mockImplementation(() => {
      mockAuthStore.isAuthenticated = true;
      mockAuthStore.userType = 'Therapist';
    });

    render(<Home />);

    expect(mockNavigate).toHaveBeenCalledWith('/therapist');
  });

  it('renders header with register action when logged out', () => {
    render(<Home />);

    expect(screen.getByTestId('header-isLoggedIn')).toHaveTextContent('false');
    expect(screen.getByTestId('header-showRegisterAction')).toHaveTextContent('true');
  });

  it('renders header without register action when logged in', () => {
    mockAuthStore.checkAuthentication.mockImplementation(() => {
      mockAuthStore.isAuthenticated = true;
      mockAuthStore.userType = 'Patient';
    });

    render(<Home />);

    expect(screen.getByTestId('header-isLoggedIn')).toHaveTextContent('true');
    expect(screen.getByTestId('header-showRegisterAction')).toHaveTextContent('false');
  });

  it('opens and closes the login modal when clicking Login CTA and closing', () => {
    render(<Home />);

    // initially closed
    expect(screen.getByTestId('login-form-show')).toHaveTextContent('false');

    // open
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    expect(screen.getByTestId('login-form-show')).toHaveTextContent('true');

    // close
    fireEvent.click(screen.getByRole('button', { name: 'close-login' }));
    expect(screen.getByTestId('login-form-show')).toHaveTextContent('false');
  });

  it('opens and closes the register modal via Header register action', () => {
    render(<Home />);

    // initially closed
    expect(screen.getByTestId('register-form-show')).toHaveTextContent('false');

    // open via header mock button (calls onRegister)
    fireEvent.click(screen.getByRole('button', { name: 'open-register' }));
    expect(screen.getByTestId('register-form-show')).toHaveTextContent('true');

    // close (calls handleRegShow)
    fireEvent.click(screen.getByRole('button', { name: 'close-register' }));
    expect(screen.getByTestId('register-form-show')).toHaveTextContent('false');
  });

  it('renders hero copy and CTA', () => {
    render(<Home />);

    // since t() returns the key, we expect those keys in the DOM
    expect(screen.getByText('YourCompanyName')).toBeInTheDocument();
    expect(screen.getByText('Tele-Rehabilitation Platform')).toBeInTheDocument();

    expect(
      screen.getByText(
        'Sign in as a Therapist or Patient. Therapists will be asked for a 2-factor code.'
      )
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
  });
});
