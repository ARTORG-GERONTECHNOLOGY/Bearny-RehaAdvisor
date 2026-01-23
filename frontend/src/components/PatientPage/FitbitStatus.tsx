import React, { useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { patientFitbitStore } from '../../stores/patientFitbitStore';
import authStore from '../../stores/authStore';

const FITBIT_CLIENT_ID = '23QHGK';
const FITBIT_REDIRECT_URI = 'https://dev.reha-advisor.ch/api/fitbit/callback/';
const FITBIT_SCOPES =
  'activity heartrate respiratory_rate oxygen_saturation temperature electrocardiogram profile sleep';

const FitbitConnectButton: React.FC = observer(() => {
  const patientId = useMemo(() => localStorage.getItem('id') || authStore.id, []);

  useEffect(() => {
    if (!patientId) return;
    patientFitbitStore.fetchStatus(patientId);
  }, [patientId]);

  if (patientFitbitStore.connected === null) return null;
  if (patientFitbitStore.connected) return null;

  const authUrl =
    `https://www.fitbit.com/oauth2/authorize?response_type=code` +
    `&client_id=${FITBIT_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(FITBIT_SCOPES)}` +
    `&state=${patientId}` +
    `&expires_in=604800`;

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
});

export default FitbitConnectButton;
