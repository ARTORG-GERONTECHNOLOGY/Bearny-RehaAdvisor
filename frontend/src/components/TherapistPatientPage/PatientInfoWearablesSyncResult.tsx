import React from 'react';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import { PatientPopupStore } from '@/stores/patientPopupStore';
import { Alert } from '@/components/ui/alert';

interface PatientInfoWearablesSyncResultProps {
  store: PatientPopupStore;
}

const PERIOD_LABEL: Record<string, string> = {
  baseline: 'sync_period_baseline',
  followup: 'sync_period_followup',
};

function PeriodRow({
  period,
  data,
  t,
}: {
  period: string;
  data: any;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const label = t(PERIOD_LABEL[period] ?? period);
  const status: string = data?.status ?? 'unknown';
  const skipReason: string | undefined = data?.skip_reason;

  let detail: React.ReactNode = null;

  if (status === 'skipped') {
    if (skipReason === 'future_window') {
      detail = t('skip_reason_future_window');
    } else if (skipReason === 'no_records') {
      detail = t('skip_reason_no_records');
    } else if (skipReason === 'no_valid_days') {
      detail = t('skip_reason_no_valid_days', {
        count: data.total_records_in_window ?? 0,
        hours: Math.round((data.wear_threshold_minutes ?? 600) / 60),
        activity: data.valid_activity_days ?? 0,
        sleep: data.valid_sleep_nights ?? 0,
      });
    } else if (skipReason === 'already_populated') {
      detail = t('skip_reason_already_populated', {
        event: data.redcap_event ?? '',
        start: data.existing_start ?? '',
      });
    }
  } else if (status === 'sent') {
    const parts: string[] = [];
    if (data.window) parts.push(`${t('sync_window')}: ${data.window}`);
    if (data.valid_activity_days != null)
      parts.push(`${t('sync_valid_activity_days')}: ${data.valid_activity_days}`);
    if (data.valid_sleep_nights != null)
      parts.push(`${t('sync_valid_sleep_nights')}: ${data.valid_sleep_nights}`);
    if (data.redcap_event) parts.push(`${t('REDCap')} event: ${data.redcap_event}`);
    detail = parts.join(' · ') || null;
  } else if (status?.startsWith('error')) {
    detail = data.detail ?? status;
  }

  return (
    <li className="py-0.5">
      <span className="font-medium">{label}:</span>{' '}
      <span className={status === 'sent' ? 'text-brand' : 'text-muted-foreground'}>
        {t(`sync_status_${status}`, { defaultValue: status })}
      </span>
      {detail && <span className="ms-2 text-sm text-muted-foreground">— {detail}</span>}
    </li>
  );
}

const PatientInfoWearablesSyncResult: React.FC<PatientInfoWearablesSyncResultProps> = observer(
  ({ store }) => {
    const { t } = useTranslation();

    if (!store.wearablesSyncPeriods) return null;

    return (
      <Alert
        variant="success"
        onClose={() => {
          store.wearablesSyncPeriods = null;
          store.wearablesSyncFirstDate = null;
        }}
        closeLabel={t('Close alert')}
        className="mb-3"
      >
        <strong>{t('Wearables synced to REDCap')}</strong>
        {store.wearablesSyncFirstDate && (
          <div className="text-sm text-muted-foreground mb-1">
            {t('sync_first_measurement_date')}: {store.wearablesSyncFirstDate}
          </div>
        )}
        <ul className="list-disc pl-6">
          {Object.entries(store.wearablesSyncPeriods).map(([period, data]) => (
            <PeriodRow key={period} period={period} data={data} t={t} />
          ))}
        </ul>
      </Alert>
    );
  }
);

export default PatientInfoWearablesSyncResult;
