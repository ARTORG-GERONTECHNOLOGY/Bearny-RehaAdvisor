import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import WifiIcon from '@/assets/icons/wifi-fill.svg?react';
import { patientFitbitStore } from '@/stores/patientFitbitStore';
import authStore from '@/stores/authStore';
import { buildFitbitAuthUrl } from '@/utils/fitbitAuthUrl';
import { buildGoogleHealthAuthUrl } from '@/utils/googleHealthAuthUrl';
import { cn } from '@/lib/utils';

type Variant = 'noData' | 'hrSync' | 'hrScope' | 'sleepScope' | 'reconnect';

interface Banner {
  variant: Variant;
  show: boolean;
  title: string;
  titleArgs?: Record<string, unknown>;
  reason: string;
  canReconnect: boolean;
}

// One key per variant so dismissing one banner doesn't hide another; 'reconnect' is unsuffixed for back-compat with existing dismiss flags.
const DISMISS_KEY = (id: string, variant: Variant) =>
  variant === 'reconnect'
    ? `reconnect_banner_dismissed_${id}`
    : `reconnect_banner_dismissed_${id}_${variant}`;

const ReconnectBanner: React.FC<{ className?: string }> = observer(({ className }) => {
  const { t } = useTranslation();
  const patientId = authStore.getStoredUserId();
  const [dismissedNow, setDismissedNow] = useState<Variant | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const store = patientFitbitStore;
  const days = store.daysUntilExpiry;
  const expired = days === 0 || days === null;

  // First match wins. noData and hrSync are device-side problems, so reconnecting won't fix them.
  const banners: Banner[] = [
    {
      variant: 'noData',
      // Only blame the device once both scopes are confirmed; an unknown scope could be the real cause.
      show: store.noDataEver === true && store.hrScopeOk === true && store.sleepScopeOk === true,
      title: 'noDataBannerTitle',
      reason: 'noDataBannerReason',
      canReconnect: false,
    },
    {
      variant: 'hrSync',
      show: store.hrDataMissing === true,
      title: 'hrSyncBannerTitle',
      reason: 'hrSyncBannerReason',
      canReconnect: false,
    },
    {
      variant: 'hrScope',
      show: store.hrScopeOk === false,
      title: 'hrScopeBannerTitle',
      reason: 'hrScopeBannerReason',
      canReconnect: true,
    },
    {
      variant: 'sleepScope',
      show: store.sleepScopeOk === false,
      title: 'sleepScopeBannerTitle',
      reason: 'sleepScopeBannerReason',
      canReconnect: true,
    },
    {
      variant: 'reconnect',
      show: store.needsReconnect,
      title: expired ? 'reconnectBannerExpired' : 'reconnectBannerWarning',
      titleArgs: expired ? undefined : { count: days },
      reason: 'reconnectBannerReason',
      canReconnect: true,
    },
  ];
  const isDismissed = (v: Variant) =>
    dismissedNow === v || sessionStorage.getItem(DISMISS_KEY(patientId, v)) === '1';
  // A dismissed banner lets the next applicable one through.
  const banner = banners.find((b) => b.show && !isDismissed(b.variant));

  if (!banner) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY(patientId, banner.variant), '1');
    setDismissedNow(banner.variant);
  };

  const handleReconnect = async () => {
    if (!patientId || reconnecting) return;
    setReconnecting(true);
    try {
      const buildAuthUrl =
        store.wearableDevice === 'google_health' ? buildGoogleHealthAuthUrl : buildFitbitAuthUrl;
      const authUrl = await buildAuthUrl(patientId);
      window.location.href = authUrl;
    } catch {
      setReconnecting(false);
    }
  };

  return (
    <div
      className={cn(
        'p-4 rounded-3xl border border-yellow bg-yellow/10 flex flex-wrap items-center gap-3',
        className
      )}
    >
      <div className="shrink-0 w-10 h-10 rounded-full bg-yellow/20 flex items-center justify-center">
        <WifiIcon className="w-5 h-5 text-yellow" />
      </div>

      <div className="flex-1 min-w-48 break-words">
        <div className="font-bold text-sm text-zinc-800">{t(banner.title, banner.titleArgs)}</div>
        <div className="font-medium text-xs text-zinc-500 mt-0.5">{t(banner.reason)}</div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {banner.canReconnect && (
          <Button
            size="dashboard"
            className="bg-yellow hover:bg-yellow/90 text-white rounded-2xl"
            onClick={handleReconnect}
            disabled={reconnecting}
          >
            {t('Reconnect')}
          </Button>
        )}
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
