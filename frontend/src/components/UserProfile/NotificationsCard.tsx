import { useTranslation } from 'react-i18next';
import Card from '@/components/Card';
import { Switch } from '@/components/ui/switch';
import { useNotifications } from '@/hooks/useNotifications';

export default function NotificationsCard() {
  const { t } = useTranslation();
  const { enabled, permission, supportsPeriodicSync, toggleNotifications } = useNotifications();

  return (
    <Card className="flex flex-col gap-1">
      <div className="text-sm font-medium text-zinc-500">{t('Notifications')}</div>
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <div className="font-bold text-lg leading-6 text-zinc-800">{t('Receive reminders')}</div>
          {permission === 'denied' && (
            <div className="text-nok text-xs">
              {t('Notification permission denied. Please enable in browser settings.')}
            </div>
          )}
          {!supportsPeriodicSync && (
            <div className="text-amber-600 text-xs">
              {t('Background notifications not supported in this browser.')}
            </div>
          )}
        </div>
        <Switch checked={enabled} onCheckedChange={toggleNotifications} />
      </div>
    </Card>
  );
}
