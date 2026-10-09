import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import apiClient from '@/api/client';
import { Badge } from '@/components/ui/badge';
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
import ErrorAlert from '@/components/common/ErrorAlert';
import { formatDurationMinutes, formatLocaleDateTime } from '@/utils/dateFormat';

export type Status = 'ok' | 'warn' | 'error' | 'unknown' | 'info';

type Section = { status: Status; error?: string };

export type JobItem = {
  name: string;
  task: string;
  schedule: string;
  timezone: string | null;
  enabled: boolean;
  status: Status;
  reason: 'ok' | 'running' | 'overdue' | 'failed' | 'disabled' | 'no_data';
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
};

type Workers = {
  online: number;
  busy: number;
  concurrency: number;
  longest_task: { name: string; running_s: number } | null;
};

type ProviderCounts = { connected: number; stale_sync: number; revoked_recent: number };

export type SystemStatus = {
  generated_at: string;
  overall: Status;
  app: Section & { version?: string | null; started_at?: string; sentry_url?: string | null };
  jobs: Section & { items?: JobItem[] };
  queue: Section & { length?: number; workers?: Workers };
  wearables: Section & { providers?: Record<'fitbit' | 'google_health', ProviderCounts> };
  push: Section & { sent_24h?: number };
  translation: Section & { languages?: string[] };
};

const BADGE_VARIANT: Record<
  Status,
  'dashboard-success' | 'dashboard-warning' | 'dashboard-destructive' | 'dashboard'
> = {
  ok: 'dashboard-success',
  warn: 'dashboard-warning',
  error: 'dashboard-destructive',
  unknown: 'dashboard',
  info: 'dashboard',
};

const DOT_CLASS: Record<Status, string> = {
  ok: 'bg-ok',
  warn: 'bg-yellow',
  error: 'bg-nok',
  unknown: 'bg-zinc-300',
  info: 'bg-zinc-300',
};

const SORT_RANK: Record<Status, number> = { error: 0, warn: 1, unknown: 2, info: 3, ok: 4 };

const sortJobs = (items: JobItem[]): JobItem[] =>
  [...items].sort(
    (a, b) => SORT_RANK[a.status] - SORT_RANK[b.status] || a.name.localeCompare(b.name)
  );

const formatTime = (value: string | null | undefined) =>
  value ? formatLocaleDateTime(value) : '—';

const NUM = /^\d+$/;
const pad = (v: string) => v.padStart(2, '0');

// Plain-language label for the cron patterns our jobs use; anything else falls back to the raw text.
const describeSchedule = (
  cron: string,
  timezone: string | null,
  t: (key: string, options?: Record<string, unknown>) => string,
  language: string
): string => {
  const [minute, hour, dayOfMonth, month, weekday] = cron.split(' ');
  if (dayOfMonth !== '*' || month !== '*' || !NUM.test(minute ?? '')) return cron;
  const time = `${pad(hour)}:${pad(minute)}${timezone ? ` ${timezone}` : ''}`;
  if (NUM.test(hour) && weekday === '*') return t('Daily at {{time}}', { time });
  if (NUM.test(hour) && NUM.test(weekday)) {
    // 2023-01-01 was a Sunday, so cron weekday 0..6 maps onto Jan 1..7.
    const day = new Date(Date.UTC(2023, 0, 1 + (Number(weekday) % 7))).toLocaleDateString(
      language,
      {
        weekday: 'long',
        timeZone: 'UTC',
      }
    );
    return t('Weekly on {{day}} at {{time}}', { day, time });
  }
  if (weekday !== '*') return cron;
  if (hour === '*' && minute === '0') return t('Every hour');
  const every = /^\*\/(\d+)$/.exec(hour);
  if (every && minute === '0') return t('Every {{hours}} hours', { hours: every[1] });
  return cron;
};

const SystemStatusTab: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const url = '/admin/system-status/';
        const res = refresh
          ? await apiClient.get<SystemStatus>(url, { params: { refresh: 1 } })
          : await apiClient.get<SystemStatus>(url);
        setData(res.data);
      } catch {
        setError(t('Failed to load system status.'));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const overallLabel: Record<Status, string> = {
    ok: t('All systems normal'),
    warn: t('Needs attention'),
    error: t('Problem detected'),
    unknown: t('Status unknown'),
    info: t('Status unknown'),
  };

  const reasonLabel: Record<JobItem['reason'], string> = {
    ok: t('OK'),
    running: t('Running'),
    overdue: t('Overdue'),
    failed: t('Failed'),
    disabled: t('Disabled'),
    no_data: t('No data since deploy'),
  };

  const providerLabel: Record<'fitbit' | 'google_health', string> = {
    fitbit: t('Fitbit'),
    google_health: t('Google Health'),
  };

  const card = (title: string, section: Section, body: React.ReactNode) => (
    <div className="rounded-xl border bg-zinc-50 p-4" data-testid="status-card">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT_CLASS[section.status]}`}
          aria-hidden
        />
        <h6 className="text-sm font-semibold">{title}</h6>
      </div>
      {section.error ? (
        <div className="text-sm text-nok">
          {t('Check failed')}: {section.error}
        </div>
      ) : (
        body
      )}
    </div>
  );

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );

  if (!data) {
    return loading ? (
      <div className="text-center my-5">
        <Spinner />
      </div>
    ) : (
      <>{error && <ErrorAlert message={error} onClose={() => setError(null)} />}</>
    );
  }

  const { app, jobs, queue, wearables, push, translation } = data;

  // The app's own amber already has the "restarted recently" badge; push is information only.
  const affected = (
    [
      [jobs, t('Scheduled jobs')],
      [queue, t('Task queue')],
      [wearables, t('Wearable sync')],
      [translation, t('Translation')],
    ] as [Section, string][]
  )
    .filter(([section]) => section.status === 'error' || section.status === 'warn')
    .map(([, label]) => label);

  return (
    <div className="my-4 flex flex-col gap-4">
      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-zinc-50 p-4"
        data-testid="overall-status"
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-1.5 h-4 w-4 shrink-0 rounded-full ${DOT_CLASS[data.overall]}`}
            aria-hidden
          />
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pb-0.5">
              <span className="text-lg font-semibold">{overallLabel[data.overall]}</span>
              {app.status === 'warn' && (
                <Badge variant="dashboard-warning">{t('Restarted recently')}</Badge>
              )}
            </div>
            {affected.length > 0 && (
              <div className="text-sm font-medium" data-testid="affected-sections">
                {t('Affected: {{sections}}', { sections: affected.join(', ') })}
              </div>
            )}
            <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3">
              {app.version && (
                <span>
                  {t('Version')}: {app.version}
                </span>
              )}
              {app.started_at && (
                <span>
                  {t('Running since {{time}}', { time: formatLocaleDateTime(app.started_at) })}
                </span>
              )}
              <span>
                {t('Updated {{time}}', { time: formatLocaleDateTime(data.generated_at) })}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {app.sentry_url && (
            <Button size="dashboard" variant="secondary" asChild>
              <a href={app.sentry_url} target="_blank" rel="noopener noreferrer">
                {t('Open Sentry')}
              </a>
            </Button>
          )}
          <Button
            size="dashboard"
            variant="secondary"
            onClick={() => load(true)}
            disabled={loading}
          >
            {t('Refresh')}
          </Button>
        </div>
      </div>

      <div>
        <h5 className="text-base font-semibold mb-2">{t('Scheduled jobs')}</h5>
        {jobs.error ? (
          <div className="text-sm text-nok">
            {t('Check failed')}: {jobs.error}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Job')}</TableHead>
                <TableHead>{t('Schedule')}</TableHead>
                <TableHead>{t('Last success')}</TableHead>
                <TableHead>{t('Last failure')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortJobs(jobs.items ?? []).map((job) => (
                <TableRow key={job.name} data-testid="job-row">
                  <TableCell>{job.name}</TableCell>
                  <TableCell>
                    <span title={job.timezone ? `${job.schedule} (${job.timezone})` : job.schedule}>
                      {describeSchedule(job.schedule, job.timezone, t, i18n.language)}
                    </span>
                  </TableCell>
                  <TableCell>{formatTime(job.last_success_at)}</TableCell>
                  <TableCell>
                    {formatTime(job.last_failure_at)}
                    {job.last_error && (
                      <div
                        className="text-xs text-muted-foreground break-all line-clamp-2"
                        title={job.last_error}
                      >
                        {job.last_error}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={BADGE_VARIANT[job.status]}>
                      {reasonLabel[job.reason] ?? job.reason}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {card(
          t('Task queue'),
          queue,
          <div className="flex flex-col gap-1">
            {row(t('Waiting tasks'), queue.length ?? '—')}
            {queue.workers && (
              <>
                {row(t('Workers online'), queue.workers.online)}
                {row(
                  t('Busy'),
                  t('{{busy}} of {{total}}', {
                    busy: queue.workers.busy,
                    total: queue.workers.concurrency,
                  })
                )}
                {queue.workers.longest_task && (
                  <>
                    {row(
                      t('Longest running task'),
                      formatDurationMinutes(queue.workers.longest_task.running_s / 60)
                    )}
                    <div className="text-xs text-muted-foreground break-all">
                      {queue.workers.longest_task.name}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
        {card(
          t('Wearable sync'),
          wearables,
          <div className="flex flex-col gap-3">
            {Object.entries(wearables.providers ?? {}).map(([key, counts]) => (
              <div key={key}>
                <div className="text-xs font-semibold mb-1">
                  {providerLabel[key as 'fitbit' | 'google_health'] ?? key}
                </div>
                {row(t('Connected'), counts.connected)}
                {row(t('Not synced in 24h'), counts.stale_sync)}
                {row(t('Revoked in 7 days'), counts.revoked_recent)}
              </div>
            ))}
          </div>
        )}
        {card(t('Push notifications'), push, row(t('Sent in the last 24h'), push.sent_24h ?? '—'))}
        {card(
          t('Translation'),
          translation,
          row(t('Languages loaded'), (translation.languages ?? []).join(', ') || '—')
        )}
      </div>
    </div>
  );
};

export default SystemStatusTab;
