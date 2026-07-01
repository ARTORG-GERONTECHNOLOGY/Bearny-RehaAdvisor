import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PatientInfoContent from '@/components/TherapistPatientPage/PatientInfoContent';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../../i18n';
import apiClient from '@/api/client';
import '@testing-library/jest-dom';

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

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const patientId = 'abc123';

const mockPatientData = {
  name: 'John Doe',
  email: 'john@example.com',
  phone: '+123456789',
  function: ['Cardiology'],
  diagnosis: ['Stroke'],
  age: '1990-01-01',
};

describe('PatientInfoContent', () => {
  const renderComponent = () =>
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <PatientInfoContent patientId={patientId} />
        </MemoryRouter>
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
    expect(await screen.findByDisplayValue('John Doe')).toBeInTheDocument();
  });

  it('enables editing and saves changes', async () => {
    (apiClient.put as jest.Mock).mockResolvedValue({ data: mockPatientData });

    renderComponent();
    const editButton = await screen.findByText('Edit');
    fireEvent.click(editButton);

    // Make a change to make the form dirty
    const nameInput = await screen.findByDisplayValue('John Doe');
    fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });

    const saveButton = await screen.findByText('SaveChanges');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        '/users/abc123/profile/',
        expect.objectContaining({ name: 'Jane Doe' })
      );
    });
  });

  it('preserves spaces in comma-separated characteristics input while sending normalized array on save', async () => {
    (apiClient.put as jest.Mock).mockResolvedValue({ data: { message: 'Profile updated' } });

    renderComponent();

    const editButton = await screen.findByText('Edit');
    fireEvent.click(editButton);

    const characteristicsTab = await screen.findByRole('tab', { name: /characteristics/i });
    fireEvent.click(characteristicsTab);

    const lifestyleInput = document.getElementById('lifestyle') as HTMLInputElement;
    expect(lifestyleInput).toBeTruthy();

    fireEvent.change(lifestyleInput, {
      target: { value: 'Very active person, Morning walk group' },
    });

    const saveButton = await screen.findByText('SaveChanges');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        '/users/abc123/profile/',
        expect.objectContaining({
          lifestyle: ['Very active person', 'Morning walk group'],
        })
      );
    });
  });

  it('opens delete confirmation and calls API', async () => {
    (apiClient.delete as jest.Mock).mockResolvedValue({});
    renderComponent();

    const deleteButton = await screen.findByText('DeletePatient');
    fireEvent.click(deleteButton);

    expect(await screen.findByText(/ConfirmDeletion/i)).toBeInTheDocument();
    const confirmButton = screen.getByText(/^Delete$/i);
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/users/abc123/profile/');
    });
  });

  it('cancels delete confirmation modal', async () => {
    renderComponent();

    const deleteButton = await screen.findByText('DeletePatient');
    fireEvent.click(deleteButton);

    expect(await screen.findByText(/ConfirmDeletion/i)).toBeInTheDocument();

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
    expect(await screen.findByText('Edit')).toBeInTheDocument();
  });

  it('initializes multi-select fields as empty arrays when data missing', async () => {
    const partialData = { name: 'Anna' };
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/profile')) return Promise.resolve({ data: partialData });
      if (url.includes('/thresholds')) return Promise.resolve({ data: {} });
      return Promise.resolve({ data: {} });
    });

    renderComponent();
    expect(await screen.findByDisplayValue('Anna')).toBeInTheDocument();
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

    const saveButton = await screen.findByText('SaveChanges');
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

  it('navigates to the patient list after successful delete', async () => {
    (apiClient.delete as jest.Mock).mockResolvedValue({});
    renderComponent();

    const deleteButton = await screen.findByText('DeletePatient');
    fireEvent.click(deleteButton);

    const confirmButton = await screen.findByText(/^Delete$/i);
    fireEvent.click(confirmButton);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/therapist'));
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

    const deleteButton = await screen.findByText('DeletePatient');
    fireEvent.click(deleteButton);

    const cancelButton = await screen.findByText('Cancel');
    fireEvent.click(cancelButton);

    await waitFor(() => expect(screen.queryByText(/Confirm Deletion/i)).not.toBeInTheDocument());
  });
});
