import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import SystemStatusTab, {
  type JobItem,
  type SystemStatus,
} from '@/components/AdminDashboard/SystemStatusTab';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));
jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
import apiClient from '@/api/client';

const job = (overrides: Partial<JobItem>): JobItem => ({
  name: 'Job',
  task: 'core.tasks.job',
  schedule: '0 * * * *',
  timezone: null,
  enabled: true,
  status: 'ok',
  reason: 'ok',
  last_success_at: '2026-10-01T10:00:00Z',
  last_failure_at: null,
  last_error: null,
  ...overrides,
});

const status = (overrides: Partial<SystemStatus> = {}): SystemStatus => ({
  generated_at: '2026-10-01T10:05:00Z',
  overall: 'ok',
  app: {
    status: 'ok',
    version: '1.4.2',
    started_at: '2026-09-30T08:00:00Z',
    sentry_url: 'https://sentry.example/issues',
  },
  jobs: { status: 'ok', items: [job({ name: 'Hourly push' })] },
  queue: {
    status: 'ok',
    length: 3,
    workers: { online: 1, busy: 0, concurrency: 4, longest_task: null },
  },
  wearables: {
    status: 'ok',
    providers: {
      fitbit: { connected: 12, stale_sync: 1, revoked_recent: 0 },
      google_health: { connected: 4, stale_sync: 0, revoked_recent: 2 },
    },
  },
  push: { status: 'info', sent_24h: 87 },
  translation: { status: 'ok', languages: ['de', 'en', 'fr', 'it', 'nl', 'pt'] },
  ...overrides,
});

const mockStatus = (data: SystemStatus) => (apiClient.get as jest.Mock).mockResolvedValue({ data });

describe('SystemStatusTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches on mount and shows the overall status, version and Sentry link', async () => {
    mockStatus(status());
    render(<SystemStatusTab />);

    expect(await screen.findByText('All systems normal')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/admin/system-status/');
    expect(screen.getByText(/1\.4\.2/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Sentry' })).toHaveAttribute(
      'href',
      'https://sentry.example/issues'
    );
  });

  it('shows the overall label for each status', async () => {
    mockStatus(status({ overall: 'error' }));
    render(<SystemStatusTab />);
    expect(await screen.findByText('Problem detected')).toBeInTheDocument();
  });

  it('lists the red and amber sections under the headline', async () => {
    mockStatus(
      status({
        overall: 'error',
        jobs: { status: 'error', items: [] },
        wearables: { status: 'warn', providers: undefined },
      })
    );
    render(<SystemStatusTab />);
    expect(await screen.findByTestId('affected-sections')).toHaveTextContent(
      'Affected: Scheduled jobs, Wearable sync'
    );
  });

  it('does not list sections when only the app restarted recently', async () => {
    mockStatus(status({ overall: 'warn', app: { status: 'warn', version: '1.4.2' } }));
    render(<SystemStatusTab />);
    await screen.findByText('Restarted recently');
    expect(screen.queryByTestId('affected-sections')).not.toBeInTheDocument();
  });

  it('hides the Sentry link when not configured', async () => {
    mockStatus(status({ app: { status: 'ok', version: null, sentry_url: null } }));
    render(<SystemStatusTab />);
    expect(await screen.findByText('All systems normal')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open Sentry' })).not.toBeInTheDocument();
  });

  it('flags a recent restart', async () => {
    mockStatus(status({ app: { status: 'warn', version: '1.4.2' } }));
    render(<SystemStatusTab />);
    expect(await screen.findByText('Restarted recently')).toBeInTheDocument();
  });

  it('renders jobs with problems first and shows the stored error', async () => {
    mockStatus(
      status({
        jobs: {
          status: 'error',
          items: [
            job({ name: 'A healthy job' }),
            job({
              name: 'Z broken job',
              status: 'error',
              reason: 'failed',
              last_failure_at: '2026-10-01T09:00:00Z',
              last_error: 'ValueError: boom',
            }),
            job({ name: 'M new job', status: 'unknown', reason: 'no_data', last_success_at: null }),
          ],
        },
      })
    );
    render(<SystemStatusTab />);

    const rows = await screen.findAllByTestId('job-row');
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      'Z broken job',
      'M new job',
      'A healthy job',
    ]);
    expect(within(rows[0]).getByText('Failed')).toBeInTheDocument();
    expect(within(rows[0]).getByText('ValueError: boom')).toHaveAttribute(
      'title',
      'ValueError: boom'
    );
    expect(within(rows[1]).getByText('No data since deploy')).toBeInTheDocument();
    expect(within(rows[1]).getAllByRole('cell')[2]).toHaveTextContent('—');
  });

  it('renders the queue, wearable, push and translation cards', async () => {
    mockStatus(status());
    render(<SystemStatusTab />);

    const cards = await screen.findAllByTestId('status-card');
    expect(cards).toHaveLength(4);
    expect(within(cards[0]).getByText('3')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Fitbit')).toBeInTheDocument();
    expect(within(cards[1]).getByText('12')).toBeInTheDocument();
    expect(within(cards[2]).getByText('87')).toBeInTheDocument();
    expect(within(cards[3]).getByText('de, en, fr, it, nl, pt')).toBeInTheDocument();
  });

  it('shows worker counts and the longest running task in the queue card', async () => {
    mockStatus(
      status({
        queue: {
          status: 'warn',
          length: 0,
          workers: {
            online: 2,
            busy: 3,
            concurrency: 6,
            longest_task: { name: 'core.tasks.fetch_fitbit_data', running_s: 75 * 60 },
          },
        },
      })
    );
    render(<SystemStatusTab />);

    const queueCard = (await screen.findAllByTestId('status-card'))[0];
    const valueFor = (label: string) =>
      within(queueCard).getByText(label).nextElementSibling?.textContent;
    expect(valueFor('Workers online')).toBe('2');
    expect(valueFor('Busy')).toBe('3 of 6');
    expect(valueFor('Longest running task')).toBe('1h 15m');
    expect(within(queueCard).getByText('core.tasks.fetch_fitbit_data')).toBeInTheDocument();
  });

  it('leaves out the longest task row when no task is running', async () => {
    mockStatus(status());
    render(<SystemStatusTab />);

    const queueCard = (await screen.findAllByTestId('status-card'))[0];
    expect(within(queueCard).getByText('Workers online')).toBeInTheDocument();
    expect(within(queueCard).queryByText('Longest running task')).not.toBeInTheDocument();
  });

  it('shows a section error instead of its values', async () => {
    mockStatus(
      status({ queue: { status: 'error', error: 'ConnectionError: Connection refused' } })
    );
    render(<SystemStatusTab />);

    const cards = await screen.findAllByTestId('status-card');
    expect(within(cards[0]).getByText(/ConnectionError: Connection refused/)).toBeInTheDocument();
  });

  it('refetches past the server cache when Refresh is clicked', async () => {
    mockStatus(status());
    render(<SystemStatusTab />);
    expect(await screen.findByText('All systems normal')).toBeInTheDocument();

    mockStatus(status({ overall: 'warn' }));
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Needs attention')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(apiClient.get).toHaveBeenLastCalledWith('/admin/system-status/', {
      params: { refresh: 1 },
    });
  });

  it('shows an error when loading fails', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('network'));
    render(<SystemStatusTab />);
    expect(await screen.findByText('Failed to load system status.')).toBeInTheDocument();
  });

  it('orders jobs error, warn, unknown, ok and then by name', async () => {
    mockStatus(
      status({
        jobs: {
          status: 'error',
          items: [
            job({ name: 'b', status: 'ok' }),
            job({ name: 'a', status: 'ok' }),
            job({ name: 'c', status: 'unknown', reason: 'no_data' }),
            job({ name: 'd', status: 'warn' }),
            job({ name: 'e', status: 'error', reason: 'overdue' }),
          ],
        },
      })
    );
    render(<SystemStatusTab />);

    const rows = await screen.findAllByTestId('job-row');
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      'e',
      'd',
      'c',
      'a',
      'b',
    ]);
  });
  it('shows schedules in plain language with the cron text as tooltip', async () => {
    const schedules = ['30 2 * * *', '0 4 * * 0', '0 * * * *', '0 */4 * * *', '15 8 1 * *'];
    mockStatus(
      status({
        jobs: {
          status: 'ok',
          items: schedules.map((schedule, i) => job({ name: `job${i}`, schedule })),
        },
      })
    );
    render(<SystemStatusTab />);

    const rows = await screen.findAllByTestId('job-row');
    const cells = rows.map((r) => within(r).getAllByRole('cell')[1]);
    expect(cells.map((c) => c.textContent)).toEqual([
      'Daily at 02:30',
      'Weekly on Sunday at 04:00',
      'Every hour',
      'Every 4 hours',
      '15 8 1 * *',
    ]);
    expect(within(cells[0]).getByTitle('30 2 * * *')).toBeInTheDocument();
  });

  it('shows the job timezone next to clock times and in the tooltip', async () => {
    mockStatus(
      status({
        jobs: {
          status: 'ok',
          items: [
            job({ name: 'a', schedule: '30 2 * * *', timezone: 'UTC' }),
            job({ name: 'b', schedule: '0 4 * * 0', timezone: 'Europe/Zurich' }),
            job({ name: 'c', schedule: '0 * * * *', timezone: 'UTC' }),
          ],
        },
      })
    );
    render(<SystemStatusTab />);

    const rows = await screen.findAllByTestId('job-row');
    const cells = rows.map((r) => within(r).getAllByRole('cell')[1]);
    expect(cells.map((c) => c.textContent)).toEqual([
      'Daily at 02:30 UTC',
      'Weekly on Sunday at 04:00 Europe/Zurich',
      'Every hour',
    ]);
    expect(within(cells[0]).getByTitle('30 2 * * * (UTC)')).toBeInTheDocument();
  });
});
