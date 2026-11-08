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

const COPY: Record<Exclude<Variant, 'reconnect'>, { title: string; reason: string }> = {
  noData: { title: 'noDataBannerTitle', reason: 'noDataBannerReason' },
  hrSync: { title: 'hrSyncBannerTitle', reason: 'hrSyncBannerReason' },
  hrScope: { title: 'hrScopeBannerTitle', reason: 'hrScopeBannerReason' },
  sleepScope: { title: 'sleepScopeBannerTitle', reason: 'sleepScopeBannerReason' },
};

// Per-variant key so dismissing one problem doesn't hide a different one later in the session.
const DISMISS_KEY = (id: string, variant: Variant) =>
  variant === 'reconnect'
    ? `reconnect_banner_dismissed_${id}`
    : `reconnect_banner_dismissed_${id}_${variant}`;

const ReconnectBanner: React.FC<{ className?: string }> = observer(({ className }) => {
  const { t } = useTranslation();
  const patientId = authStore.getStoredUserId();
  const [dismissedNow, setDismissedNow] = useState<Variant | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const hrScopeMissing = patientFitbitStore.hrScopeOk === false;
  const hrDataMissing = patientFitbitStore.hrDataMissing === true;
  const sleepScopeMissing = patientFitbitStore.sleepScopeOk === false;
  // Only blame the device once both scopes are confirmed; an unknown scope could be the real cause.
  const noDataEver =
    patientFitbitStore.noDataEver === true &&
    patientFitbitStore.hrScopeOk === true &&
    patientFitbitStore.sleepScopeOk === true;

  const variant: Variant | null = noDataEver
    ? 'noData'
    : hrDataMissing
      ? 'hrSync'
      : hrScopeMissing
        ? 'hrScope'
        : sleepScopeMissing
          ? 'sleepScope'
          : patientFitbitStore.needsReconnect
            ? 'reconnect'
            : null;

  if (
    !variant ||
    dismissedNow === variant ||
    sessionStorage.getItem(DISMISS_KEY(patientId, variant)) === '1'
  )
    return null;

  const days = patientFitbitStore.daysUntilExpiry;
  const expired = days === 0 || days === null;
  const title =
    variant !== 'reconnect'
      ? t(COPY[variant].title)
      : expired
        ? t('reconnectBannerExpired')
        : t('reconnectBannerWarning', { count: days });
  const reason = variant !== 'reconnect' ? t(COPY[variant].reason) : t('reconnectBannerReason');
  // These two are device-side problems; reconnecting won't fix them.
  const canReconnect = variant !== 'noData' && variant !== 'hrSync';

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY(patientId, variant), '1');
    setDismissedNow(variant);
  };

  const handleReconnect = async () => {
    if (!patientId || reconnecting) return;
    setReconnecting(true);
    try {
      const buildAuthUrl =
        patientFitbitStore.wearableDevice === 'google_health'
          ? buildGoogleHealthAuthUrl
          : buildFitbitAuthUrl;
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
        <div className="font-bold text-sm text-zinc-800">{title}</div>
        <div className="font-medium text-xs text-zinc-500 mt-0.5">{reason}</div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {canReconnect && (
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
