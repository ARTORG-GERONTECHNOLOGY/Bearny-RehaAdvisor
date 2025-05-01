// src/components/LogoutListener.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import authStore from './stores/authStore';

const LogoutListener = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Set the logout redirect callback when this component mounts
    authStore.setOnLogoutCallback(() => {
      navigate('/'); // Or '/login' depending on your route
    });
  }, [navigate]);

  return null; // This component doesn't render anything visually
};

export default LogoutListener;
