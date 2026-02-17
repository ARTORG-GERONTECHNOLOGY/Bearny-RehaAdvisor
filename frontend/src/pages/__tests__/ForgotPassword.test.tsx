import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from '../../test-utils/renderWithRouter';
import ForgotPassword from '../ForgotPassword';

// i18n
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Header/Footer
jest.mock('../../components/common/Header', () => ({
  __esModule: true,
  default: ({ isLoggedIn }: any) => <div data-testid="header">logged:{String(isLoggedIn)}</div>,
}));

jest.mock('../../components/common/Footer', () => ({
  __esModule: true,
  default: () => <div data-testid="footer" />,
}));

// ErrorAlert
jest.mock('../../components/common/ErrorAlert', () => ({
  __esModule: true,
  default: ({ message, onClose }: any) => (
    <div role="alert">
      <span>{message}</span>
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

// AuthCard
jest.mock('../../components/Auth/AuthCard', () => ({
  __esModule: true,
  default: ({ title, children }: any) => (
    <div data-testid="auth-card">
      <div data-testid="auth-card-title">{title}</div>
      {children}
    </div>
  ),
}));

// Bootstrap mocks
jest.mock('react-bootstrap', () => ({
  Container: ({ children }: any) => <div data-testid="container">{children}</div>,
  Row: ({ children }: any) => <div data-testid="row">{children}</div>,
  Col: ({ children }: any) => <div data-testid="col">{children}</div>,
  Alert: ({ children }: any) => <div role="alert">{children}</div>,
  Spinner: ({ role }: any) => <div role={role || 'status'}>spinner</div>,
  Button: ({ children, disabled, onClick, type }: any) => (
    <button disabled={disabled} onClick={onClick} type={type || 'button'}>
      {children}
    </button>
  ),
  Form: Object.assign(
    ({ children, onSubmit }: any) => <form onSubmit={onSubmit}>{children}</form>,
    {
      Group: ({ children }: any) => <div>{children}</div>,
      Label: ({ children }: any) => <label>{children}</label>,
      Control: ({ value, onChange, placeholder, disabled, type }: any) => (
        <input
          type={type || 'text'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="email"
        />
      ),
    }
  ),
}));

/**
 * We mock ForgotPasswordStore so we can drive page states reliably (success/error/loading)
 * and also assert submit(t) was called on form submit.
 */
const storeMock = {
  email: '',
  error: null as string | null,
  success: false,
  loading: false,
  setEmail: jest.fn((v: string) => {
    storeMock.email = v;
  }),
  submit: jest.fn(async () => {}),
};

jest.mock('../../stores/forgotPasswordStore', () => ({
  __esModule: true,
  ForgotPasswordStore: function MockCtor() {
    return storeMock;
  },
}));

describe('ForgotPassword page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storeMock.email = '';
    storeMock.error = null;
    storeMock.success = false;
    storeMock.loading = false;
  });

  it('renders header/footer and title inside AuthCard', () => {
    renderWithRouter(<ForgotPassword />);

    expect(screen.getByTestId('header')).toHaveTextContent('logged:false');
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByTestId('auth-card')).toBeInTheDocument();
    expect(screen.getByTestId('auth-card-title')).toHaveTextContent('ForgottenPassword');
  });

  it('typing email calls store.setEmail', () => {
    renderWithRouter(<ForgotPassword />);

    const input = screen.getByLabelText('email');
    fireEvent.change(input, { target: { value: 'test@example.com' } });

    expect(storeMock.setEmail).toHaveBeenCalledWith('test@example.com');
  });

  it('submitting the form calls store.submit(t)', async () => {
    renderWithRouter(<ForgotPassword />);

    const input = screen.getByLabelText('email');
    fireEvent.change(input, { target: { value: 'test@example.com' } });

    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(storeMock.submit).toHaveBeenCalledTimes(1);
      // submit is called with t function (we can’t easily compare identity, just existence)
      expect(typeof storeMock.submit.mock.calls[0][0]).toBe('function');
    });
  });

  it('shows success alert when store.success = true', () => {
    storeMock.success = true;

    renderWithRouter(<ForgotPassword />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Passwordresetlinksent.Pleasecheckyouremail.'
    );
  });

  it('shows ErrorAlert when store.error is present and can be closed', () => {
    storeMock.error = 'Boom';

    renderWithRouter(<ForgotPassword />);

    expect(screen.getByRole('alert')).toHaveTextContent('Boom');

    fireEvent.click(screen.getByRole('button', { name: 'close' }));

    // onClose assigns store.error = null
    expect(storeMock.error).toBeNull();
  });

  it('disables input and submit button when store.loading = true', () => {
    storeMock.loading = true;

    renderWithRouter(<ForgotPassword />);

    expect(screen.getByLabelText('email')).toBeDisabled();
    // only one submit button on page
    const submitBtn = screen.getByRole('button');
    expect(submitBtn).toBeDisabled();
  });

  it('shows spinner + "Loading..." label inside submit button when loading', () => {
    storeMock.loading = true;

    renderWithRouter(<ForgotPassword />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
