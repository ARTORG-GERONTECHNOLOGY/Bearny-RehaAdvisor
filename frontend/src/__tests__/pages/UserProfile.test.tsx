import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import UserProfile from '@/pages/UserProfile';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('@/components/common/Header', () => ({
  __esModule: true,
  default: ({ isLoggedIn }: any) => <div data-testid="header">logged:{String(isLoggedIn)}</div>,
}));

jest.mock('@/components/common/Footer', () => ({
  __esModule: true,
  default: () => <div data-testid="footer" />,
}));

jest.mock('@/components/common/StatusBanner', () => ({
  __esModule: true,
  default: ({ type, message, onClose }: any) =>
    message ? (
      <div data-testid={`banner-${type}`}>
        <span>{message}</span>
        <button onClick={onClose}>close</button>
      </div>
    ) : null,
}));

// child components: keep minimal but interactive
jest.mock('@/components/UserProfile/EditTherapistInfo', () => ({
  __esModule: true,
  default: ({ onCancel }: any) => (
    <div data-testid="edit-form">
      <button onClick={onCancel}>cancel-edit</button>
    </div>
  ),
}));

jest.mock('@/components/UserProfile/ChangePasswordForm', () => ({
  __esModule: true,
  default: ({ onCancel }: any) => (
    <div data-testid="change-password-form">
      <button onClick={onCancel}>cancel-pwd</button>
    </div>
  ),
}));

jest.mock('@/components/UserProfile/ProfileDetails', () => ({
  __esModule: true,
  default: ({ onEdit, onChangePassword, onDelete, deleting }: any) => (
    <div data-testid="profile-details">
      <div>deleting:{String(deleting)}</div>
      <button onClick={onEdit}>go-edit</button>
      <button onClick={onChangePassword}>go-change-password</button>
      <button onClick={onDelete}>go-delete</button>
    </div>
  ),
}));

jest.mock('@/components/UserProfile/DeleteConfirmation', () => ({
  __esModule: true,
  default: ({ show, handleClose, handleConfirm, isLoading }: any) =>
    show ? (
      <div data-testid="delete-modal">
        <div>loading:{String(isLoading)}</div>
        <button onClick={handleClose}>close-delete</button>
        <button onClick={handleConfirm}>confirm-delete</button>
      </div>
    ) : null,
}));

jest.mock('react-bootstrap', () => ({
  Container: ({ children }: any) => <div data-testid="container">{children}</div>,
  Row: ({ children }: any) => <div data-testid="row">{children}</div>,
  Col: ({ children }: any) => <div data-testid="col">{children}</div>,
  Spinner: () => <div data-testid="spinner" />,
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: Object.assign(({ children }: any) => <div data-testid="card">{children}</div>, {
    Header: ({ children }: any) => <div data-testid="card-header">{children}</div>,
    Body: ({ children }: any) => <div data-testid="card-body">{children}</div>,
    Footer: ({ children }: any) => <div data-testid="card-footer">{children}</div>,
  }),
}));

// ---- authStore + userProfileStore mocks ----
const authStoreMock = {
  isAuthenticated: true,
  userType: 'Therapist',
  checkAuthentication: jest.fn(),
};

const userProfileStoreMock = {
  mode: 'view' as 'view' | 'editProfile' | 'changePassword',
  showDeletePopup: false,
  userData: { first_name: 'A', name: 'B', email: 'a@b.com', phone: '1' } as any,
  loading: false,
  saving: false,
  deleting: false,
  errorBanner: '',
  successBanner: '',
  fetchProfile: jest.fn(),
  deleteAccount: jest.fn(async () => {}),
  clearError: jest.fn(),
  clearSuccess: jest.fn(),
  setMode: jest.fn((m: any) => {
    userProfileStoreMock.mode = m;
  }),
  openDelete: jest.fn(() => {
    userProfileStoreMock.showDeletePopup = true;
  }),
  closeDelete: jest.fn(() => {
    userProfileStoreMock.showDeletePopup = false;
  }),
};

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  get default() {
    return authStoreMock;
  },
}));

jest.mock('@/stores/userProfileStore', () => ({
  __esModule: true,
  get default() {
    return userProfileStoreMock;
  },
}));

describe('UserProfile page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockReset();

    authStoreMock.isAuthenticated = true;
    authStoreMock.userType = 'Therapist';

    userProfileStoreMock.mode = 'view';
    userProfileStoreMock.showDeletePopup = false;
    userProfileStoreMock.userData = { first_name: 'A', name: 'B', email: 'a@b.com', phone: '1' };
    userProfileStoreMock.loading = false;
    userProfileStoreMock.saving = false;
    userProfileStoreMock.deleting = false;
    userProfileStoreMock.errorBanner = '';
    userProfileStoreMock.successBanner = '';
  });

  it('calls authStore.checkAuthentication and fetchProfile on mount when authenticated', async () => {
    renderWithRouter(<UserProfile />);

    expect(authStoreMock.checkAuthentication).toHaveBeenCalledTimes(1);
    expect(userProfileStoreMock.fetchProfile).toHaveBeenCalledTimes(1);
  });

  it('redirects to home if not authenticated', () => {
    authStoreMock.isAuthenticated = false;

    renderWithRouter(<UserProfile />);

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    expect(userProfileStoreMock.fetchProfile).not.toHaveBeenCalled();
  });

  it('shows loading spinner when store.loading = true', () => {
    userProfileStoreMock.loading = true;

    renderWithRouter(<UserProfile />);

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows "No user data found." when userData is null', () => {
    userProfileStoreMock.userData = null;

    renderWithRouter(<UserProfile />);

    expect(screen.getByText('No user data found.')).toBeInTheDocument();
  });

  it('renders ProfileDetails in view mode and can switch to edit/changePassword via callbacks', async () => {
    userProfileStoreMock.mode = 'view';

    renderWithRouter(<UserProfile />);

    expect(screen.getByTestId('profile-details')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'go-edit' }));
    expect(userProfileStoreMock.setMode).toHaveBeenCalledWith('editProfile');

    fireEvent.click(screen.getByRole('button', { name: 'go-change-password' }));
    expect(userProfileStoreMock.setMode).toHaveBeenCalledWith('changePassword');
  });

  it('renders EditUserInfo when mode=editProfile and can cancel back to view', () => {
    userProfileStoreMock.mode = 'editProfile';

    renderWithRouter(<UserProfile />);

    expect(screen.getByTestId('edit-form')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'cancel-edit' }));
    expect(userProfileStoreMock.setMode).toHaveBeenCalledWith('view');

    // footer should exist in edit mode
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByText('Update your profile information.')).toBeInTheDocument();
  });

  it('renders ChangePasswordForm when mode=changePassword and can cancel back to view', () => {
    userProfileStoreMock.mode = 'changePassword';

    renderWithRouter(<UserProfile />);

    expect(screen.getByTestId('change-password-form')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'cancel-pwd' }));
    expect(userProfileStoreMock.setMode).toHaveBeenCalledWith('view');

    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByText('Change your account password.')).toBeInTheDocument();
  });

  it('shows StatusBanner messages and close triggers store clear methods', () => {
    userProfileStoreMock.errorBanner = 'SomeErrorKey';
    userProfileStoreMock.successBanner = 'SomeSuccessKey';

    renderWithRouter(<UserProfile />);

    expect(screen.getByTestId('banner-danger')).toHaveTextContent('SomeErrorKey');
    expect(screen.getByTestId('banner-success')).toHaveTextContent('SomeSuccessKey');

    // close error
    fireEvent.click(screen.getAllByText('close')[0]);
    expect(userProfileStoreMock.clearError).toHaveBeenCalled();

    // close success
    fireEvent.click(screen.getAllByText('close')[1]);
    expect(userProfileStoreMock.clearSuccess).toHaveBeenCalled();
  });

  it('delete flow: opens delete modal; confirm calls deleteAccount and navigates home on success', async () => {
    userProfileStoreMock.mode = 'view';
    userProfileStoreMock.showDeletePopup = true;

    userProfileStoreMock.deleteAccount.mockResolvedValueOnce(undefined);
    userProfileStoreMock.errorBanner = ''; // success

    renderWithRouter(<UserProfile />);

    expect(screen.getByTestId('delete-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'confirm-delete' }));

    await waitFor(() => {
      expect(userProfileStoreMock.deleteAccount).toHaveBeenCalledTimes(1);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('delete flow: does NOT navigate if deleteAccount resulted in errorBanner', async () => {
    userProfileStoreMock.showDeletePopup = true;

    // simulate error outcome by setting errorBanner before page checks it
    userProfileStoreMock.deleteAccount.mockImplementationOnce(async () => {
      userProfileStoreMock.errorBanner = 'Failed to delete account';
    });

    renderWithRouter(<UserProfile />);

    fireEvent.click(screen.getByRole('button', { name: 'confirm-delete' }));

    await waitFor(() => {
      expect(userProfileStoreMock.deleteAccount).toHaveBeenCalledTimes(1);
    });

    expect(mockNavigate).not.toHaveBeenCalledWith('/', { replace: true });
  });
});
