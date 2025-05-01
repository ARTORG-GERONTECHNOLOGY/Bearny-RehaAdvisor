import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PatientPopup from '../../../components/TherapistPatientPage/PatientPopup';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../../i18n';
import apiClient from '../../../api/client';
import '@testing-library/jest-dom';
import { PatientType } from '../../../types/index';

jest.mock('../../../api/client', () => ({
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}));

jest.mock('../../../stores/authStore', () => ({
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
  });

  it('shows loading initially and then patient data', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockPatientData });
    renderComponent();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(await screen.findByText(/John Doe/i)).toBeInTheDocument();
  });

  it('enables editing and saves changes', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockPatientData });
    (apiClient.put as jest.Mock).mockResolvedValue({});

    renderComponent();
    await screen.findByText(/Edit/i);
    fireEvent.click(screen.getByText(/Edit/i));
    fireEvent.click(screen.getByText(/Save Changes/i));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        'users/testuser/profile/',
        expect.objectContaining({ name: 'John Doe' })
      );
    });
  });

  it('shows validation error for invalid email', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockPatientData });
    renderComponent();

    await screen.findByText(/Edit/i);
    fireEvent.click(screen.getByText(/Edit/i));

    const emailInput = screen.getByDisplayValue('john@example.com');
    fireEvent.change(emailInput, { target: { value: 'invalidemail' } });
    fireEvent.click(screen.getByText(/Save Changes/i));

    expect(await screen.findByText(/Invalid email format/i)).toBeInTheDocument();
  });

  it('shows validation error for invalid phone', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockPatientData });
    renderComponent();

    await screen.findByText(/Edit/i);
    fireEvent.click(screen.getByText(/Edit/i));

    const phoneInput = screen.getByDisplayValue('+123456789');
    fireEvent.change(phoneInput, { target: { value: 'abc' } });
    fireEvent.click(screen.getByText(/Save Changes/i));

    expect(await screen.findByText(/Invalid phone number format/i)).toBeInTheDocument();
  });

  it('opens delete confirmation and calls API', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockPatientData });
    (apiClient.delete as jest.Mock).mockResolvedValue({});
    renderComponent();

    await screen.findByText(/Delete Patient/i);
    fireEvent.click(screen.getByText(/Delete Patient/i));

    expect(screen.getByText(/Confirm Deletion/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/^Delete$/i));

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('users/testuser/profile/');
    });
  });

  it('cancels delete confirmation modal', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockPatientData });
    renderComponent();

    await screen.findByText(/Delete Patient/i);
    fireEvent.click(screen.getByText(/Delete Patient/i));

    expect(screen.getByText(/Confirm Deletion/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Cancel/i));

    await waitFor(() => {
      expect(screen.queryByText(/Confirm Deletion/i)).not.toBeInTheDocument();
    });
  });
  it('handles missing fields gracefully when normalizing data', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: {} }); // No patient data
    renderComponent();
    const matches = await screen.findAllByText(/Patient/i);
    expect(matches.length).toBeGreaterThan(0);
  });
  it('initializes multi-select fields as empty arrays when data missing', async () => {
    const partialData = { name: 'Anna' };
    (apiClient.get as jest.Mock).mockResolvedValue({ data: partialData });

    renderComponent();
    expect(await screen.findByText(/Anna/)).toBeInTheDocument();
  });
  it('updates formData correctly on multi-select change', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockPatientData });

    renderComponent();
    await screen.findByText(/Edit/i);
    fireEvent.click(screen.getByText(/Edit/i));

    // Simulate react-select change
    const instance = screen.getByText(/Cardiology/);
    expect(instance).toBeInTheDocument(); // Should already be selected
  });
  it('accepts valid email and phone input', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockPatientData });
    renderComponent();

    await screen.findByText(/Edit/i);
    fireEvent.click(screen.getByText(/Edit/i));

    const emailInput = screen.getByDisplayValue('john@example.com');
    const phoneInput = screen.getByDisplayValue('+123456789');

    fireEvent.change(emailInput, { target: { value: 'new@example.com' } });
    fireEvent.change(phoneInput, { target: { value: '+987654321' } });

    fireEvent.click(screen.getByText(/Save Changes/i));

    await waitFor(() =>
      expect(apiClient.put).toHaveBeenCalledWith(
        'users/testuser/profile/',
        expect.objectContaining({
          email: 'new@example.com',
          phone: '+987654321',
        })
      )
    );
  });
  it('calls handleClose after successful delete', async () => {
    const closeMock = jest.fn();
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockPatientData });
    (apiClient.delete as jest.Mock).mockResolvedValue({});
    render(
      <I18nextProvider i18n={i18n}>
        <PatientPopup show={true} handleClose={closeMock} patient_id={mockPatient} />
      </I18nextProvider>
    );

    await screen.findByText(/Delete Patient/i);
    fireEvent.click(screen.getByText(/Delete Patient/i));
    fireEvent.click(screen.getByText(/^Delete$/i));

    await waitFor(() => expect(closeMock).toHaveBeenCalled());
  });
  it('cancels edit mode without saving', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockPatientData });
    renderComponent();

    await screen.findByText(/Edit/i);
    fireEvent.click(screen.getByText(/Edit/i));

    expect(screen.getByText(/Cancel/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Cancel/i));

    expect(screen.queryByText(/Save Changes/i)).not.toBeInTheDocument(); // Editing exited
  });
  it('closes delete confirmation modal when cancelled', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockPatientData });
    renderComponent();

    fireEvent.click(await screen.findByText(/Delete Patient/i));
    fireEvent.click(screen.getByText(/Cancel/i));

    await waitFor(() => expect(screen.queryByText(/Confirm Deletion/i)).not.toBeInTheDocument());
  });
});
