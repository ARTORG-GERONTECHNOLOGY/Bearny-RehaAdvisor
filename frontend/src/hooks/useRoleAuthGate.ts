// src/hooks/useRoleAuthGate.ts
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import authStore, { UserRole } from '@/stores/authStore';

// Checks auth once on mount, redirects away if the user isn't authenticated as `role`.
// Omit `role` to allow any authenticated role through (e.g. a shared profile page).
export function useRoleAuthGate(role?: UserRole, redirectTo = '/') {
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

    if (!authStore.isAuthenticated || (role && authStore.userType !== role)) {
      navigate(redirectTo);
    }
  }, [authChecked, role, redirectTo, navigate]);

  return {
    authChecked,
    isAllowed: authChecked && authStore.isAuthenticated && (!role || authStore.userType === role),
  };
}
