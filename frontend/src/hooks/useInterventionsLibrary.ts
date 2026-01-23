// src/pages/patient-library/hooks/useInterventionsLibrary.ts
import { useCallback, useState } from 'react';
import apiClient from '../api/client';
import type { InterventionTypeTh } from '../types';

export function useInterventionsLibrary() {
  const [items, setItems] = useState<InterventionTypeTh[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const fetchLibrary = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await apiClient.get<InterventionTypeTh[]>('interventions/all/');
      const arr = Array.isArray(res.data) ? res.data : [];
      // Safety: patients should not see private interventions
      const visible = arr.filter((x) => !x.is_private);
      setItems(visible);
    } catch (e) {
      console.error('Error fetching interventions:', e);
      setError('Error fetching recommendations. Please try again later.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { items, setItems, loading, error, setError, fetchLibrary };
}
