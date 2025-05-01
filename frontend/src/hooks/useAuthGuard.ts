import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import authStore from '../stores/authStore';

const useAuthGuard = (requiredRole: string) => {
  const navigate = useNavigate();

  useEffect(() => {
    authStore.checkAuthentication();
    if (!authStore.isAuthenticated || authStore.userType !== requiredRole) {
      navigate('/unauthorized');
    }
  }, [navigate, requiredRole]);
};

export default useAuthGuard;
