import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import apiClient from '@/api/client';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type DeviceAnalytics = {
  by_device: Record<string, number>;
  by_role: Record<string, Record<string, number>>;
};

const DeviceAnalyticsCard: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<DeviceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<DeviceAnalytics>('/admin/analytics/devices/');
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="text-center my-5">
        <Spinner />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mt-4 flex items-center gap-3">
        <span className="text-sm text-nok">{t('Failed to load analytics.')}</span>
        <Button size="dashboard" variant="secondary" onClick={load}>
          {t('Refresh')}
        </Button>
      </div>
    );
  }

  return (
    <div className="my-4">
      <h5 className="text-base font-semibold mb-3">{t('Login device types')}</h5>
      <div className="flex flex-wrap gap-4 mb-6">
        {['Mobile', 'Desktop', 'Tablet', 'Unknown'].map((device) => {
          const count = data.by_device[device] ?? 0;
          if (count === 0) return null;
          return (
            <div
              key={device}
              className="rounded-xl border bg-zinc-50 px-8 py-6 text-center min-w-[120px]"
            >
              <div className="text-3xl font-bold">{count}</div>
              <div className="text-sm text-muted-foreground mt-1">{t(device)}</div>
            </div>
          );
        })}
      </div>
      {Object.keys(data.by_role).length > 0 && (
        <div className="max-w-[480px]">
          <h6 className="text-base font-semibold mb-3">{t('By user role')}</h6>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Role')}</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Desktop</TableHead>
                <TableHead>Tablet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(data.by_role).map(([role, counts]) => (
                <TableRow key={role}>
                  <TableCell>{role}</TableCell>
                  <TableCell>{counts['Mobile'] ?? 0}</TableCell>
                  <TableCell>{counts['Desktop'] ?? 0}</TableCell>
                  <TableCell>{counts['Tablet'] ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default DeviceAnalyticsCard;
