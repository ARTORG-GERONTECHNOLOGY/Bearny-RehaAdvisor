import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import ChangePasswordForm from '@/components/UserProfile/ChangePasswordSheet';
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

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

const mockStore = createMockStore();

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

  it('clears the fields after a successful submit (no errorBanner)', async () => {
    renderWithRouter(<ChangePasswordForm show onCancel={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Old Password'), { target: { value: 'oldpwd123' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpassword' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'newpassword' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => expect(mockStore.changePassword).toHaveBeenCalled());
    expect((screen.getByLabelText('Old Password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('New Password') as HTMLInputElement).value).toBe('');
  });

  it('keeps the fields populated after a submit that sets an errorBanner', async () => {
    mockStore.changePassword = jest.fn(async () => {
      mockStore.errorBanner = 'Old password incorrect';
    });

    renderWithRouter(<ChangePasswordForm show onCancel={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Old Password'), { target: { value: 'oldpwd123' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpassword' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'newpassword' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => expect(mockStore.changePassword).toHaveBeenCalled());
    expect((screen.getByLabelText('Old Password') as HTMLInputElement).value).toBe('oldpwd123');
  });

  it('resets the fields and local error when the sheet is hidden', () => {
    const { rerender } = renderWithRouter(<ChangePasswordForm show onCancel={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Old Password'), { target: { value: 'typed' } });
    expect((screen.getByLabelText('Old Password') as HTMLInputElement).value).toBe('typed');

    rerender(<ChangePasswordForm show={false} onCancel={jest.fn()} />);
    rerender(<ChangePasswordForm show onCancel={jest.fn()} />);

    expect((screen.getByLabelText('Old Password') as HTMLInputElement).value).toBe('');
  });

  it('calls onCancel via handleOpenChange when the sheet closes and not saving', () => {
    const onCancel = jest.fn();
    renderWithRouter(<ChangePasswordForm show onCancel={onCancel} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('does not call onCancel via Escape while saving', () => {
    mockStore.saving = true;
    const onCancel = jest.fn();
    renderWithRouter(<ChangePasswordForm show onCancel={onCancel} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
