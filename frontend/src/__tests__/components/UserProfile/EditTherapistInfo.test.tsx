import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import EditUserInfo from '@/components/UserProfile/EditTherapistInfo';

// translation
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

// mock config to a tiny set of fields so test is deterministic
jest.mock('../../../config/config.json', () => ({
  TherapistForm: [
    {
      title: 'Section',
      fields: [
        { be_name: 'email', label: 'Email', type: 'email', options: [] },
        { be_name: 'phone', label: 'Phone', type: 'text', options: [] },
      ],
    },
  ],
}));

const mockStore = {
  saving: false,
  updateProfile: jest.fn(async () => {}),
};

jest.mock('@/stores/userProfileStore', () => ({
  __esModule: true,
  get default() {
    return mockStore;
  },
}));

// bootstrap mocks
jest.mock('react-bootstrap', () => ({
  Form: Object.assign(
    ({ children, onSubmit, ...rest }: any) => (
      <form onSubmit={onSubmit} {...rest}>
        {children}
      </form>
    ),
    {
      Group: ({ children }: any) => <div>{children}</div>,
      Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
      Control: ({ id, value, onChange, disabled, type }: any) => (
        <input
          aria-label={id}
          id={id}
          type={type || 'text'}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      ),
    }
  ),
  Button: ({ children, onClick, type, disabled }: any) => (
    <button type={type || 'button'} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

describe('EditTherapistInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.saving = false;
  });

  const baseUser = { email: 'a@b.com', phone: '1234567' } as any;

  it('email field is disabled', () => {
    renderWithRouter(<EditUserInfo userData={baseUser} onCancel={jest.fn()} />);
    expect(screen.getByLabelText('email')).toBeDisabled();
  });

  it('invalid email triggers local validation error (even though email is disabled, you can validate initial data)', async () => {
    const badUser = { ...baseUser, email: 'bad' };

    renderWithRouter(<EditUserInfo userData={badUser} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email format.');
    expect(mockStore.updateProfile).not.toHaveBeenCalled();
  });

  it('invalid phone triggers local validation error', async () => {
    renderWithRouter(<EditUserInfo userData={baseUser} onCancel={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('phone'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid phone number format.');
    expect(mockStore.updateProfile).not.toHaveBeenCalled();
  });

  it('valid submit calls userProfileStore.updateProfile with updated data', async () => {
    renderWithRouter(<EditUserInfo userData={baseUser} onCancel={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('phone'), { target: { value: '+41791234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockStore.updateProfile).toHaveBeenCalledTimes(1);
      expect(mockStore.updateProfile.mock.calls[0][0]).toMatchObject({
        email: 'a@b.com',
        phone: '+41791234567',
      });
    });
  });

  it('cancel calls onCancel', () => {
    const onCancel = jest.fn();
    renderWithRouter(<EditUserInfo userData={baseUser} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables buttons when saving', () => {
    mockStore.saving = true;
    renderWithRouter(<EditUserInfo userData={baseUser} onCancel={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });
});
