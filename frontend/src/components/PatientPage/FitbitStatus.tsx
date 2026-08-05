import React, { useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { patientFitbitStore } from '@/stores/patientFitbitStore';
import authStore from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import ConnectionIcon from '@/assets/icons/wifi-fill.svg?react';
import apiClient from '@/api/client';

const FITBIT_CLIENT_ID = import.meta.env.VITE_FITBIT_CLIENT_ID as string;
const FITBIT_REDIRECT_URI = import.meta.env.VITE_FITBIT_REDIRECT_URI as string;
const FITBIT_SCOPES =
  'activity heartrate respiratory_rate oxygen_saturation temperature electrocardiogram profile sleep';

const FitbitConnectButton: React.FC = observer(() => {
  const { t } = useTranslation();
  const patientId = useMemo(() => authStore.getStoredUserId(), []);

  useEffect(() => {
    if (!patientId) return;
    patientFitbitStore.fetchStatus(patientId);
  }, [patientId]);

  if (patientFitbitStore.connected === null) return null;

  if (patientFitbitStore.connected) {
    return (
      <Button variant="outline" onClick={() => patientFitbitStore.disconnect()}>
        {t('Disconnect Fitbit')}
      </Button>
    );
  }

  // Fetch a one-time CSRF nonce from the backend, then redirect to Fitbit.
  // prompt=login forces Fitbit to always show the account chooser, preventing
  // a previous patient's active browser session from being silently reused.
  const handleConnect = async () => {
    if (!patientId) return;
    let nonce = '';
    try {
      const res = await apiClient.get<{ nonce: string }>('/fitbit/auth-init/', {
        params: { patientId },
      });
      nonce = res.data.nonce;
    } catch {
      // If the nonce endpoint fails, abort — we must not fall back to a
      // non-nonce state value, as that would bypass CSRF protection.
      return;
    }

    const authUrl =
      `https://www.fitbit.com/oauth2/authorize?response_type=code` +
      `&client_id=${FITBIT_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(FITBIT_SCOPES)}` +
      `&state=${encodeURIComponent(`${nonce}:${patientId}`)}` +
      `&prompt=login` +
      `&expires_in=604800`;

    window.location.assign(authUrl);
  };

  return (
    <Button onClick={handleConnect}>
      {t('Connect Fitbit')}
      <ConnectionIcon />
    </Button>
  );
});

export default FitbitConnectButton;
