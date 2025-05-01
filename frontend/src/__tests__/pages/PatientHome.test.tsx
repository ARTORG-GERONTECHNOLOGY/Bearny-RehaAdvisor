import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PatientHome from '../../pages/PatientHome';
import authStore from '../../stores/authStore';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
// Mock translation
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock authStore
jest.mock('../../stores/authStore', () => ({
  __esModule: true,
  default: {
    isAuthenticated: false,
    userType: 'Patient',
    checkAuthentication: jest.fn(),
  },
}));

// Mock LoginForm component
jest.mock('../../components/HomePage/LoginForm', () => ({
  __esModule: true,
  default: ({ show, handleClose }: any) =>
    show ? (
      <div data-testid="login-modal">
        <button onClick={handleClose}>Close Login Modal</button>
      </div>
    ) : null,
}));

// Mock Header and Footer
jest.mock('../../components/common/Header', () => () => <div data-testid="header" />);
jest.mock('../../components/common/Footer', () => () => <div data-testid="footer" />);

describe('PatientHome Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the page content correctly', () => {
    render(
      <BrowserRouter>
        <PatientHome />
      </BrowserRouter>
    );

    expect(screen.getByText('Tele-rehabilitation')).toBeInTheDocument();
    expect(screen.getByText('Welcome to the Patient Login Page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  test('opens login modal when Login button is clicked', () => {
    render(
      <BrowserRouter>
        <PatientHome />
      </BrowserRouter>
    );

    const loginButton = screen.getByRole('button', { name: 'Login' });
    fireEvent.click(loginButton);
    expect(screen.getByTestId('login-modal')).toBeInTheDocument();
  });

  test('closes login modal when Close button is clicked', () => {
    render(
      <BrowserRouter>
        <PatientHome />
      </BrowserRouter>
    );

    const loginButton = screen.getByRole('button', { name: 'Login' });
    fireEvent.click(loginButton);

    const closeButton = screen.getByText('Close Login Modal');
    fireEvent.click(closeButton);

    expect(screen.queryByTestId('login-modal')).not.toBeInTheDocument();
  });

  test('calls checkAuthentication on mount', () => {
    render(
      <BrowserRouter>
        <PatientHome />
      </BrowserRouter>
    );

    expect(authStore.checkAuthentication).toHaveBeenCalled();
  });
});
