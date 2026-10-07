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
};

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

      <div className="grid grid-cols-2 gap-4 rounded-xl border bg-zinc-50 p-4 sm:grid-cols-[repeat(4,auto)] sm:justify-between">
        {error ? (
          <div className="col-span-full text-sm text-nok">{error}</div>
        ) : (
          data && (
            <>
              <div className="sm:border-r sm:pr-4">
                <div className="text-lg font-semibold tabular-nums">{data.total}</div>
                <div className="text-sm text-muted-foreground">{t('Total')}</div>
              </div>
              {roles.map(([role, label]) => (
                <div key={role}>
                  <div className="text-lg font-semibold tabular-nums">
                    {data.by_role?.[role] ?? 0}
                  </div>
                  <div className="text-sm text-muted-foreground">{label}</div>
                </div>
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
    </div>
  );
};

export default ActiveUsersCard;
