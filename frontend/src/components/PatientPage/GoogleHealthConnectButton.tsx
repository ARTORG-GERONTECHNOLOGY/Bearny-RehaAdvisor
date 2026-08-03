import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { patientFitbitStore } from '@/stores/patientFitbitStore';
import authStore from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import ConnectionIcon from '@/assets/icons/wifi-fill.svg?react';
import { buildGoogleHealthAuthUrl } from '@/utils/googleHealthAuthUrl';

const GoogleHealthConnectButton: React.FC = observer(() => {
  const { t } = useTranslation();
  const patientId = useMemo(() => authStore.getStoredUserId(), []);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    patientFitbitStore.fetchStatus(patientId);
  }, [patientId]);

  if (patientFitbitStore.connected === null) return null;
  if (patientFitbitStore.connected) return null;

  const handleConnect = async () => {
    if (!patientId || connecting) return;
    setConnecting(true);
    try {
      const authUrl = await buildGoogleHealthAuthUrl(patientId);
      window.location.href = authUrl;
    } catch {
      setConnecting(false);
    }
  };

  return (
    <Button onClick={handleConnect} disabled={connecting}>
      {t('Connect Google Health')}
      <ConnectionIcon />
    </Button>
  );
});

export default GoogleHealthConnectButton;
