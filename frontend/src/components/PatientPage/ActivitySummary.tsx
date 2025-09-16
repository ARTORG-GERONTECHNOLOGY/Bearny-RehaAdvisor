// src/components/PatientPage/ActivitySummary.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Col, Row, Spinner, OverlayTrigger, Tooltip, Button } from 'react-bootstrap';
import apiClient from '../../api/client';
import authStore from '../../stores/authStore';
import { useTranslation } from 'react-i18next';
import { differenceInCalendarDays, isSameDay, format } from 'date-fns';

type DailyRow = {
  date: string;
  steps: number;
  active_minutes: number;
  sleep_minutes: number;
  inactivity_minutes?: number;
};

type Summary = {
  connected: boolean;
  last_sync: string | null;
  today: {
    steps: number;
    active_minutes: number;
    sleep_minutes: number;
    inactivity_minutes?: number;
    resting_heart_rate?: number | null;
  } | null;
  period: {
    days: number;
    totals: { steps: number; active_minutes: number; sleep_minutes: number; inactivity_minutes?: number };
    averages: { steps: number; active_minutes: number; sleep_minutes: number; inactivity_minutes?: number };
    daily: DailyRow[];
  };
};

const GOALS = {
  steps: 10000,
  activeMinutesGreen: 30,
  activeMinutesYellow: 20,
  sleepGreenMin: 7 * 60,
  sleepYellowMin: 6 * 60,
  inactivityGreenMax: 600,
  inactivityYellowMax: 900,
};

const colorForSteps = (v: number) =>
  v >= GOALS.steps ? 'text-success' : v >= GOALS.steps * 0.6 ? 'text-warning' : 'text-danger';
const colorForActive = (v: number) =>
  v >= GOALS.activeMinutesGreen ? 'text-success' : v >= GOALS.activeMinutesYellow ? 'text-warning' : 'text-danger';
const colorForSleep = (minutes: number) =>
  minutes >= GOALS.sleepGreenMin ? 'text-success' : minutes >= GOALS.sleepYellowMin ? 'text-warning' : 'text-danger';
const colorForInactivity = (minutes: number) =>
  minutes <= GOALS.inactivityGreenMax ? 'text-success' : minutes <= GOALS.inactivityYellowMax ? 'text-warning' : 'text-danger';

const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: string;
  tooltip?: string;
  valueClassName?: string;
}> = ({ label, value, sub, tooltip, valueClassName }) => (
  <Card className="shadow-sm h-100">
    <Card.Body>
      <div className="d-flex justify-content-between align-items-start">
        <div className="text-muted">{label}</div>
        {tooltip && (
          <OverlayTrigger overlay={<Tooltip>{tooltip}</Tooltip>} placement="left">
            <span className="text-muted" style={{ cursor: 'help' }}>ⓘ</span>
          </OverlayTrigger>
        )}
      </div>
      <div className={`display-6 fw-semibold mt-1 ${valueClassName || ''}`}>{value}</div>
      {sub ? <div className="small text-muted mt-1">{sub}</div> : null}
    </Card.Body>
  </Card>
);

const PeriodSwitch: React.FC<{ value: number; onChange: (d: number) => void }> = ({ value, onChange }) => {
  const options = [7, 14, 30];
  return (
    <div className="d-flex gap-2">
      {options.map((d) => (
        <Button
          key={d}
          size="sm"
          variant={value === d ? 'primary' : 'outline-primary'}
          onClick={() => onChange(d)}
        >
          {d}d
        </Button>
      ))}
    </div>
  );
};

type Props = {
  selectedDate?: Date; // <- NEW: the day to display
};

const ActivitySummary: React.FC<Props> = ({ selectedDate }) => {
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const { i18n, t } = useTranslation();

  const nf = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  const mmToHhMm = (m: number) => {
    const h = Math.floor((m || 0) / 60);
    const mm = Math.abs((m || 0) % 60);
    return t('hmShort', { h, m: mm });
  };

  const ensureInactivity = (row: DailyRow) =>
    typeof row.inactivity_minutes === 'number'
      ? row.inactivity_minutes
      : Math.max(0, 1440 - ((row.active_minutes || 0) + (row.sleep_minutes || 0)));

  const fetchData = async (range: number) => {
    try {
      setLoading(true);
      setError('');
      const r1 = await apiClient.get(`/fitbit/summary/?days=${range}`);
      setData(r1.data);
    } catch (e1: any) {
      try {
        const anyId =
          (authStore as any)?.patientId ||
          (authStore as any)?.id ||
          localStorage.getItem('patientId');

        if (!anyId) throw e1;

        const r2 = await apiClient.get(`/fitbit/summary/${anyId}/?days=${days}`);
        setData(r2.data);
      } catch (e2: any) {
        const key = e2?.response?.data?.error;
        setError(key ? t(key) : t('error_f'));
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  };

  // If selectedDate is older than current window, expand window (max 31)
  useEffect(() => {
    if (!selectedDate) return;
    const now = new Date();
    const diff = differenceInCalendarDays(now, selectedDate); // 0=today, 1=yesterday, ...
    const needed = diff + 1;
    if (needed > days && needed <= 31) {
      setDays(needed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useEffect(() => { fetchData(days); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  const safeAverages = useMemo(() => {
    if (!data) return { steps: 0, active_minutes: 0, sleep_minutes: 0, inactivity_minutes: 0 };
    const a = data.period.averages || ({} as Summary['period']['averages']);
    if (typeof a.inactivity_minutes === 'number') return a;

    const daily = data.period.daily || [];
    if (!daily.length) return { steps: 0, active_minutes: 0, sleep_minutes: 0, inactivity_minutes: 0 };

    const sums = daily.reduce(
      (acc, r) => {
        const inact = ensureInactivity(r);
        acc.steps += r.steps || 0;
        acc.active_minutes += r.active_minutes || 0;
        acc.sleep_minutes += r.sleep_minutes || 0;
        acc.inactivity_minutes += inact;
        return acc;
      },
      { steps: 0, active_minutes: 0, sleep_minutes: 0, inactivity_minutes: 0 }
    );

    const n = Math.max(1, daily.length);
    return {
      steps: Math.floor(sums.steps / n),
      active_minutes: Math.floor(sums.active_minutes / n),
      sleep_minutes: Math.floor(sums.sleep_minutes / n),
      inactivity_minutes: Math.floor(sums.inactivity_minutes / n),
    };
  }, [data]);

  const focusRow: DailyRow | null = useMemo(() => {
    if (!data) return null;
    const day = selectedDate || new Date();
    const hit = (data.period.daily || []).find((r) => {
      const rd = new Date(r.date);
      return isSameDay(rd, day);
    });
    return hit || null;
  }, [data, selectedDate]);

  const labelDay = useMemo(() => {
    const day = selectedDate || new Date();
    const today = new Date();
    return isSameDay(day, today) ? t('today') : format(day, 'dd.MM.yyyy');
  }, [selectedDate, t, i18n.language]);

  const avgLine = useMemo(() => {
    if (!data) return '';
    return t('avgLine', {
      steps: nf.format(safeAverages.steps ?? 0),
      active: t('minute', { count: safeAverages.active_minutes ?? 0 }),
      sleep: mmToHhMm(safeAverages.sleep_minutes ?? 0)
    });
  }, [data, nf, t, safeAverages]);

  if (loading) {
    return (
      <Card className="mb-4">
        <Card.Body className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" /> <span>{t('loading')}</span>
        </Card.Body>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mb-4">
        <Card.Body className="text-danger">{error}</Card.Body>
      </Card>
    );
  }

  if (!data) return null;

  // Fall back to zeros if the focus day isn't in the fetched window
  const steps = focusRow?.steps ?? 0;
  const active = focusRow?.active_minutes ?? 0;
  const sleep = focusRow?.sleep_minutes ?? 0;
  const inactivity = focusRow?.inactivity_minutes ?? 0;

  return (
    <Card className="mb-4">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <div>{t('title_fitbit')}</div>
        <div className="d-flex align-items-center gap-3">
          <div className="small text-muted">
            {data.last_sync
              ? t('lastSync', { date: new Date(data.last_sync).toLocaleString(i18n.language) })
              : t('notConnected')}
          </div>
          <PeriodSwitch value={days} onChange={setDays} />
        </div>
      </Card.Header>

      <Card.Body>
        {!data.connected && (
          <div className="mb-3 text-warning">{t('notConnected')}</div>
        )}

        <Row xs={1} md={4} className="g-3">
          <Col>
            <StatCard
              label={`${t('steps')} (${labelDay})`}
              value={nf.format(steps)}
              valueClassName={colorForSteps(steps)}
              sub={`${t('avg', { days })}: ${nf.format(safeAverages.steps ?? 0)}`}
              tooltip={t('stepsTip')}
            />
          </Col>
          <Col>
            <StatCard
              label={`${t('activeMinutes')} (${labelDay})`}
              value={t('minute', { count: active })}
              valueClassName={colorForActive(active)}
              sub={`${t('avg', { days })}: ${t('minute', { count: safeAverages.active_minutes ?? 0 })}`}
              tooltip={t('activeMinutesTip')}
            />
          </Col>
          <Col>
            <StatCard
              label={`${t('sleep')} (${labelDay})`}
              value={mmToHhMm(sleep)}
              valueClassName={colorForSleep(sleep)}
              sub={`${t('avg', { days })}: ${mmToHhMm(safeAverages.sleep_minutes ?? 0)}`}
              tooltip={t('sleepTip')}
            />
          </Col>
          <Col>
            <StatCard
              label={`${t('inactivity')} (${labelDay})`}
              value={mmToHhMm(inactivity)}
              valueClassName={colorForInactivity(inactivity)}
              sub={`${t('avg', { days })}: ${mmToHhMm(safeAverages.inactivity_minutes ?? 0)}`}
              tooltip={t('inactivityTip')}
            />
          </Col>
        </Row>

        {avgLine && <div className="small text-muted mt-3">{avgLine}</div>}
      </Card.Body>
    </Card>
  );
};

export default ActivitySummary;
