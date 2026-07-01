import { useCallback, useEffect, useState } from 'react';
import apiClient from '@/api/client';

export interface PatientDetail {
  patient_code: string;
  first_name: string;
  name: string;
  age: string | number;
  sex: string;
  diagnosis: string[];
}

export const useTherapistPatientDetail = (patientId: string) => {
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPatient = useCallback(async () => {
    if (!patientId) {
      setPatient(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/users/${patientId}/profile`);
      setPatient(response.data);
    } catch {
      setPatient(null);
      setError('Failed to fetch patient');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchPatient();
  }, [fetchPatient]);

  return { patient, loading, error };
};
