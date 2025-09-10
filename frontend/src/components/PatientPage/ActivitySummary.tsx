// src/components/PatientPage/ActivitySummary.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Col, Row, Spinner, OverlayTrigger, Tooltip, Button } from 'react-bootstrap';
import apiClient from '../../api/client';
import authStore from '../../stores/authStore';
import { useTranslation } from 'react-i18next';
type Summary = {
  connected: boolean;
  last_sync: string | null;
  today: { steps: number; active_minutes: number; sleep_minutes: number; resting_heart_rate?: number | null } | null;
  period: {
    days: number;
    totals: { steps: number; active_minutes: number; sleep_minutes: number };
    averages: { steps: number; active_minutes: number; sleep_minutes: number };
    daily: { date: string; steps: number; active_minutes: number; sleep_minutes: number }[];
  };
};

const mmToHhMm = (m: number) => {
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${hh}h ${mm.toString().padStart(2, '0')}m`;
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
const fetchData = async (range: number) => {
  try {
    setLoading(true);
    setError('');
    // 1) Try to let the API infer from the logged-in patient
    const r1 = await apiClient.get(`/fitbit/summary/?days=${range}`);
    setData(r1.data);
  } catch (e1: any) {
    // 2) If inference fails, retry with an id we have locally
    try {
      // Use the auth store id (works if it's the Mongo User id) OR a cached patient id if you keep one
      const anyId =
        (authStore as any)?.patientId ||
        (authStore as any)?.id ||
        localStorage.getItem('patientId');

      if (!anyId) throw e1;

      const r2 = await apiClient.get(`/fitbit/summary/${anyId}/?days=${range}`);
      setData(r2.data);
    } catch (e2: any) {
      setError(t(e2?.response?.data?.error) || t('Failed to load Fitbit data.'));
      setData(null);
    }
  } finally {
    setLoading(false);
  }
};


  useEffect(() => { fetchData(days); }, [days]);

  const avgLine = useMemo(() => {
    if (!data) return '';
    const a = data.period.averages;
    return `Avg: ${a.steps.toLocaleString()} steps • ${a.active_minutes} min active • ${mmToHhMm(a.sleep_minutes)} sleep`;
  }, [data]);

  if (loading) {
    return (
      <Card className="mb-4">
        <Card.Body className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" /> <span>{t('Loading Fitbit summary')}…</span>
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
        <div>{('My Activity')}</div>
        <div className="d-flex align-items-center gap-3">
          <div className="small text-muted">
            {data.last_sync ? `Last sync: ${new Date(data.last_sync).toLocaleString()}` : 'Not synced yet'}
          </div>
          <PeriodSwitch value={days} onChange={setDays} />
        </div>
      </Card.Header>
      <Card.Body>
        {!data.connected && (
          <div className="mb-3 text-warning">
            Your Fitbit is not connected yet. Connect to see real-time activity.
          </div>
        )}

        <Row xs={1} md={3} className="g-3">
          <Col>
            <StatCard
              label="Steps (today)"
              value={(data.today?.steps ?? 0).toLocaleString()}
              sub={`Period avg: ${data.period.averages.steps.toLocaleString()}`}
              tooltip="Total number of steps recorded."
            />
          </Col>
          <Col>
            <StatCard
              label="Active minutes (today)"
              value={`${data.today?.active_minutes ?? 0} min`}
              sub={`Period avg: ${data.period.averages.active_minutes} min`}
              tooltip="Minutes of activity above a light threshold."
            />
          </Col>
          <Col>
            <StatCard
              label="Sleep (last night)"
              value={mmToHhMm(data.today?.sleep_minutes ?? 0)}
              sub={`Period avg: ${mmToHhMm(data.period.averages.sleep_minutes)}`}
              tooltip="Estimated total sleep duration."
            />
          </Col>
        </Row>

        {avgLine && <div className="small text-muted mt-3">{avgLine}</div>}
      </Card.Body>
    </Card>
  );
};

export default ActivitySummary;
