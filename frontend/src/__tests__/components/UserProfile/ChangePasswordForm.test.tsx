import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import ChangePasswordForm from '@/components/UserProfile/ChangePasswordForm';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('@/components/common/ErrorAlert', () => ({
  __esModule: true,
  default: ({ message, onClose }: any) => (
    <div role="alert">
      <span>{message}</span>
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

// Create mock store object that will be shared
const createMockStore = () => ({
  saving: false,
  errorBanner: '',
  changePassword: jest.fn(async () => {}),
});

let mockStore = createMockStore();

jest.mock('@/stores/userProfileStore', () => ({
  __esModule: true,
  get default() {
    return mockStore;
  },
}));

jest.mock('react-bootstrap', () => ({
  Form: Object.assign(
    ({ children, onSubmit, ...rest }: any) => (
      <form onSubmit={onSubmit} {...rest}>
        {children}
      </form>
    ),
    {
      Group: ({ children, controlId }: any) => <div data-testid={controlId}>{children}</div>,
      Label: ({ children }: any) => <label>{children}</label>,
      Control: ({ value, onChange, disabled, type, ...rest }: any) => (
        <input type={type} value={value} onChange={onChange} disabled={disabled} {...rest} />
      ),
    }
  ),
  InputGroup: ({ children }: any) => <div>{children}</div>,
  Button: ({ children, onClick, disabled, type }: any) => (
    <button type={type || 'button'} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.saving = false;
    mockStore.errorBanner = '';
    mockStore.changePassword = jest.fn(async () => {});
  });

  it('shows local validation error for missing old password', async () => {
    renderWithRouter(<ChangePasswordForm onCancel={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter your old password.');
    expect(mockStore.changePassword).not.toHaveBeenCalled();
  });

  it('shows local validation error for password mismatch', async () => {
    renderWithRouter(<ChangePasswordForm onCancel={jest.fn()} />);

    const oldPasswordInput = screen.getByTestId('oldPassword').querySelector('input')!;
    const newPasswordInput = screen.getByTestId('newPassword').querySelector('input')!;
    const confirmPasswordInput = screen.getByTestId('confirmPassword').querySelector('input')!;

    fireEvent.change(oldPasswordInput, { target: { value: 'oldpwd' } });
    fireEvent.change(newPasswordInput, { target: { value: 'newpassword' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'different' } });

    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(screen.getByRole('alert')).toHaveTextContent('New passwords do not match!');
    expect(mockStore.changePassword).not.toHaveBeenCalled();
  });

  it('submits valid data and calls store.changePassword', async () => {
    renderWithRouter(<ChangePasswordForm onCancel={jest.fn()} />);

    const oldPasswordInput = screen.getByTestId('oldPassword').querySelector('input')!;
    const newPasswordInput = screen.getByTestId('newPassword').querySelector('input')!;
    const confirmPasswordInput = screen.getByTestId('confirmPassword').querySelector('input')!;

    fireEvent.change(oldPasswordInput, { target: { value: 'oldpwd123' } });
    fireEvent.change(newPasswordInput, { target: { value: 'newpassword' } }); // >=8
    fireEvent.change(confirmPasswordInput, { target: { value: 'newpassword' } });

    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => {
      expect(mockStore.changePassword).toHaveBeenCalledWith('oldpwd123', 'newpassword');
    });
  });

  it('cancel calls onCancel', () => {
    const onCancel = jest.fn();
    renderWithRouter(<ChangePasswordForm onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables buttons when store.saving=true', () => {
    mockStore.saving = true;

    renderWithRouter(<ChangePasswordForm onCancel={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    // saving label shows
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });
});
