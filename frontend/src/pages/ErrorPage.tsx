import React from 'react';
import { useLocation } from 'react-router-dom';

const ErrorPage: React.FC = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const message = queryParams.get('message') || 'There was a problem connecting your Fitbit account. Please try again.';
  return (
    <div style={styles.container}>
      <h1 style={styles.error}>⚠️ Error</h1>
      <p style={styles.message}>{message}</p>
      <p>Please close this window and try again.</p>
    </div>
  );
};

const styles = {
  container: { textAlign: 'center' as const, padding: '3rem', fontFamily: 'Arial, sans-serif' },
  error: { color: 'red', fontSize: '2rem' },
  message: { fontSize: '1.2rem', marginTop: '1rem' },
};

export default ErrorPage;