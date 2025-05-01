import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import { Intervention, RehabPlanResponse } from '../types';

export function usePatientInterventions(patientId: string | null) {
  const [patientData, setPatientData] = useState<RehabPlanResponse | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlan = async () => {
    if (!patientId) return;

    try {
      const res = await apiClient.get<RehabPlanResponse>(
        `patients/rehabilitation-plan/therapist/${patientId}/`
      );
      setPatientData(res.data);
    } catch (error) {
      console.error('Failed to fetch patient plan:', error);
    }
  };

  const fetchInterventions = async () => {
    try {
      const res = await apiClient.get<Intervention[]>('interventions/all/');
      setInterventions(res.data);
    } catch (error) {
      console.error('Failed to fetch interventions:', error);
    }
  };

  useEffect(() => {
    if (!patientId) {
      setLoading(false); // ← Add this
      return;
    }

    setLoading(true);
    Promise.all([fetchPlan(), fetchInterventions()]).finally(() => {
      setLoading(false);
    });
  }, [patientId]);

  return {
    patientData,
    interventions,
    loading,
    refetch: () => {
      fetchPlan();
      fetchInterventions();
    },
  };
}
