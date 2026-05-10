import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import ForgotPassword from '@/pages/ForgottenPassword';
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

// ErrorAlert
jest.mock('@/components/common/ErrorAlert', () => ({
  __esModule: true,
  default: ({ message, onClose }: { message?: string; onClose?: () => void }) => (
    <div role="alert">
      <span>{message}</span>
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

// Container
jest.mock('@/components/Container', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/PageHeader', () => ({
  __esModule: true,
  default: ({ title }: { title?: string }) => <h1 data-testid="page-header">{title}</h1>,
}));

// UI Button (back button + submit button)
jest.mock('@/components/ui/button', () => ({
  __esModule: true,
  Button: ({
    children,
    disabled,
    onClick,
    type,
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    type?: string;
  }) => (
    <button
      disabled={disabled}
      onClick={onClick}
      type={type || 'button'}
      {...(type === 'submit' ? { 'data-testid': 'submit-btn' } : {})}
    >
      {children}
    </button>
  ),
}));

// Card
jest.mock('@/components/Card', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

// FieldGroup
jest.mock('@/components/ui/field', () => ({
  __esModule: true,
  FieldGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

// InputField
jest.mock('@/components/forms/input/InputField', () => ({
  __esModule: true,
  default: ({
    label,
    value,
    onChange,
    disabled,
    type,
    placeholder,
  }: {
    label?: string;
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    disabled?: boolean;
    type?: string;
    placeholder?: string;
  }) => (
    <input
      aria-label={label}
      type={type || 'text'}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
    />
  ),
}));

// Bootstrap mocks
jest.mock('react-bootstrap', () => ({
  Container: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="container">{children}</div>
  ),
  Row: ({ children }: { children?: React.ReactNode }) => <div data-testid="row">{children}</div>,
  Col: ({ children }: { children?: React.ReactNode }) => <div data-testid="col">{children}</div>,
  Alert: ({ children }: { children?: React.ReactNode }) => <div role="alert">{children}</div>,
  Spinner: ({ role }: { role?: string }) => <div role={role || 'status'}>spinner</div>,
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

jest.mock('@/stores/forgotPasswordStore', () => ({
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

  it('renders page title', () => {
    renderWithRouter(<ForgotPassword />);

    expect(screen.getByTestId('page-header')).toHaveTextContent('ForgottenPassword');
  });

  it('typing email calls store.setEmail', () => {
    renderWithRouter(<ForgotPassword />);

    const input = screen.getByLabelText('Emailaddress');
    fireEvent.change(input, { target: { value: 'test@example.com' } });

    expect(storeMock.setEmail).toHaveBeenCalledWith('test@example.com');
  });

  it('submitting the form calls store.submit(t)', async () => {
    renderWithRouter(<ForgotPassword />);

    const input = screen.getByLabelText('Emailaddress');
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

    expect(screen.getByLabelText('Emailaddress')).toBeDisabled();
    expect(screen.getByTestId('submit-btn')).toBeDisabled();
  });

  it('shows spinner + "Loading..." label inside submit button when loading', () => {
    storeMock.loading = true;

    renderWithRouter(<ForgotPassword />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
