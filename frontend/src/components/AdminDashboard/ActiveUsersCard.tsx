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
    <div className="mt-6 mb-4 max-w-[480px]" data-testid="active-users">
      <h5 className="text-base font-semibold mb-3">{t('Active in the last 15 min')}</h5>

      {(error || data) && (
        <div className="flex flex-wrap items-end gap-6 rounded-xl border bg-zinc-50 p-4">
          {error ? (
            <div className="self-center text-sm text-nok">{error}</div>
          ) : (
            data && (
              <>
                <div className="pr-6 border-r">
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
          <Button
            size="dashboard"
            variant="secondary"
            className="ml-auto self-center"
            onClick={load}
            disabled={loading}
          >
            {t('Refresh')}
          </Button>
        </div>
      )}

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
