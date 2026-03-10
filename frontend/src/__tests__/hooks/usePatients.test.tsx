// src/__tests__/hooks/usePatients.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { usePatients } from '@/hooks/usePatients';
import apiClient from '@/api/client';
import type { PatientType } from '@/types';
import '@testing-library/jest-dom';
jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

const mockPatients: PatientType[] = [
  {
    username: 'jane.doe',
    _id: '1',
    first_name: 'Jane',
    name: 'Doe',
    age: '1980-01-01',
    sex: 'Female',
    duration: 120,
    diagnosis: ['Stroke'],
  },
  {
    username: 'john.smith',
    _id: '2',
    first_name: 'John',
    name: 'Smith',
    age: '1975-03-15',
    sex: 'Male',
    duration: 100,
    diagnosis: ['Parkinson'],
  },
];

const TestComponent = ({ therapistId }: { therapistId: string }) => {
  const { patients, loading, error } = usePatients(therapistId);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <ul>
      {patients.map((p) => (
        <li key={p._id}>{p.name}</li>
      ))}
    </ul>
  );
};

describe('usePatients (via TestComponent)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not fetch patients if no therapistId is provided', () => {
    render(<TestComponent therapistId="" />);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('fetches patients successfully', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: mockPatients });

    render(<TestComponent therapistId="therapist-123" />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Doe')).toBeInTheDocument();
      expect(screen.getByText('Smith')).toBeInTheDocument();
    });

    expect(apiClient.get).toHaveBeenCalledWith('/therapists/therapist-123/patients');
  });

  it('shows error message if API fails with Error object', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('Boom'));

    render(<TestComponent therapistId="therapist-123" />);

    await waitFor(() => {
      expect(screen.getByText('Error: Boom')).toBeInTheDocument();
    });
  });

  it('shows fallback error if non-error object is thrown', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce('just a string');

    render(<TestComponent therapistId="therapist-123" />);

    await waitFor(() => {
      expect(screen.getByText('Error: Failed to fetch patients')).toBeInTheDocument();
    });
  });
});
