import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import WifiIcon from '@/assets/icons/wifi-fill.svg?react';
import { patientFitbitStore } from '@/stores/patientFitbitStore';
import authStore from '@/stores/authStore';
import { buildGoogleHealthAuthUrl } from '@/utils/googleHealthAuthUrl';

const DISMISS_KEY = (id: string) => `reconnect_banner_dismissed_${id}`;

const ReconnectBanner: React.FC = observer(() => {
  const { t } = useTranslation();
  const patientId = localStorage.getItem('id') || authStore.id || '';
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY(patientId)) === '1'
  );

  if (dismissed || !patientFitbitStore.needsReconnect) return null;

  const days = patientFitbitStore.daysUntilExpiry;
  const expired = days === 0 || days === null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY(patientId), '1');
    setDismissed(true);
  };

  return (
    <div className="p-4 rounded-3xl border border-yellow bg-yellow/10 flex items-center gap-3">
      <div className="shrink-0 w-10 h-10 rounded-full bg-yellow/20 flex items-center justify-center">
        <WifiIcon className="w-5 h-5 text-yellow" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm text-zinc-800">
          {expired ? t('reconnectBannerExpired') : t('reconnectBannerWarning', { count: days })}
        </div>
        <div className="font-medium text-xs text-zinc-500 mt-0.5">
          {t('reconnectBannerReason')}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <a href={buildGoogleHealthAuthUrl(patientId)}>
          <Button size="sm" className="bg-yellow hover:bg-yellow/90 text-white rounded-2xl">
            {t('Reconnect')}
          </Button>
        </a>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="w-6 h-6 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors text-base leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
});

export default ReconnectBanner;
