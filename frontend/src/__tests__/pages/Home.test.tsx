import { render, screen, fireEvent } from '@testing-library/react';
import Home from '@/pages/Home';
import '@testing-library/jest-dom';

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
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    email: '',
    password: '',
    isAuthenticated: false,
    userType: '',
    id: '',
    checkAuthentication: jest.fn(),
  },
}));

// Get reference to the mocked store
const mockAuthStore = require('@/stores/authStore').default;

// --- Mock Header/Footer/LoginForm/FormRegister so Home tests focus on Home logic
const HeaderMock = jest.fn(({ isLoggedIn }: { isLoggedIn: boolean }) => (
  <div data-testid="header">
    <div data-testid="header-isLoggedIn">{String(isLoggedIn)}</div>
  </div>
));

jest.mock('@/components/common/Header', () => ({
  __esModule: true,
  default: (props: any) => HeaderMock(props),
}));

jest.mock('@/components/common/Footer', () => ({
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

jest.mock('@/components/HomePage/LoginForm', () => ({
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

jest.mock('@/components/HomePage/RegisteringForm', () => ({
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

  it('renders header with logged out state', () => {
    render(<Home />);
    expect(screen.getByTestId('header-isLoggedIn')).toHaveTextContent('false');
  });

  it('renders header with logged in state when authenticated', () => {
    mockAuthStore.isAuthenticated = true;
    mockAuthStore.userType = 'Patient';

    render(<Home />);
    expect(screen.getByTestId('header-isLoggedIn')).toHaveTextContent('true');
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

  it('opens and closes the register modal via register button', () => {
    render(<Home />);

    // initially closed
    expect(screen.getByTestId('register-form-show')).toHaveTextContent('false');

    // open via register button
    fireEvent.click(screen.getByText(/Register \(Only for Therapists\)/));
    expect(screen.getByTestId('register-form-show')).toHaveTextContent('true');

    // close
    fireEvent.click(screen.getByRole('button', { name: 'close-register' }));
    expect(screen.getByTestId('register-form-show')).toHaveTextContent('false');
  });

  it('renders hero copy and CTA', () => {
    render(<Home />);

    // since t() returns the key, we expect those keys in the DOM
    expect(screen.getByText(/YourCompanyName/)).toBeInTheDocument();
    expect(screen.getByText(/Tele-Rehabilitation Platform/)).toBeInTheDocument();

    expect(
      screen.getByText(
        'Sign in as a Therapist or Patient. Therapists will be asked for a 2-factor code.'
      )
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  it('renders the hero image', () => {
    render(<Home />);
    const image = screen.getByAltText('YourCompanyName') as HTMLImageElement;
    expect(image).toBeInTheDocument();
    expect(image.src).toContain('/home.jpg');
  });

  it('does not show modals by default', () => {
    render(<Home />);
    expect(screen.getByTestId('login-form-show')).toHaveTextContent('false');
    expect(screen.getByTestId('register-form-show')).toHaveTextContent('false');
  });
});
