import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import ChangePasswordForm from '@/components/UserProfile/ChangePasswordSheet';

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

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.saving = false;
    mockStore.errorBanner = '';
    mockStore.changePassword = jest.fn(async () => {});
  });

  it('shows local validation error for missing old password', async () => {
    renderWithRouter(<ChangePasswordForm show onCancel={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter your old password.');
    expect(mockStore.changePassword).not.toHaveBeenCalled();
  });

  it('shows local validation error for password mismatch', async () => {
    renderWithRouter(<ChangePasswordForm show onCancel={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Old Password'), { target: { value: 'oldpwd' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpassword' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'different' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(screen.getByRole('alert')).toHaveTextContent('New passwords do not match!');
    expect(mockStore.changePassword).not.toHaveBeenCalled();
  });

  it('submits valid data and calls store.changePassword', async () => {
    renderWithRouter(<ChangePasswordForm show onCancel={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Old Password'), { target: { value: 'oldpwd123' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpassword' } }); // >=8
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'newpassword' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => {
      expect(mockStore.changePassword).toHaveBeenCalledWith('oldpwd123', 'newpassword');
    });
  });

  it('cancel calls onCancel', () => {
    const onCancel = jest.fn();
    renderWithRouter(<ChangePasswordForm show onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables buttons when store.saving=true', () => {
    mockStore.saving = true;

    renderWithRouter(<ChangePasswordForm show onCancel={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    // saving label shows
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });
});
