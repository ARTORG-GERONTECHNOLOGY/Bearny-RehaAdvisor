import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import WifiIcon from '@/assets/icons/wifi-fill.svg?react';
import { patientFitbitStore } from '@/stores/patientFitbitStore';
import authStore from '@/stores/authStore';
import { buildGoogleHealthAuthUrl } from '@/utils/googleHealthAuthUrl';
import { cn } from '@/lib/utils';

type Variant =
  | 'fitbitEnded'
  | 'notLinked'
  | 'noData'
  | 'stoppedSyncing'
  | 'hrSync'
  | 'hrScope'
  | 'sleepScope'
  | 'reconnect';

interface Banner {
  variant: Variant;
  show: boolean;
  title: string;
  titleArgs?: Record<string, unknown>;
  reason: string;
  action?: 'Reconnect' | 'Connect Google Health';
  setupUrl?: string;
}

// Google's sign-up page for creating a Google Health profile or moving a Fitbit account to Google.
const GOOGLE_HEALTH_SIGNUP_URL = 'https://fitbit.google.com/auth/signup';

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

  // Fitbit's API is gone, so Fitbit patients only get the switch to Google Health.
  const fitbitBanners: Banner[] = [
    {
      variant: 'fitbitEnded',
      show: true,
      title: 'fitbitEndedBannerTitle',
      reason: 'fitbitEndedBannerReason',
      action: 'Connect Google Health',
      setupUrl: GOOGLE_HEALTH_SIGNUP_URL,
    },
  ];
  // First match wins. noData, stoppedSyncing and hrSync are device-side problems, so reconnecting won't fix them.
  const googleHealthBanners: Banner[] = [
    {
      variant: 'notLinked',
      show: store.accountNotLinked === true,
      title: 'notLinkedBannerTitle',
      reason: 'notLinkedBannerReason',
      action: 'Reconnect',
      setupUrl: GOOGLE_HEALTH_SIGNUP_URL,
    },
    {
      variant: 'noData',
      // Only blame the device once both scopes are confirmed; an unknown scope could be the real cause.
      show: store.noDataEver === true && store.hrScopeOk === true && store.sleepScopeOk === true,
      title: 'noDataBannerTitle',
      reason: 'noDataBannerReason',
    },
    {
      // Before hrSync: a watch that sends nothing also sends no heart rate. A missing HR or sleep
      // scope doesn't stop steps, so it can't explain a full stop; its banner shows once data flows again.
      variant: 'stoppedSyncing',
      show: store.deviceStoppedSyncing === true,
      title: 'stoppedSyncingBannerTitle',
      titleArgs: { count: store.daysSinceDeviceData },
      reason: 'stoppedSyncingBannerReason',
    },
    {
      variant: 'hrSync',
      show: store.hrDataMissing === true,
      title: 'hrSyncBannerTitle',
      reason: 'hrSyncBannerReason',
    },
    {
      variant: 'hrScope',
      show: store.hrScopeOk === false,
      title: 'hrScopeBannerTitle',
      reason: 'hrScopeBannerReason',
      action: 'Reconnect',
    },
    {
      variant: 'sleepScope',
      show: store.sleepScopeOk === false,
      title: 'sleepScopeBannerTitle',
      reason: 'sleepScopeBannerReason',
      action: 'Reconnect',
    },
    {
      variant: 'reconnect',
      show: store.needsReconnect,
      title: expired ? 'reconnectBannerExpired' : 'reconnectBannerWarning',
      titleArgs: expired ? undefined : { count: days },
      reason: 'reconnectBannerReason',
      action: 'Reconnect',
    },
  ];
  // Until this patient's status has loaded, the store may still hold the previous patient's flags.
  const banners = !store.wearableDeviceLoaded
    ? []
    : store.wearableDevice === 'fitbit'
      ? fitbitBanners
      : store.wearableDevice === 'google_health'
        ? googleHealthBanners
        : [];
  const isDismissed = (v: Variant) =>
    dismissedNow === v || sessionStorage.getItem(DISMISS_KEY(patientId, v)) === '1';
  // A dismissed banner lets the next applicable one through.
  const banner = banners.find((b) => b.show && !isDismissed(b.variant));

  if (!banner) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY(patientId, banner.variant), '1');
    setDismissedNow(banner.variant);
  };

  const handleConnect = async () => {
    if (!patientId || reconnecting) return;
    setReconnecting(true);
    try {
      const authUrl = await buildGoogleHealthAuthUrl(patientId);
      window.location.href = authUrl;
    } catch {
      setReconnecting(false);
    }
  };

  return (
    <div
      className={cn(
        'relative p-4 rounded-3xl border border-yellow bg-yellow/10 flex flex-wrap items-center gap-3',
        className
      )}
    >
      <div className="shrink-0 w-10 h-10 rounded-full bg-yellow/20 flex items-center justify-center">
        <WifiIcon className="w-5 h-5 text-yellow" />
      </div>

      <div className="flex-1 min-w-48 break-words pr-6">
        <div className="font-bold text-sm text-zinc-800">{t(banner.title, banner.titleArgs)}</div>
        <div className="font-medium text-xs text-zinc-500 mt-0.5">{t(banner.reason)}</div>
      </div>

      {(banner.setupUrl || banner.action) && (
        <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:ml-auto sm:mr-6">
          {banner.setupUrl && (
            <Button
              asChild
              size="dashboard"
              variant="secondary"
              className="flex-1 sm:flex-none border-yellow text-zinc-800 rounded-2xl"
            >
              <a href={banner.setupUrl} target="_blank" rel="noopener noreferrer">
                {t('Set up Google Health')}
              </a>
            </Button>
          )}
          {banner.action && (
            <Button
              size="dashboard"
              className="flex-1 sm:flex-none bg-yellow hover:bg-yellow/90 text-white rounded-2xl"
              onClick={handleConnect}
              disabled={reconnecting}
            >
              {t(banner.action)}
            </Button>
          )}
        </div>
      )}
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors text-base leading-none"
      >
        ×
      </button>
    </div>
  );
});

export default ReconnectBanner;
