import { screen, fireEvent } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import ProfileDetails from '@/components/UserProfile/ProfileDetails';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('@/components/common/InfoBubble', () => ({
  __esModule: true,
  default: ({ tooltip }: any) => <span data-testid="infobubble">{tooltip}</span>,
}));

jest.mock('react-bootstrap', () => ({
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

const mockAuthStore = { userType: 'Therapist' };

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  get default() {
    return mockAuthStore;
  },
}));

describe('ProfileDetails', () => {
  const userData = {
    first_name: 'First',
    name: 'Last',
    email: 'a@b.com',
    phone: '123',
    specializations: ['Spec1'],
    clinics: ['Clinic1'],
  } as any;

  it('renders therapist-specific sections when userType is Therapist', () => {
    mockAuthStore.userType = 'Therapist';

    renderWithRouter(
      <ProfileDetails
        userData={userData}
        deleting={false}
        onEdit={jest.fn()}
        onChangePassword={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    expect(screen.getByText('Specialization:')).toBeInTheDocument();
    expect(screen.getByText('Spec1')).toBeInTheDocument();

    expect(screen.getByText('Clinics:')).toBeInTheDocument();
    expect(screen.getByText('Clinic1')).toBeInTheDocument();
  });

  it('does not render therapist sections for non-therapist', () => {
    mockAuthStore.userType = 'Admin';

    renderWithRouter(
      <ProfileDetails
        userData={userData}
        deleting={false}
        onEdit={jest.fn()}
        onChangePassword={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    expect(screen.queryByText('Specialization:')).not.toBeInTheDocument();
    expect(screen.queryByText('Clinics:')).not.toBeInTheDocument();
  });

  it('buttons call callbacks; delete button disabled when deleting', () => {
    const onEdit = jest.fn();
    const onChangePassword = jest.fn();
    const onDelete = jest.fn();

    renderWithRouter(
      <ProfileDetails
        userData={userData}
        deleting={true}
        onEdit={onEdit}
        onChangePassword={onChangePassword}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Info' }));
    expect(onEdit).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));
    expect(onChangePassword).toHaveBeenCalled();

    expect(screen.getByRole('button', { name: 'Delete Account' })).toBeDisabled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('renders "None" when specializations/clinics empty', () => {
    mockAuthStore.userType = 'Therapist';
    const u = { ...userData, specializations: [], clinics: [] };

    renderWithRouter(
      <ProfileDetails
        userData={u as any}
        deleting={false}
        onEdit={jest.fn()}
        onChangePassword={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    expect(screen.getAllByText('None').length).toBeGreaterThanOrEqual(1);
  });
});
