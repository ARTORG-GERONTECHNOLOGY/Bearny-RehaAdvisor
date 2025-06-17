import React from 'react';
import { useLocation } from 'react-router-dom';

const SuccessPage: React.FC = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const message =
    queryParams.get('message') || 'Your Fitbit account has been successfully connected.';
  return (
    <div style={styles.container}>
      <h1 style={styles.success}>🎉 Success</h1>
      <p style={styles.message}>{message}</p>
      <p>You can now close this window.</p>
    </div>
  );
};

const styles = {
  container: { textAlign: 'center' as const, padding: '3rem', fontFamily: 'Arial, sans-serif' },
  success: { color: 'green', fontSize: '2rem' },
  message: { fontSize: '1.2rem', marginTop: '1rem' },
};

export default SuccessPage;
