import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import EditUserInfo from '@/components/UserProfile/EditProfileSheet';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// ── api client ───────────────────────────────────────────────────────────────
jest.mock('@/api/client', () => require('@/__mocks__/api/client'));
import apiClient from '@/api/client';

// ── config ───────────────────────────────────────────────────────────────────
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
  therapistInfo: {
    clinic_projects: {
      Inselspital: ['COPAIN'],
      'Berner Reha Centrum': ['COPAIN'],
    },
    projects: ['COPAIN'],
    specializations: ['Cardiology'],
  },
}));

// ── store ─────────────────────────────────────────────────────────────────────
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

// ── react-select ──────────────────────────────────────────────────────────────
jest.mock('react-select', () => ({
  __esModule: true,
  default: ({ options, onChange, placeholder, isDisabled }: any) => (
    <select
      disabled={isDisabled}
      aria-label={placeholder || 'select'}
      onChange={(e) => {
        const opt = options.find((o: any) => o.value === e.target.value);
        if (opt) onChange([opt]);
      }}
    >
      {options?.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

// ── ErrorAlert ────────────────────────────────────────────────────────────────
jest.mock('@/components/common/ErrorAlert', () => ({
  __esModule: true,
  default: ({ message, onClose }: any) => (
    <div role="alert">
      <span>{message}</span>
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

const baseUser = {
  email: 'a@b.com',
  phone: '1234567',
  clinics: ['Inselspital'],
  projects: ['COPAIN'],
} as any;

function setup(userData = baseUser, onCancel = jest.fn()) {
  return renderWithRouter(<EditUserInfo show userData={userData} onCancel={onCancel} />);
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('EditTherapistInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.saving = false;
    // Default: no pending request
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { hasPending: false } });
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { ok: true } });
  });

  // ── profile form ─────────────────────────────────────────────────────────

  it('email field is disabled', () => {
    setup();
    expect(screen.getByLabelText('Email')).toBeDisabled();
  });

  it('does not render password fields', () => {
    setup();
    expect(screen.queryByLabelText('Old Password')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New Password')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Confirm New Password')).not.toBeInTheDocument();
  });

  it('invalid email triggers local validation error', () => {
    setup({ ...baseUser, email: 'bad' });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email format.');
    expect(mockStore.updateProfile).not.toHaveBeenCalled();
  });

  it('invalid phone triggers local validation error', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid phone number format.');
    expect(mockStore.updateProfile).not.toHaveBeenCalled();
  });

  it('valid submit calls userProfileStore.updateProfile', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+41791234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => {
      expect(mockStore.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'a@b.com', phone: '+41791234567' })
      );
    });
  });

  it('cancel calls onCancel', () => {
    const onCancel = jest.fn();
    setup(baseUser, onCancel);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables buttons when saving', () => {
    mockStore.saving = true;
    setup();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });

  // ── current clinics / projects display ───────────────────────────────────

  it('shows current clinics as badges', () => {
    setup({ ...baseUser, clinics: ['Inselspital', 'Berner Reha Centrum'] });
    expect(screen.getByText('Inselspital')).toBeInTheDocument();
    expect(screen.getByText('Berner Reha Centrum')).toBeInTheDocument();
  });

  it('shows current projects as badges', () => {
    setup({ ...baseUser, projects: ['COPAIN'] });
    expect(screen.getByText('COPAIN')).toBeInTheDocument();
  });

  it('shows dash when therapist has no clinics', () => {
    setup({ ...baseUser, clinics: [], projects: [] });
    // two em-dashes: one for clinics, one for projects
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  // ── hasPending badge ─────────────────────────────────────────────────────

  it('fetches pending status on mount', async () => {
    setup();
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('therapist/access-change-request/');
    });
  });

  it('shows pending badge when server reports hasPending', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { hasPending: true } });
    setup();
    await waitFor(() => {
      expect(screen.getByText('Change request pending admin approval')).toBeInTheDocument();
    });
  });

  it('does not show pending badge when no pending request', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { hasPending: false } });
    setup();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(screen.queryByText('Change request pending admin approval')).not.toBeInTheDocument();
  });

  // ── access change request modal ──────────────────────────────────────────

  it('"Request access change" button is present', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Request access change' })).toBeInTheDocument();
  });

  it('opens access change modal when button clicked', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Request access change' }));
    await waitFor(() => {
      expect(screen.getByText('Request clinic / project change')).toBeInTheDocument();
    });
  });

  it('submits access change request and shows pending badge', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Request access change' }));
    await waitFor(() =>
      expect(screen.getByText('Request clinic / project change')).toBeInTheDocument()
    );

    // Submit with default pre-populated values (clinics=Inselspital, projects=COPAIN)
    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('therapist/access-change-request/', {
        clinics: expect.any(Array),
        projects: expect.any(Array),
      });
    });

    // Success message appears
    await waitFor(() => {
      expect(screen.getByText(/request has been submitted/i)).toBeInTheDocument();
    });
  });

  it('shows error when submit request fails', async () => {
    (apiClient.post as jest.Mock).mockRejectedValue({
      response: { data: { error: 'Server error' } },
    });

    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Request access change' }));
    await waitFor(() =>
      expect(screen.getByText('Request clinic / project change')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });
});
