// src/__tests__/hooks/usePatientInterventions.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { usePatientInterventions } from '../../hooks/usePatientInterventions';
import apiClient from '../../api/client';
import '@testing-library/jest-dom';
import { renderHook, act } from '@testing-library/react';
jest.mock('../../api/client', () => require('../../__mocks__/api/client'));
import type { RehabPlanResponse, Intervention } from '../../types';

const MockComponent = ({ patientId }: { patientId: string }) => {
  const { patientData, interventions, loading } = usePatientInterventions(patientId);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <p>Intervention Count: {interventions.length}</p>
      <p>Plan Status: {patientData?.status}</p>
    </div>
  );
};

const mockPlanData: RehabPlanResponse = {
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  status: 'active',
  createdAt: '',
  updatedAt: '',
  interventions: [],
};

const mockInterventions: Intervention[] = [
  {
    _id: 'i1',
    title: 'Stretch',
    description: 'Basic stretch',
    content_type: 'video',
    tags: [],
    benefitFor: [],
    patient_types: [],
  },
];

describe('usePatientInterventions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches and displays data', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('rehabilitation-plan')) {
        return Promise.resolve({ data: { status: 'active', interventions: [] } });
      }
      if (url.includes('interventions/all')) {
        return Promise.resolve({
          data: [
            {
              _id: '1',
              title: 'Stretching',
              description: 'Stretch description',
              content_type: 'Video',
              tags: [],
              benefitFor: [],
              patient_types: [],
            },
          ],
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });

    render(<MockComponent patientId="123" />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Intervention Count/i)).toHaveTextContent('Intervention Count: 1');
      expect(screen.getByText(/Plan Status/i)).toHaveTextContent('Plan Status: active');
    });
  });

  it('handles API errors gracefully', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('API error'));

    render(<MockComponent patientId="123" />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText(/Intervention Count/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Plan Status/i)).not.toBeInTheDocument();
    });
  });

  it('fetches rehab plan and interventions on refetch', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: mockPlanData }) // initial plan fetch
      .mockResolvedValueOnce({ data: mockInterventions }) // initial interventions fetch
      .mockResolvedValueOnce({ data: mockPlanData }) // refetch plan
      .mockResolvedValueOnce({ data: mockInterventions }); // refetch interventions

    const { result } = renderHook(() => usePatientInterventions('patient-123'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // 🔁 Call refetch
    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledTimes(4);
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      'patients/rehabilitation-plan/therapist/patient-123/'
    );
    expect(apiClient.get).toHaveBeenCalledWith('interventions/all/');
  });
  it('does nothing when patientId is null', async () => {
    const { result } = renderHook(() => usePatientInterventions(null));

    expect(result.current.loading).toBe(false);

    // Wait for effect to settle
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.patientData).toBeNull();
    expect(result.current.interventions).toEqual([]);
  });
});
