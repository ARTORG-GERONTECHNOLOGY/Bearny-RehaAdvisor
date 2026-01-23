// src/pages/patient-library/hooks/usePatientAuthGate.ts
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import authStore from '../stores/authStore';

export function usePatientAuthGate() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        await authStore.checkAuthentication();
      } finally {
        if (mounted) setAuthChecked(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!authChecked) return;

    if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
      navigate('/');
    }
  }, [authChecked, navigate]);

  return {
    authChecked,
    isAllowed: authChecked && authStore.isAuthenticated && authStore.userType === 'Patient',
  };
}
