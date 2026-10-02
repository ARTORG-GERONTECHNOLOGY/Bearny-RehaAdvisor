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

  return (
    <div className="my-4 rounded-xl border bg-zinc-50 p-4 max-w-[480px]" data-testid="active-users">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h5 className="text-base font-semibold">{t('Active in the last 15 min')}</h5>
          {data && (
            <div className="text-xs text-muted-foreground">
              {t('As of {{time}}', { time: formatLocaleDateTime(data.as_of) })}
            </div>
          )}
        </div>
        <Button size="dashboard" variant="secondary" onClick={load} disabled={loading}>
          {t('Refresh')}
        </Button>
      </div>

      {error && <div className="text-sm text-nok">{error}</div>}
      {!error && data && (
        <div className="flex flex-wrap gap-6">
          <div>
            <div className="text-3xl font-bold">{data.total}</div>
            <div className="text-sm text-muted-foreground">{t('Total')}</div>
          </div>
          {roles.map(([role, label]) => (
            <div key={role}>
              <div className="text-3xl font-bold">{data.by_role?.[role] ?? 0}</div>
              <div className="text-sm text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {t(
          'Counts only users who did something that is logged, such as opening a patient or completing an exercise.'
        )}
      </p>
    </div>
  );
};

export default ActiveUsersCard;
