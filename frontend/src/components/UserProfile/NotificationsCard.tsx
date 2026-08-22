import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';
import Card from '@/components/Card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/hooks/useNotifications';
import authStore from '@/stores/authStore';
import {
  notificationPreferencesStore,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABEL_KEYS,
} from '@/stores/notificationPreferencesStore';

const NotificationsCard: React.FC = observer(() => {
  const { t } = useTranslation();
  const {
    permission,
    supportsPush,
    isSubscribedOnThisDevice,
    deviceCheckComplete,
    enableOnThisDevice,
    pendingDeviceEnable,
    toggleCategory,
    toggleAll,
    pendingToggle,
  } = useNotifications();
  const patientId = authStore.getStoredUserId();
  const { preferences, error } = notificationPreferencesStore;

  useEffect(() => {
    if (patientId) {
      notificationPreferencesStore.fetchPreferences(patientId);
    }
  }, [patientId]);

  const allEnabled = NOTIFICATION_CATEGORIES.every((c) => preferences[c]);
  const anyEnabled = NOTIFICATION_CATEGORIES.some((c) => preferences[c]);
  const showDeviceHint =
    supportsPush &&
    permission !== 'denied' &&
    anyEnabled &&
    deviceCheckComplete &&
    !isSubscribedOnThisDevice;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <div className="text-sm font-medium text-zinc-500">{t('Notifications')}</div>
          <div className="font-bold text-lg leading-6 text-zinc-800">{t('Receive reminders')}</div>
          {permission === 'denied' && (
            <div className="text-nok text-xs">
              {t('Notification permission denied. Please enable in browser settings.')}
            </div>
          )}
          {!supportsPush && (
            <div className="text-amber-600 text-xs">
              {t('Push notifications are not supported in this browser.')}
            </div>
          )}
          {!!error && <div className="text-nok text-xs">{t(error)}</div>}
        </div>
        <Switch
          checked={allEnabled}
          disabled={pendingToggle}
          onCheckedChange={(value) => patientId && toggleAll(patientId, value)}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-2">
        {NOTIFICATION_CATEGORIES.map((category) => (
          <div key={category} className="flex items-center justify-between">
            <div className="text-sm text-zinc-700">
              {t(NOTIFICATION_CATEGORY_LABEL_KEYS[category])}
            </div>
            <Switch
              checked={preferences[category]}
              disabled={pendingToggle}
              onCheckedChange={(value) => patientId && toggleCategory(patientId, category, value)}
            />
          </div>
        ))}
      </div>

      {showDeviceHint && (
        <div className="flex flex-col gap-2">
          <Separator />
          <div className="flex flex-col gap-3">
            <div className="text-xs text-yellow">
              {t('Notifications are enabled on your account, but not on this device.')}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="dashboard"
              className="rounded-full"
              disabled={pendingDeviceEnable}
              onClick={() => patientId && enableOnThisDevice(patientId)}
            >
              {t('Enable on this device')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
});

export default NotificationsCard;
