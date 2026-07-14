import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import EditUserInfo from '@/components/UserProfile/EditProfileSheet';

// A second, standalone test file (like LibraryFiltersCard.configFallback.test.tsx /
// interventionsTaxonomyStore.configFallback.test.ts) so a *different* config.json shape
// — with a multi-select field that is NOT 'specialisation' — can exercise
// resolveOptions'/resolveDataKey's non-specialisation branches, which the main
// EditProfileSheet.test.tsx config (only 'specialisation' as multi-select) never reaches.
jest.mock('../../../config/config.json', () => ({
  TherapistForm: [
    {
      title: 'Section',
      fields: [
        { be_name: 'email', label: 'Email', type: 'email', options: [] },
        {
          be_name: 'languages',
          label: 'Languages',
          type: 'multi-select',
          options: ['English', 'German'],
        },
        { be_name: 'certifications', label: 'Certifications', type: 'multi-select' },
      ],
    },
  ],
  therapistInfo: {
    clinic_projects: {},
    projects: [],
    specializations: [],
  },
}));

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
import apiClient from '@/api/client';
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

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

jest.mock('react-select', () => ({
  __esModule: true,
  default: ({ options, onChange, placeholder }: any) => (
    <select
      aria-label={placeholder || 'select'}
      onChange={(e) => {
        const opt = options.find((o: any) => o.value === e.target.value);
        if (opt) onChange([opt]);
      }}
    >
      <option value="">--</option>
      {options?.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

const baseUser = { email: 'a@b.com' } as any;

describe('EditProfileSheet multi-select fields beyond specialisation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { hasPending: false } });
  });

  it('resolves options from the field config for a non-specialisation multi-select field', () => {
    renderWithRouter(<EditUserInfo show userData={baseUser} onCancel={jest.fn()} />);
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
  });

  it('falls back to an empty options list for a multi-select field with no configured options', () => {
    renderWithRouter(<EditUserInfo show userData={baseUser} onCancel={jest.fn()} />);
    const selects = screen.getAllByRole('combobox', { name: 'Select...' });
    const certifications = selects.find((el) => el.querySelectorAll('option').length === 1);
    expect(certifications).toBeTruthy();
  });

  it('submits the raw be_name (not remapped) for a non-specialisation multi-select field', async () => {
    renderWithRouter(<EditUserInfo show userData={baseUser} onCancel={jest.fn()} />);

    const selects = screen.getAllByRole('combobox', { name: 'Select...' });
    const languagesSelect = selects.find((el) => el.querySelector('option[value="English"]'))!;
    fireEvent.change(languagesSelect, { target: { value: 'English' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockStore.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ languages: ['English'] })
      );
    });
  });
});
