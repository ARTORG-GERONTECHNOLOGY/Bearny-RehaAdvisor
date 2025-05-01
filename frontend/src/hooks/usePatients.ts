import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { PatientType } from '../types';

export const usePatients = (therapistId: string) => {
  const [patients, setPatients] = useState<PatientType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const response = await apiClient.get(`/therapists/${therapistId}/patients`);
        setPatients(response.data);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to fetch patients');
        }
      } finally {
        setLoading(false);
      }
    };

    if (therapistId) {
      fetchPatients();
    }
  }, [therapistId]);

  return { patients, loading, error };
};
