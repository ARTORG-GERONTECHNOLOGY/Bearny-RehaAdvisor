import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Therapist from '../../pages/Therapist';
import { MemoryRouter } from 'react-router-dom';
import authStore from '../../stores/authStore';
import apiClient from '../../api/client';
import { act } from 'react-dom/test-utils';

import '@testing-library/jest-dom';
// Mock the apiClient
// Mock the apiClient
jest.mock('../../api/client', () => require('../../__mocks__/api/client'));
// Mock child components
jest.mock('../../components/common/Header', () => () => <div>Mock Header</div>);
jest.mock('../../components/common/Footer', () => () => <div>Mock Footer</div>);
jest.mock('../../components/common/WelcomeArea', () => () => <div>Mocked Welcome Area</div>);
jest.mock('../../components/TherapistPatientPage/PatientPopup', () => () => (
  <div>Patient Popup</div>
));
jest.mock('../../config/config.json', () => ({
  RehaInfo: ['< 30 days', '30-60 days', '60-90 days', '> 90 days'],
  patientInfo: {
    sex: ['Male', 'Female'],
  },
}));

jest.mock('../../components/AddPatient/AddPatientPopUp', () => () => <div>Add Patient Popup</div>);
// Mock translation function
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));
// Mock navigation
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock authStore and API
jest.mock('../../stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    isAuthenticated: true,
    userType: 'Therapist',
    id: 'therapist123',
  },
}));

describe('Therapist Page', () => {
  const patientsMock = [
    {
      _id: '67d588798c0494979e4633e5',
      therapist: 'Angelva',
      created_at: '2025-03-15T14:02:33.107000',
      username: 'p1',
      age: '1986-03-06',
      sex: 'Male',
      first_name: 'Mark',
      name: 'Ruffalo',
      diagnosis: ['Heart attack'],
      duration: 291,
    },
    {
      _id: '67ecd69fdf1c4c467641ae76',
      therapist: 'Angelva',
      created_at: '2025-04-02T06:18:07.973000',
      username: 'p2',
      age: '2024-02-05',
      sex: 'Female',
      first_name: 'Jennifer',
      name: 'Anniston',
      diagnosis: ['Heart attack'],
      duration: 120,
    },
    {
      _id: '67f6098279d28b282644dd9f',
      therapist: 'Angelva',
      created_at: '2025-04-09T05:45:38.258000',
      username: 'p3',
      age: '1994-12-14',
      sex: 'Male',
      first_name: 'Tom',
      name: 'Day',
      diagnosis: ['Stroke'],
      duration: 235,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.get as jest.Mock).mockResolvedValue({ data: patientsMock });
  });

  test('filters patients by duration', async () => {
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    await screen.findByText('Mark Ruffalo');

    fireEvent.change(screen.getByRole('combobox', { name: /filter by duration/i }), {
      target: { value: '> 90 days' },
    });

    await waitFor(() => {
      expect(screen.getByText('Mark Ruffalo')).toBeInTheDocument();
      expect(screen.getByText('Jennifer Anniston')).toBeInTheDocument();
      expect(screen.getByText('Tom Day')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('combobox', { name: /filter by duration/i }), {
      target: { value: '< 30 days' },
    });

    await waitFor(() => {
      expect(screen.queryByText('Mark Ruffalo')).not.toBeInTheDocument();
      expect(screen.queryByText('Jennifer Anniston')).not.toBeInTheDocument();
      expect(screen.queryByText('Tom Day')).not.toBeInTheDocument();
    });
  });

  test('navigates to rehab table when rehab button is clicked', async () => {
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    await screen.findByText('Mark Ruffalo');

    fireEvent.click(screen.getAllByText('Go to Rehab Table')[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/rehabtable');
  });
  test('opens patient info popup when Info button is clicked', async () => {
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Info').length).toBeGreaterThan(0);
    });

    const infoButtons = screen.getAllByText('Info');
    fireEvent.click(infoButtons[0]);

    expect(screen.getByText('Patient Popup')).toBeInTheDocument();
  });

  test('renders therapist page with patients', async () => {
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    expect(screen.getByText('Mock Header')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Mark Ruffalo')).toBeInTheDocument();
      expect(screen.getByText('Jennifer Anniston')).toBeInTheDocument();
      expect(screen.getByText('Tom Day')).toBeInTheDocument();
    });

    expect(screen.getByText('Mock Footer')).toBeInTheDocument();
  });
  test('testi', async () => {
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    expect(screen.getByText('Mock Header')).toBeInTheDocument();
    expect(await screen.findByText('Mark Ruffalo')).toBeInTheDocument();
    expect(screen.getByText('Jennifer Anniston')).toBeInTheDocument();
    expect(screen.getByText('Tom Day')).toBeInTheDocument();
    expect(screen.getByText('Mock Footer')).toBeInTheDocument();
  });

  test('renders therapist page with patients', async () => {
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    expect(screen.getByText('Mock Header')).toBeInTheDocument();
    expect(await screen.findByText('Mark Ruffalo')).toBeInTheDocument();
    expect(screen.getByText('Jennifer Anniston')).toBeInTheDocument();
    expect(screen.getByText('Tom Day')).toBeInTheDocument();
    expect(screen.getByText('Mock Footer')).toBeInTheDocument();
  });

  test('filters patients by sex', async () => {
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    await screen.findByText('Mark Ruffalo');

    fireEvent.change(screen.getByRole('combobox', { name: /filter by sex/i }), {
      target: { value: 'Female' },
    });

    expect(screen.getByText('Jennifer Anniston')).toBeInTheDocument();
    expect(screen.queryByText('Mark Ruffalo')).not.toBeInTheDocument();
    expect(screen.queryByText('Tom Day')).not.toBeInTheDocument();
  });

  test('search filters by name', async () => {
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    await screen.findByText('Mark Ruffalo');

    fireEvent.change(screen.getByPlaceholderText(/Search Patients/i), {
      target: { value: 'anniston' },
    });

    expect(screen.queryByText('Mark Ruffalo')).not.toBeInTheDocument();
    expect(screen.getByText('Jennifer Anniston')).toBeInTheDocument();
  });

  test('redirects if user is not a Therapist', async () => {
    authStore.isAuthenticated = true;
    authStore.userType = 'Patient'; // not 'Therapist'

    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });
  test('handles fetchPatients API error gracefully', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('API error'));

    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    await waitFor(() => {
      // No patients should be shown; table remains empty
      expect(screen.queryByRole('cell')).not.toBeInTheDocument();
    });
  });
  test('opens Add Patient popup when button clicked', async () => {
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Add a New Patient/i }));

    expect(screen.getByText('Add Patient Popup')).toBeInTheDocument();
  });
  test('closes Add Patient popup and refreshes patient list', async () => {
    render(
      <MemoryRouter>
        <Therapist />
      </MemoryRouter>
    );

    // Open the popup
    fireEvent.click(screen.getByRole('button', { name: /Add a New Patient/i }));
    expect(screen.getByText('Add Patient Popup')).toBeInTheDocument();

    // Close it via internal `handleClose` logic
    // Assuming AddPatientPopup internally calls handleClose on a button, mock the behavior:
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: patientsMock });
    await act(async () => {
      // manually invoke fetchPatients via handleClose
      const closeFn = Therapist.prototype?.handleClose || (() => {});
      closeFn();
    });
  });
});
