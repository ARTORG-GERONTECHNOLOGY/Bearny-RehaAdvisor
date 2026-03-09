import { render, screen, fireEvent } from '@testing-library/react';
import EditUserInfo from '@/components/UserProfile/EditTherapistInfo';
import '@testing-library/jest-dom';

// Mock api client (must be before other imports that depend on it)
jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

// 🧪 Mock i18next
jest.mock('i18next', () => ({
  t: (key) => key,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('react-select', () => ({
  __esModule: true,
  default: ({ options, value, onChange, isMulti, ...props }: any) => (
    <select
      {...props}
      multiple={isMulti}
      value={Array.isArray(value) ? value.map((v: any) => v.value) : value?.value || ''}
      onChange={(e) => {
        const selected = Array.from(e.target.selectedOptions).map((opt: any) => ({
          value: opt.value,
          label: opt.textContent,
        }));
        onChange(isMulti ? selected : selected[0]);
      }}
    >
      {options?.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

// 🧪 Mock userProfileStore
jest.mock('@/stores/userProfileStore', () => ({
  __esModule: true,
  default: {
    saving: false,
    updateProfile: jest.fn(),
  },
}));

// 🧪 Mock config
jest.mock('../../../config/config.json', () => ({
  TherapistForm: [
    {
      fields: [
        { be_name: 'name', label: 'Name', type: 'text' },
        { be_name: 'phone', label: 'Phone', type: 'text' },
        {
          be_name: 'specialization',
          label: 'Specialization',
          type: 'multi-select',
          options: ['Neuro', 'Cardio'],
        },
      ],
    },
  ],
  UserProfile: {
    Name: 'name',
    Phone: 'phone',
    Specialization: 'specialization',
  },
}));

import userProfileStore from '@/stores/userProfileStore';

describe('EditUserInfo Component', () => {
  const defaultUserData = {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    specialization: ['Neuro'],
  };

  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (userProfileStore.updateProfile as jest.Mock).mockResolvedValue(undefined);
  });

  test('renders all form fields without password section', () => {
    render(<EditUserInfo userData={defaultUserData} onCancel={mockOnCancel} />);

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toBeInTheDocument();
    expect(screen.getByLabelText('Specialization')).toBeInTheDocument();
    // Password fields should NOT be present
    expect(screen.queryByLabelText('Old Password')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New Password')).not.toBeInTheDocument();
  });

  test('validates email format and shows error', async () => {
    render(
      <EditUserInfo userData={{ ...defaultUserData, email: 'bademail' }} onCancel={mockOnCancel} />
    );

    fireEvent.click(screen.getByText('Save Changes'));
    expect(await screen.findByText('Invalid email format.')).toBeInTheDocument();
  });

  test('validates phone format and shows error', async () => {
    render(
      <EditUserInfo userData={{ ...defaultUserData, phone: 'invalid' }} onCancel={mockOnCancel} />
    );

    fireEvent.click(screen.getByText('Save Changes'));
    expect(await screen.findByText('Invalid phone number format.')).toBeInTheDocument();
  });

  test('calls updateProfile when form is submitted with valid data', async () => {
    render(<EditUserInfo userData={defaultUserData} onCancel={mockOnCancel} />);

    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+1987654321' } });
    fireEvent.click(screen.getByText('Save Changes'));

    expect(userProfileStore.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+1987654321' })
    );
  });

  test('calls onCancel when Cancel button is clicked', () => {
    render(<EditUserInfo userData={defaultUserData} onCancel={mockOnCancel} />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnCancel).toHaveBeenCalled();
  });
});
