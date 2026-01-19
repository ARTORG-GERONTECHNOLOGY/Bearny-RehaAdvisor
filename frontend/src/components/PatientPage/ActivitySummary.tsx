/* eslint-disable */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Col,
  Row,
  Spinner,
  OverlayTrigger,
  Tooltip,
  Button,
  Form,
  Alert,
} from 'react-bootstrap';
import apiClient from '../../api/client';
import authStore from '../../stores/authStore';
import { useTranslation } from 'react-i18next';
import { isSameDay, format, subDays } from 'date-fns';

/* ---------- Types ---------- */
type Thresholds = {
  steps_goal: number;
  active_minutes_green: number;
  active_minutes_yellow: number;
  sleep_green_min: number;
  sleep_yellow_min: number;
  bp_sys_green_max: number;
  bp_sys_yellow_max: number;
  bp_dia_green_max: number;
  bp_dia_yellow_max: number;
};

type DailyRow = {
  date: string;
  steps: number;
  active_minutes?: number;
  sleep_minutes?: number;

  // NEW:
  bp_sys?: number | null;
  bp_dia?: number | null;
};

type Summary = {
  connected: boolean;
  last_sync: string | null;
  thresholds?: Partial<Thresholds>; // NEW (from BE)
  today?: {
    steps?: number;
    active_minutes?: number;
    sleep_minutes?: number;
    resting_heart_rate?: number | null;

    // NEW:
    bp_sys?: number | null;
    bp_dia?: number | null;
  } | null;
  period: {
    days: number;
    totals?: {
      steps?: number;
      active_minutes?: number;
      sleep_minutes?: number;

      // NEW:
      bp_sys?: number | null;
      bp_dia?: number | null;
    };
    averages?: {
      steps?: number;
      active_minutes?: number;
      sleep_minutes?: number;

      // NEW:
      bp_sys?: number | null;
      bp_dia?: number | null;
    };
    daily: DailyRow[];
  };
};

/* ---------- Defaults + merge ---------- */
const DEFAULT_THRESHOLDS: Thresholds = {
  steps_goal: 10000,
  active_minutes_green: 30,
  active_minutes_yellow: 20,
  sleep_green_min: 7 * 60,
  sleep_yellow_min: 6 * 60,
  bp_sys_green_max: 129,
  bp_sys_yellow_max: 139,
  bp_dia_green_max: 84,
  bp_dia_yellow_max: 89,
};

const mergeThresholds = (api?: Partial<Thresholds>): Thresholds => ({
  ...DEFAULT_THRESHOLDS,
  ...(api || {}),
});

/* ---------- Color helpers (personalized via thr) ---------- */
const colorForSteps = (v: number, thr: Thresholds) =>
  v >= thr.steps_goal
    ? 'text-success'
    : v >= thr.steps_goal * 0.6
    ? 'text-warning'
    : 'text-danger';

const colorForActive = (v: number, thr: Thresholds) =>
  v >= thr.active_minutes_green
    ? 'text-success'
    : v >= thr.active_minutes_yellow
    ? 'text-warning'
    : 'text-danger';

const colorForSleep = (minutes: number, thr: Thresholds) =>
  minutes >= thr.sleep_green_min
    ? 'text-success'
    : minutes >= thr.sleep_yellow_min
    ? 'text-warning'
    : 'text-danger';

const colorForBP = (
  sys: number | null | undefined,
  dia: number | null | undefined,
  thr: Thresholds
) => {
  if (sys == null && dia == null) return 'text-muted';
  const s = sys ?? 0;
  const d = dia ?? 0;

  const green = s <= thr.bp_sys_green_max && d <= thr.bp_dia_green_max;
  const yellow =
    !green && s <= thr.bp_sys_yellow_max && d <= thr.bp_dia_yellow_max;

  if (green) return 'text-success';
  if (yellow) return 'text-warning';
  return 'text-danger';
};

/* ---------- MiniTrend (unchanged) ---------- */
const MiniTrend: React.FC<{
  daily: number[];
  color?: string;
  threshold?: number | null;
}> = ({ daily, color = '#007bff', threshold = null }) => {
  if (!daily.length) return null;

  const max = Math.max(...daily);
  const min = Math.min(...daily);
  const norm = daily.map((v) => (max === min ? 0.5 : (v - min) / (max - min)));

  const thresholdY =
    threshold !== null && max !== min
      ? 40 - ((threshold - min) / (max - min)) * 35
      : null;

  return (
    <div className="mini-chart-wrapper" style={{ position: 'relative' }}>
      <svg
        viewBox="0 0 120 45"
        preserveAspectRatio="none"
        className="mini-chart-svg"
      >
        <line x1="10" y1="0" x2="10" y2="40" stroke="#555" strokeWidth="0.8" />
        <line
          x1="10"
          y1="40"
          x2="120"
          y2="40"
          stroke="#555"
          strokeWidth="0.8"
        />

        <text x="0" y="6" fontSize="5" fill="#666">
          {max}
        </text>
        <text x="0" y="40" fontSize="5" fill="#666">
          {min}
        </text>

        {thresholdY !== null && (
          <line
            x1="10"
            x2="120"
            y1={thresholdY}
            y2={thresholdY}
            stroke="red"
            strokeDasharray="4 2"
            strokeWidth="0.8"
          />
        )}

        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          points={norm
            .map(
              (v, i) =>
                `${10 + (i / (daily.length - 1)) * 110},${40 - v * 35}`
            )
            .join(' ')}
        />
      </svg>
    </div>
  );
};

const TrendToggle: React.FC<{ open: boolean; onToggle: () => void; color: string }> =
  ({ open, onToggle, color }) => {
    const { t } = useTranslation();
    return (
      <Button
        variant="light"
        size="sm"
        onClick={onToggle}
        className="trend-toggle-btn"
        style={{ color, borderColor: color }}
      >
        {open ? '▲ ' : '▼ '}
        {open ? t('Hide trend') : t('Show trend')}
      </Button>
    );
  };

const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: string;
  tooltip?: string;
  valueClassName?: string;
  children?: any;
}> = ({ label, value, sub, tooltip, valueClassName, children }) => (
  <Card className="shadow-sm h-100">
    <Card.Body>
      <div className="d-flex justify-content-between align-items-start">
        <div className="text-muted">{label}</div>
        {tooltip && (
          <OverlayTrigger overlay={<Tooltip>{tooltip}</Tooltip>} placement="left">
            <span className="text-muted" style={{ cursor: 'help' }}>
              ⓘ
            </span>
          </OverlayTrigger>
        )}
      </div>

      <div className={`display-6 fw-semibold mt-1 ${valueClassName || ''}`}>
        {value}
      </div>

      {sub && <div className="small text-muted mt-1">{sub}</div>}

      {children}
    </Card.Body>
  </Card>
);

/* ---------- MAIN COMPONENT ---------- */
const ActivitySummary: React.FC<{ selectedDate?: Date }> = ({ selectedDate }) => {
  const { i18n, t } = useTranslation();
  const id = useMemo(() => localStorage.getItem('id') || authStore.id, []);
  const nf = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  const [connected, setConnected] = useState<boolean | null>(null);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* Trend states */
  const [showStepsTrend, setShowStepsTrend] = useState(false);
  const [showActiveTrend, setShowActiveTrend] = useState(false);
  const [showSleepTrend, setShowSleepTrend] = useState(false);
  const [showBPTrend, setShowBPTrend] = useState(false);

  /* Manual steps */
  const [manualSteps, setManualSteps] = useState('');
  const [manualDate, setManualDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [manualMsg, setManualMsg] = useState('');
  const [showManualError, setShowManualError] = useState(false);
  const [showManualSuccess, setShowManualSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const mmToHhMm = (m = 0) => {
    const h = Math.floor((m || 0) / 60);
    const mm = Math.abs((m || 0) % 60);
    return t('{{hours}}h {{minutes}}m', { hours: h, minutes: mm });
  };

  /* ---------- Check Fitbit connection ---------- */
  useEffect(() => {
    (async () => {
      try {
        const { data: res } = await apiClient.get(`/fitbit/status/${id}/`);
        setConnected(!!res.connected);
      } catch {
        setConnected(false);
      }
    })();
  }, [id]);

  /* ---------- Fetch data ---------- */
  const fetchData = async () => {
    try {
      setError('');
      setLoading(true);
      const res = await apiClient.get(`/fitbit/summary/${id}/?days=7`);
      setData(res.data);
    } catch {
      setError(t('error_f'));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connected !== null) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  /* ---------- Submit manual steps ---------- */
  const submitManualSteps = async () => {
    if (!manualSteps || isNaN(Number(manualSteps))) return;

    setSubmitting(true);
    try {
      await apiClient.post(`/fitbit/manual_steps/${id}/`, {
        date: manualDate,
        steps: Number(manualSteps),
      });

      setManualMsg(t('Steps saved successfully.'));
      setShowManualSuccess(true);
      setShowManualError(false);
      setManualSteps('');
      fetchData();
    } catch {
      setManualMsg(t('Failed to save steps. Please try again.'));
      setShowManualError(true);
      setShowManualSuccess(false);
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Loading ---------- */
  if (connected === null || loading) {
    return (
      <Card className="mb-4">
        <Card.Body className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" /> {t('loading')}
        </Card.Body>
      </Card>
    );
  }

  /* ---------- MANUAL ENTRY MODE ---------- */
  if (connected === false) {
    const daily = data?.period?.daily || [];
    const focusRow =
      daily.find((r) => isSameDay(new Date(r.date), selectedDate || new Date())) ||
      null;

    const steps = focusRow?.steps ?? null;
    const avgSteps = data?.period?.averages?.steps ?? null;

    // In manual mode we might not get thresholds; still safe
    const thr = mergeThresholds(data?.thresholds);

    return (
      <Card className="mb-4 border-warning">
        <Card.Header>
          <strong>{t('Manual Steps Entry')}</strong>
        </Card.Header>

        <Card.Body>
          {showManualSuccess && (
            <Alert
              variant="success"
              dismissible
              onClose={() => setShowManualSuccess(false)}
            >
              {manualMsg}
            </Alert>
          )}

          {showManualError && (
            <Alert
              variant="danger"
              dismissible
              onClose={() => setShowManualError(false)}
            >
              {manualMsg}
            </Alert>
          )}

          <Alert variant="warning">
            {t('Your Fitbit is not connected. Please enter your daily steps manually.')}
          </Alert>

          <Row className="g-2 mb-3 align-items-end">
            <Col xs={6} md={4}>
              <Form.Label>{t('Steps')}</Form.Label>
              <Form.Control
                type="number"
                min="0"
                value={manualSteps}
                onChange={(e) => setManualSteps(e.target.value)}
                placeholder={t('e.g. 5000')}
              />
            </Col>

            <Col xs={6} md={4}>
              <Form.Label>{t('Date')}</Form.Label>
              <Form.Control
                type="date"
                max={format(new Date(), 'yyyy-MM-dd')}
                min={format(subDays(new Date(), 7), 'yyyy-MM-dd')}
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
              />
            </Col>

            <Col xs="auto">
              <Button
                onClick={submitManualSteps}
                disabled={submitting || !manualSteps}
              >
                {submitting && (
                  <Spinner size="sm" animation="border" className="me-2" />
                )}
                {t('Save')}
              </Button>
            </Col>
          </Row>

          <Row xs={1} md={3} className="g-3 mt-3">
            <Col>
              <StatCard
                label={t('Steps')}
                value={steps !== null ? nf.format(steps) : '-'}
                valueClassName={steps != null ? colorForSteps(steps, thr) : 'text-muted'}
                sub={t('Today’s recorded steps')}
              />
            </Col>

            <Col>
              <StatCard
                label={t('Average Steps')}
                value={avgSteps != null ? nf.format(avgSteps) : '-'}
                valueClassName={avgSteps != null ? colorForSteps(avgSteps, thr) : 'text-muted'}
                sub={t('Average of last 7 days')}
              />
            </Col>

            <Col>
              <StatCard
                label={t('Step Score')}
                value={
                  steps === null
                    ? '-'
                    : steps >= thr.steps_goal
                    ? t('Excellent')
                    : steps >= thr.steps_goal * 0.75
                    ? t('Good')
                    : steps >= thr.steps_goal * 0.5
                    ? t('Fair')
                    : t('Low')
                }
              />
            </Col>
          </Row>
        </Card.Body>
      </Card>
    );
  }

  /* ---------- CONNECTED MODE ---------- */
  if (!data) {
    return (
      <Card className="mb-4">
        <Card.Body className="text-danger">{t('No data available')}</Card.Body>
      </Card>
    );
  }

  const thr = mergeThresholds(data.thresholds);

  const daily = data.period.daily || [];
  const focusRow =
    daily.find((r) => isSameDay(new Date(r.date), selectedDate || new Date())) ||
    null;

  const stepsToday = focusRow?.steps ?? 0;
  const activeToday = focusRow?.active_minutes ?? 0;
  const sleepToday = focusRow?.sleep_minutes ?? 0;

  // Prefer daily row; fall back to today payload
  const bpSysToday = focusRow?.bp_sys ?? data.today?.bp_sys ?? null;
  const bpDiaToday = focusRow?.bp_dia ?? data.today?.bp_dia ?? null;

  const averages = data.period.averages || {};
  const avgSteps = averages.steps ?? 0;
  const avgActive = averages.active_minutes ?? 0;
  const avgSleep = averages.sleep_minutes ?? 0;
  const avgBpSys = averages.bp_sys ?? null;
  const avgBpDia = averages.bp_dia ?? null;

  const daysCount = data.period.days || daily.length || 0;

  // Trend: map BP to a single numeric line: sys + dia/1000
  const bpTrend = daily
    .map((d) => {
      const s = d.bp_sys;
      const di = d.bp_dia;
      if (s == null && di == null) return null;
      const ss = s == null ? 0 : Number(s);
      const dd = di == null ? 0 : Number(di);
      return ss + dd / 1000;
    })
    .filter((x): x is number => typeof x === 'number' && !isNaN(x));

  return (
    <Card className="mb-4">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <strong>{t('Fitbit Activity Summary')}</strong>
        <span className="small text-muted">
          {data.last_sync
            ? t('lastSync', {
                date: new Date(data.last_sync).toLocaleString(i18n.language),
              })
            : t('notConnected')}
        </span>
      </Card.Header>

      <Card.Body>
        {error && (
          <Alert variant="danger" className="py-2">
            {error}
          </Alert>
        )}

        <Row xs={1} md={4} className="g-3">
          {/* ---- Steps ---- */}
          <Col>
            <StatCard
              label={t('Steps')}
              value={nf.format(stepsToday)}
              valueClassName={colorForSteps(stepsToday, thr)}
              sub={`${t('avg', { days: daysCount })} ${nf.format(avgSteps)}`}
              tooltip={t('stepsTip')}
            >
              <TrendToggle
                open={showStepsTrend}
                onToggle={() => setShowStepsTrend(!showStepsTrend)}
                color="#0d6efd"
              />
              {showStepsTrend && (
                <MiniTrend
                  daily={daily.map((d) => d.steps)}
                  color="#0d6efd"
                  threshold={thr.steps_goal}
                />
              )}
            </StatCard>
          </Col>

          {/* ---- Active Minutes ---- */}
          <Col>
            <StatCard
              label={t('Active Minutes')}
              value={`${activeToday} ${t('min')}`}
              valueClassName={colorForActive(activeToday, thr)}
              sub={`${t('avg', { days: daysCount })} ${avgActive} ${t('min')}`}
            >
              <TrendToggle
                open={showActiveTrend}
                onToggle={() => setShowActiveTrend(!showActiveTrend)}
                color="#28a745"
              />
              {showActiveTrend && (
                <MiniTrend
                  daily={daily.map((d) => d.active_minutes || 0)}
                  color="#28a745"
                  threshold={thr.active_minutes_green}
                />
              )}
            </StatCard>
          </Col>

          {/* ---- Sleep ---- */}
          <Col>
            <StatCard
              label={t('Sleep')}
              value={mmToHhMm(sleepToday)}
              valueClassName={colorForSleep(sleepToday, thr)}
              sub={`${t('avg', { days: daysCount })} ${mmToHhMm(avgSleep)}`}
            >
              <TrendToggle
                open={showSleepTrend}
                onToggle={() => setShowSleepTrend(!showSleepTrend)}
                color="#6f42c1"
              />
              {showSleepTrend && (
                <MiniTrend
                  daily={daily.map((d) => d.sleep_minutes || 0)}
                  color="#6f42c1"
                  threshold={thr.sleep_green_min}
                />
              )}
            </StatCard>
          </Col>

          {/* ---- Blood Pressure (replaces inactivity) ---- */}
          <Col>
            <StatCard
              label={t('Blood Pressure')}
              value={
                bpSysToday == null && bpDiaToday == null
                  ? '—'
                  : `${bpSysToday ?? '—'}/${bpDiaToday ?? '—'}`
              }
              valueClassName={colorForBP(bpSysToday, bpDiaToday, thr)}
              sub={
                avgBpSys == null && avgBpDia == null
                  ? `${t('avg', { days: daysCount })} —`
                  : `${t('avg', { days: daysCount })} ${Math.round(
                      avgBpSys ?? 0
                    )}/${Math.round(avgBpDia ?? 0)}`
              }
              tooltip={t('Enter BP manually on the patient page if needed.')}
            >
              <TrendToggle
                open={showBPTrend}
                onToggle={() => setShowBPTrend(!showBPTrend)}
                color="#dc3545"
              />
              {showBPTrend && (
                <MiniTrend
                  daily={bpTrend}
                  color="#dc3545"
                  threshold={thr.bp_sys_green_max}
                />
              )}
            </StatCard>
          </Col>
        </Row>
      </Card.Body>

      <style>{`
        .trend-toggle-btn {
          width: 100%;
          margin-top: 0.6rem;
          font-size: 0.9rem;
          padding: 0.4rem 0.6rem;
          border-radius: 8px;
        }

        @media (min-width: 768px) {
          .trend-toggle-btn { width: auto; }
        }

        .mini-chart-wrapper {
          width: 100%;
          height: 80px;
          margin-top: 8px;
          padding: 6px;
          background: rgba(0,0,0,0.03);
          border-radius: 10px;
          overflow: hidden;
          animation: fadeIn 0.3s ease-out;
        }

        .mini-chart-svg { width: 100%; height: 100%; }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </Card>
  );
};

export default ActivitySummary;
