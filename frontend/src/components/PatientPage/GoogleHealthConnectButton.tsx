import React, { useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { patientFitbitStore } from '@/stores/patientFitbitStore';
import authStore from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import ConnectionIcon from '@/assets/icons/wifi-fill.svg?react';
import { buildGoogleHealthAuthUrl } from '@/utils/googleHealthAuthUrl';

const GoogleHealthConnectButton: React.FC = observer(() => {
  const { t } = useTranslation();
  const patientId = useMemo(() => localStorage.getItem('id') || authStore.id, []);

  useEffect(() => {
    if (!patientId) return;
    patientFitbitStore.fetchStatus(patientId);
  }, [patientId]);

  if (patientFitbitStore.connected === null) return null;
  if (patientFitbitStore.connected) return null;

  const authUrl = buildGoogleHealthAuthUrl(patientId ?? '');

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
