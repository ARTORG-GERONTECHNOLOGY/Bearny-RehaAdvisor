import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import apiClient from '@/api/client';
import { Button } from '@/components/ui/button';
import { formatLocaleDateTime } from '@/utils/dateFormat';

export type ActiveUsers = {
  as_of: string;
  window_minutes: number;
  total: number;
  by_role: Record<string, number>;
  registered?: {
    total: number;
    by_role: Record<string, number>;
    inactive: number;
  };
};

const Stat: React.FC<{ value: number; label: string; className?: string }> = ({
  value,
  label,
  className,
}) => (
  <div className={className}>
    <div className="text-lg font-semibold tabular-nums">{value}</div>
    <div className="text-sm text-muted-foreground">{label}</div>
  </div>
);

const ActiveUsersCard: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<ActiveUsers | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<ActiveUsers>('/admin/analytics/active-users/');
      setData(res.data);
    } catch {
      setError(t('Failed to load active users.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const roles: [string, string][] = [
    ['Patient', t('Patients')],
    ['Therapist', t('Therapists')],
    ['Admin', t('Admins')],
  ];

  if (!data && !error) return null;

  // Hidden on error so stale totals never sit under the error message.
  const registered = error ? undefined : data?.registered;

  return (
    <div className="mt-6 mb-4 max-w-[480px]" data-testid="active-users">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h5 className="text-base font-semibold">
          {t('Active in the last {{minutes}} min', { minutes: data?.window_minutes ?? 15 })}
        </h5>
        <Button
          size="dashboard"
          variant="secondary"
          className="-my-1.5"
          onClick={load}
          disabled={loading}
        >
          {t('Refresh')}
        </Button>
      </div>

      <div
        className="grid grid-cols-2 gap-4 rounded-xl border bg-zinc-50 p-4 sm:grid-cols-[repeat(4,auto)] sm:justify-between"
        data-testid="active-counts"
      >
        {error ? (
          <div className="col-span-full text-sm text-nok">{error}</div>
        ) : (
          data && (
            <>
              <Stat value={data.total} label={t('Total')} className="sm:border-r sm:pr-4" />
              {roles.map(([role, label]) => (
                <Stat key={role} value={data.by_role?.[role] ?? 0} label={label} />
              ))}
            </>
          )
        )}
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {data && <span>{t('As of {{time}}', { time: formatLocaleDateTime(data.as_of) })} · </span>}
        <span>
          {t(
            'Counts only users who did something that is logged, such as opening a patient or completing an exercise.'
          )}
        </span>
      </p>

      {registered && (
        <div className="mt-6" data-testid="registered-accounts">
          <h5 className="mb-3 text-base font-semibold">{t('Registered accounts')}</h5>
          <div className="grid grid-cols-2 gap-4 rounded-xl border bg-zinc-50 p-4 sm:grid-cols-[repeat(4,auto)] sm:justify-between">
            <Stat value={registered.total} label={t('Total')} className="sm:border-r sm:pr-4" />
            {roles.map(([role, label]) => (
              <Stat key={role} value={registered.by_role?.[role] ?? 0} label={label} />
            ))}
          </div>
          <p className="mt-2 text-sm text-muted-foreground" data-testid="inactive-accounts">
            {t('inactiveAccountsCount', {
              count: registered.inactive,
            })}
          </p>
        </div>
      )}
    </div>
  );
};

export default ActiveUsersCard;
