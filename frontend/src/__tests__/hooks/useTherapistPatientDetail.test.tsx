// src/__tests__/hooks/useTherapistPatientDetail.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { useTherapistPatientDetail } from '@/hooks/useTherapistPatientDetail';
import apiClient from '@/api/client';
import type { PatientDetail } from '@/hooks/useTherapistPatientDetail';
import '@testing-library/jest-dom';
jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

const mockPatient: PatientDetail = {
  patient_code: 'P-001',
  first_name: 'Jane',
  name: 'Doe',
  age: '45',
  sex: 'Female',
  diagnosis: ['Stroke'],
};

const TestComponent = ({ patientId }: { patientId: string }) => {
  const { patient, loading, error } = useTherapistPatientDetail(patientId);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;

  return <p>{patient ? `${patient.first_name} ${patient.name}` : 'No patient'}</p>;
};

describe('useTherapistPatientDetail (via TestComponent)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not fetch when no patientId is provided', () => {
    render(<TestComponent patientId="" />);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('fetches patient successfully', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: mockPatient });

    render(<TestComponent patientId="patient-123" />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    expect(apiClient.get).toHaveBeenCalledWith('/users/patient-123/profile');
  });

  it('shows generic error message if API fails with Error object', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('Boom'));

    render(<TestComponent patientId="patient-123" />);

    await waitFor(() => {
      expect(screen.getByText('Error: Failed to fetch patient')).toBeInTheDocument();
    });
  });

  it('shows fallback error if non-error object is thrown', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce('just a string');

    render(<TestComponent patientId="patient-123" />);

    await waitFor(() => {
      expect(screen.getByText('Error: Failed to fetch patient')).toBeInTheDocument();
    });
  });

  it('refetches when patientId changes', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: mockPatient });

    const { rerender } = render(<TestComponent patientId="patient-123" />);
    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    const otherPatient: PatientDetail = { ...mockPatient, first_name: 'John', name: 'Smith' };
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: otherPatient });

    rerender(<TestComponent patientId="patient-456" />);

    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });

    expect(apiClient.get).toHaveBeenCalledWith('/users/patient-456/profile');
  });
});
