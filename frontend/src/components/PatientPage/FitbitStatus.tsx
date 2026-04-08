import React, { useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { patientFitbitStore } from '@/stores/patientFitbitStore';
import authStore from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import ConnectionIcon from '@/assets/icons/wifi-fill.svg?react';

const FITBIT_CLIENT_ID = import.meta.env.VITE_FITBIT_CLIENT_ID as string;
const FITBIT_REDIRECT_URI = import.meta.env.VITE_FITBIT_REDIRECT_URI as string;
const FITBIT_SCOPES =
  'activity heartrate respiratory_rate oxygen_saturation temperature electrocardiogram profile sleep';

const FitbitConnectButton: React.FC = observer(() => {
  const { t } = useTranslation();
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
    <a href={authUrl} className="no-underline">
      <Button>
        {t('Connect Fitbit')}
        <ConnectionIcon />
      </Button>
    </a>
  );
});

export default FitbitConnectButton;
