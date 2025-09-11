// src/components/PatientPage/ActivitySummary.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Col, Row, Spinner, OverlayTrigger, Tooltip, Button } from 'react-bootstrap';
import apiClient from '../../api/client';
import authStore from '../../stores/authStore';
import { useTranslation } from 'react-i18next';

type Summary = {
  connected: boolean;
  last_sync: string | null;
  today: {
    steps: number;
    active_minutes: number;
    sleep_minutes: number;
    resting_heart_rate?: number | null;
  } | null;
  period: {
    days: number;
    totals: { steps: number; active_minutes: number; sleep_minutes: number };
    averages: { steps: number; active_minutes: number; sleep_minutes: number };
    daily: { date: string; steps: number; active_minutes: number; sleep_minutes: number }[];
  };
};

const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: string;
  tooltip?: string;
}> = ({ label, value, sub, tooltip }) => (
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
      <div className="display-6 fw-semibold mt-1">{value}</div>
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

const ActivitySummary: React.FC = () => {
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const { i18n, t } = useTranslation();

  const nf = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  // duration helper using translations (e.g., "7 h 30 min" / "7 Std 30 Min")
  const mmToHhMm = (m: number) => {
    const h = Math.floor((m || 0) / 60);
    const mm = Math.abs((m || 0) % 60);
    return t('hmShort', { h, m: mm });
  };

  const fetchData = async (range: number) => {
    try {
      setLoading(true);
      setError('');
      // 1) Let API infer patient from auth
      const r1 = await apiClient.get(`/fitbit/summary/?days=${range}`);
      setData(r1.data);
    } catch (e1: any) {
      // 2) Retry with id (fallback)
      try {
        const anyId =
          (authStore as any)?.patientId ||
          (authStore as any)?.id ||
          localStorage.getItem('patientId');

        if (!anyId) throw e1;

        const r2 = await apiClient.get(`/fitbit/summary/${anyId}/?days=${range}`);
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

  useEffect(() => { fetchData(days); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  const avgLine = useMemo(() => {
    if (!data) return '';
    const a = data.period.averages;
    return t('avgLine', {
      steps: nf.format(a.steps ?? 0),
      active: t('minute', { count: a.active_minutes ?? 0 }),
      sleep: mmToHhMm(a.sleep_minutes ?? 0)
    });
  }, [data, nf, t]);

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

        <Row xs={1} md={3} className="g-3">
          <Col>
            <StatCard
              label={`${t('steps')} (${t('today')})`}
              value={nf.format(data.today?.steps ?? 0)}
              sub={`${t('avg', { days })}: ${nf.format(data.period.averages.steps ?? 0)}`}
              tooltip={t('stepsTip')}
            />
          </Col>
          <Col>
            <StatCard
              label={`${t('activeMinutes')} (${t('today')})`}
              value={t('minute', { count: data.today?.active_minutes ?? 0 })}
              sub={`${t('avg', { days })}: ${t('minute', { count: data.period.averages.active_minutes ?? 0 })}`}
              tooltip={t('activeMinutesTip')}
            />
          </Col>
          <Col>
            <StatCard
              label={`${t('sleep')} (${t('today')})`}
              value={mmToHhMm(data.today?.sleep_minutes ?? 0)}
              sub={`${t('avg', { days })}: ${mmToHhMm(data.period.averages.sleep_minutes ?? 0)}`}
              tooltip={t('sleepTip')}
            />
          </Col>
        </Row>

        {avgLine && <div className="small text-muted mt-3">{avgLine}</div>}
      </Card.Body>
    </Card>
  );
};

export default ActivitySummary;
