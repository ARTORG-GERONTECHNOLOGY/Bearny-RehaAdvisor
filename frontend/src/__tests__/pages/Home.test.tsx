import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Home from '../../pages/Home';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock authStore for the test
jest.mock('../../stores/authStore', () => ({
  __esModule: true,
  default: {
    isAuthenticated: false,
    userType: '',
    checkAuthentication: jest.fn(),
  },
}));

const mockedAuthStore = require('../../stores/authStore').default;

// ✅ Mock React Router DOM (navigate)
const navigateMock = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => navigateMock,
}));

// ✅ Mock components
jest.mock('../../components/common/Header', () => () => <div data-testid="mock-header" />);
jest.mock('../../components/common/Footer', () => () => <div data-testid="mock-footer" />);
jest.mock(
  '../../components/HomePage/LoginForm',
  () => (props: any) => (props.show ? <div data-testid="login-modal">LoginModal</div> : null)
);
jest.mock(
  '../../components/HomePage/RegisteringForm',
  () => (props: any) => (props.show ? <div data-testid="register-modal">RegisterModal</div> : null)
);

// ✅ i18n mock
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const renderWithRouter = () =>
  render(
    <BrowserRouter>
      <Home />
    </BrowserRouter>
  );

describe('Home Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuthStore.isAuthenticated = false;
    mockedAuthStore.userType = 'Patient';
  });

  it('renders header and footer', () => {
    renderWithRouter();
    expect(screen.getByTestId('mock-header')).toBeInTheDocument();
    expect(screen.getByTestId('mock-footer')).toBeInTheDocument();
  });

  it('renders the main title and welcome text', () => {
    renderWithRouter();
    expect(screen.getByText('Tele-rehabilitation')).toBeInTheDocument();
    expect(screen.getByText('WelcometotheTherapistLoginPage')).toBeInTheDocument();
  });

  it('renders the image', () => {
    renderWithRouter();
    const image = screen.getByAltText('Tele-rehabilitation') as HTMLImageElement;
    expect(image).toBeInTheDocument();
    expect(image.src).toContain('/home.jpg');
  });

  it('shows login modal when login button is clicked', () => {
    renderWithRouter();
    fireEvent.click(screen.getByText('Login'));
    expect(screen.getByTestId('login-modal')).toBeInTheDocument();
  });

  it('shows register modal when register button is clicked', () => {
    renderWithRouter();
    fireEvent.click(screen.getByText('Register'));
    expect(screen.getByTestId('register-modal')).toBeInTheDocument();
  });

  it('does not show modals by default', () => {
    renderWithRouter();
    expect(screen.queryByTestId('login-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('register-modal')).not.toBeInTheDocument();
  });

  it('calls authStore.checkAuthentication and redirects if authenticated', () => {
    mockedAuthStore.isAuthenticated = true;
    mockedAuthStore.userType = 'Therapist';

    renderWithRouter();
    expect(mockedAuthStore.checkAuthentication).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/therapist');
  });
});
