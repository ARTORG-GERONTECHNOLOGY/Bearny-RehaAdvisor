import React, { useEffect, useState } from 'react';
import apiClient from '../../api/client'; // ✅ Adjust path as needed

const FITBIT_CLIENT_ID = '23QHGK';
const FITBIT_REDIRECT_URI = 'https://dev.reha-advisor.ch/api/fitbit/callback/';
const FITBIT_SCOPES =
  'activity heartrate respiratory_rate oxygen_saturation temperature electrocardiogram profile sleep';

const FitbitConnectButton: React.FC = () => {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const userId = localStorage.getItem('id');
        const { data: res } = await apiClient.get(`/fitbit/status/${userId}/`);
        setConnected(res.connected);
      } catch (error) {
        console.error('Error fetching Fitbit connection status:', error);
      }
    };

    fetchStatus();
  }, []);

  if (connected === null) return null; // optional: render spinner
  if (connected) return null; // hide button if already connected
  const patientId = localStorage.getItem('id');
  const authUrl = `https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=${FITBIT_CLIENT_ID}&redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}&scope=${encodeURIComponent(FITBIT_SCOPES)}&state=${patientId}&expires_in=604800`;

  return (
    <a href={authUrl}>
      <button
        type="button"
        style={{
          background: '#00B0B9',
          color: 'white',
          padding: '0.5rem 1rem',
          borderRadius: 5,
          border: 'none',
        }}
      >
        Connect Fitbit
      </button>
    </a>
  );
};

export default FitbitConnectButton;
