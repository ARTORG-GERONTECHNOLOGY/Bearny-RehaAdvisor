import React, { useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { patientFitbitStore } from '@/stores/patientFitbitStore';
import authStore from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import ConnectionIcon from '@/assets/icons/wifi-fill.svg?react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_HEALTH_CLIENT_ID as string;
const GOOGLE_REDIRECT_URI = import.meta.env.VITE_GOOGLE_HEALTH_REDIRECT_URI as string;
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
  'https://www.googleapis.com/auth/fitness.body.read',
  'https://www.googleapis.com/auth/fitness.blood_pressure.read',
].join(' ');

const GoogleHealthConnectButton: React.FC = observer(() => {
  const { t } = useTranslation();
  const patientId = useMemo(() => localStorage.getItem('id') || authStore.id, []);

  useEffect(() => {
    if (!patientId) return;
    patientFitbitStore.fetchStatus(patientId);
  }, [patientId]);

  if (patientFitbitStore.connected === null) return null;
  if (patientFitbitStore.connected) return null;

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?response_type=code` +
    `&client_id=${GOOGLE_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(GOOGLE_SCOPES)}` +
    `&state=${patientId}` +
    `&access_type=offline` +
    `&prompt=consent`;

  return (
    <a href={authUrl} className="no-underline">
      <Button>
        {t('Connect Google Health')}
        <ConnectionIcon />
      </Button>
    </a>
  );
});

export default GoogleHealthConnectButton;
