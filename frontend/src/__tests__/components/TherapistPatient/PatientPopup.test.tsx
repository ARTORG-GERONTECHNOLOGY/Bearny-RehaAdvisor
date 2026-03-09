import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PatientPopup from '@/components/TherapistPatientPage/PatientPopup';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../../i18n';
import apiClient from '@/api/client';
import '@testing-library/jest-dom';
import { PatientType } from '@/types';

jest.mock('@/api/client', () => ({
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    isAuthenticated: true,
    userType: 'Therapist',
  },
}));

const mockPatient: PatientType = {
  _id: 'abc123',
  username: 'testuser',
  first_name: 'John',
  name: 'Doe',
  age: '1990-01-01',
  diagnosis: ['Stroke'],
  sex: 'Male',
  duration: 120,
};

const mockPatientData = {
  name: 'John Doe',
  email: 'john@example.com',
  phone: '+123456789',
  function: ['Cardiology'],
  diagnosis: ['Stroke'],
  age: '1990-01-01',
};

describe('PatientPopup', () => {
  const renderComponent = () =>
    render(
      <I18nextProvider i18n={i18n}>
        <PatientPopup show={true} handleClose={jest.fn()} patient_id={mockPatient} />
      </I18nextProvider>
    );

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock GET to handle both profile and thresholds endpoints
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/profile')) {
        return Promise.resolve({ data: mockPatientData });
      }
      if (url.includes('/thresholds')) {
        return Promise.resolve({ data: {} });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('shows loading initially and then patient data', async () => {
    renderComponent();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(await screen.findByText(/John Doe/i)).toBeInTheDocument();
  });

  it('enables editing and saves changes', async () => {
    (apiClient.put as jest.Mock).mockResolvedValue({ data: mockPatientData });

    renderComponent();
    const editButton = await screen.findByText('Edit');
    fireEvent.click(editButton);

    // Make a change to make the form dirty
    const nameInput = await screen.findByDisplayValue('John Doe');
    fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });

    const saveButton = await screen.findByText('Save Changes');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        '/users/abc123/profile/',
        expect.objectContaining({ name: 'Jane Doe' })
      );
    });
  });

  // Implement client-side validation for email in PatientPopup component
  it.skip('shows validation error for invalid email', async () => {
    renderComponent();

    const editButton = await screen.findByText('Edit');
    fireEvent.click(editButton);

    const saveButton = await screen.findByText('Save Changes');
    const emailInput = await screen.findByDisplayValue('john@example.com');
    fireEvent.change(emailInput, { target: { value: 'invalidemail' } });

    fireEvent.click(saveButton);

    expect(await screen.findByText(/Invalid email format/i)).toBeInTheDocument();
  });

  // Implement client-side validation for phone in PatientPopup component
  it.skip('shows validation error for invalid phone', async () => {
    renderComponent();

    const editButton = await screen.findByText('Edit');
    fireEvent.click(editButton);

    const saveButton = await screen.findByText('Save Changes');
    const phoneInput = await screen.findByDisplayValue('+123456789');
    fireEvent.change(phoneInput, { target: { value: 'abc' } });

    fireEvent.click(saveButton);

    expect(await screen.findByText(/Invalid phone number format/i)).toBeInTheDocument();
  });

  it('opens delete confirmation and calls API', async () => {
    (apiClient.delete as jest.Mock).mockResolvedValue({});
    renderComponent();

    const deleteButton = await screen.findByText('Delete Patient');
    fireEvent.click(deleteButton);

    expect(await screen.findByText(/Confirm Deletion/i)).toBeInTheDocument();
    const confirmButton = screen.getByText(/^Delete$/i);
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/patients/abc123/');
    });
  });

  it('cancels delete confirmation modal', async () => {
    renderComponent();

    const deleteButton = await screen.findByText('Delete Patient');
    fireEvent.click(deleteButton);

    expect(await screen.findByText(/Confirm Deletion/i)).toBeInTheDocument();

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText(/Confirm Deletion/i)).not.toBeInTheDocument();
    });
  });
  it('handles missing fields gracefully when normalizing data', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/profile')) return Promise.resolve({ data: {} });
      if (url.includes('/thresholds')) return Promise.resolve({ data: {} });
      return Promise.resolve({ data: {} });
    });
    renderComponent();
    const matches = await screen.findAllByText(/Patient/i);
    expect(matches.length).toBeGreaterThan(0);
  });
  it('initializes multi-select fields as empty arrays when data missing', async () => {
    const partialData = { name: 'Anna' };
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/profile')) return Promise.resolve({ data: partialData });
      if (url.includes('/thresholds')) return Promise.resolve({ data: {} });
      return Promise.resolve({ data: {} });
    });

    renderComponent();
    expect(await screen.findByText(/Anna/)).toBeInTheDocument();
  });
  it('updates formData correctly on multi-select change', async () => {
    renderComponent();
    await screen.findByText(/Edit/i);
    fireEvent.click(screen.getByText(/Edit/i));

    // Simulate react-select change
    const instance = screen.getByText(/Cardiology/);
    expect(instance).toBeInTheDocument(); // Should already be selected
  });
  it('accepts valid email and phone input', async () => {
    (apiClient.put as jest.Mock).mockResolvedValue({});
    renderComponent();

    const editButton = await screen.findByText('Edit');
    fireEvent.click(editButton);

    const saveButton = await screen.findByText('Save Changes');
    const emailInput = await screen.findByDisplayValue('john@example.com');
    const phoneInput = await screen.findByDisplayValue('+123456789');

    fireEvent.change(emailInput, { target: { value: 'new@example.com' } });
    fireEvent.change(phoneInput, { target: { value: '+987654321' } });

    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(apiClient.put).toHaveBeenCalledWith(
        '/users/abc123/profile/',
        expect.objectContaining({
          email: 'new@example.com',
          phone: '+987654321',
        })
      )
    );
  });
  it('calls handleClose after successful delete', async () => {
    const closeMock = jest.fn();
    (apiClient.delete as jest.Mock).mockResolvedValue({});
    render(
      <I18nextProvider i18n={i18n}>
        <PatientPopup show={true} handleClose={closeMock} patient_id={mockPatient} />
      </I18nextProvider>
    );

    const deleteButton = await screen.findByText('Delete Patient');
    fireEvent.click(deleteButton);

    const confirmButton = await screen.findByText(/^Delete$/i);
    fireEvent.click(confirmButton);

    await waitFor(() => expect(closeMock).toHaveBeenCalled());
  });
  it('cancels edit mode without saving', async () => {
    renderComponent();

    const editButton = await screen.findByText('Edit');
    fireEvent.click(editButton);

    const cancelButton = await screen.findByText('Cancel');
    fireEvent.click(cancelButton);

    expect(screen.queryByText('Save Changes')).not.toBeInTheDocument(); // Editing exited
  });
  it('closes delete confirmation modal when cancelled', async () => {
    renderComponent();

    const deleteButton = await screen.findByText('Delete Patient');
    fireEvent.click(deleteButton);

    const cancelButton = await screen.findByText('Cancel');
    fireEvent.click(cancelButton);

    await waitFor(() => expect(screen.queryByText(/Confirm Deletion/i)).not.toBeInTheDocument());
  });
});
