import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditUserInfo from '../../../components/UserProfile/EditTherapistInfo';
import '@testing-library/jest-dom';

// 🧪 Mock i18next
jest.mock('i18next', () => ({
  t: (key) => key,
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

describe('EditUserInfo Component', () => {
  const defaultUserData = {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    specialization: ['Neuro'],
  };

  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders all form fields including password section', () => {
    render(<EditUserInfo userData={defaultUserData} onSave={mockOnSave} onCancel={mockOnCancel} />);

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toBeInTheDocument();
    expect(screen.getByLabelText('Old Password')).toBeInTheDocument();
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm New Password')).toBeInTheDocument();
  });

  test('validates email format and shows error', async () => {
    render(
      <EditUserInfo
        userData={{ ...defaultUserData, email: 'bademail' }}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.click(screen.getByText('Save Changes'));
    expect(await screen.findByText('Invalid email format.')).toBeInTheDocument();
  });

  test('validates phone format and shows error', async () => {
    render(
      <EditUserInfo
        userData={{ ...defaultUserData, phone: 'invalid' }}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.click(screen.getByText('Save Changes'));
    expect(await screen.findByText('Invalid phone number format.')).toBeInTheDocument();
  });

  test('shows alert if new and confirm passwords do not match', () => {
    window.alert = jest.fn();
    render(<EditUserInfo userData={defaultUserData} onSave={mockOnSave} onCancel={mockOnCancel} />);

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'abc123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'xyz789' },
    });

    fireEvent.click(screen.getByText('Save Changes'));
    expect(window.alert).toHaveBeenCalledWith('New passwords do not match!');
  });

  test('calls onSave with valid data', () => {
    render(<EditUserInfo userData={defaultUserData} onSave={mockOnSave} onCancel={mockOnCancel} />);

    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+1987654321' } });
    fireEvent.click(screen.getByText('Save Changes'));

    expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({ phone: '+1987654321' }));
  });

  test('calls onCancel when Cancel button is clicked', () => {
    render(<EditUserInfo userData={defaultUserData} onSave={mockOnSave} onCancel={mockOnCancel} />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnCancel).toHaveBeenCalled();
  });
});
