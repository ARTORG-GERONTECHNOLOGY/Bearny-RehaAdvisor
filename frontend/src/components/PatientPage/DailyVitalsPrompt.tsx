import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Card, Row, Col, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import authStore from '../../stores/authStore';

type ExistsResp = { exists: boolean };

function isoLocalDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DailyVitalsPrompt: React.FC = () => {
  const { t } = useTranslation();
  const userId = useMemo(() => localStorage.getItem('selectedPatient') || authStore.id, []);
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);
  const [error, setError] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  const [sys, setSys] = useState<string>('');
  const [dia, setDia] = useState<string>('');
  const [posting, setPosting] = useState(false);

  const today = isoLocalDate();

  // Check if today's vitals already exist
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        // Preferred: a tiny status endpoint
        // GET /api/patients/vitals/exists/<patientId>/?date=YYYY-MM-DD -> { exists: boolean }
        const r = await axios.get<ExistsResp>(`/api/patients/vitals/exists/${userId}/`, {
          params: { date: today },
        });
        if (!cancelled) setExists(!!r.data?.exists);
      } catch {
        // Fallback: day slice from combined history and infer presence
        
          if (!cancelled) setError(t('Failed to check today’s vitals.'));

      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [t, today, userId]);

  if (loading || exists) return null; // hide while loading and once done for today

  const canSubmit =
    (weight.trim() !== '' && !isNaN(Number(weight))) ||
    ((sys.trim() !== '' && !isNaN(Number(sys))) || (dia.trim() !== '' && !isNaN(Number(dia))));

  const submit = async () => {
    setError('');
    setPosting(true);
    try {
      // POST /api/patients/vitals/manual/<patientId>/
      await axios.post(`/api/patients/vitals/manual/${userId}/`, {
        date: new Date().toISOString(),          // server will normalize
        weight_kg: weight.trim() === '' ? null : Number(weight),
        bp_sys:    sys.trim()    === '' ? null : Number(sys),
        bp_dia:    dia.trim()    === '' ? null : Number(dia),
      });
      setExists(true); // hide component after success
    } catch (e: any) {
      setError(e?.response?.data?.error || t('Failed to save today’s vitals. Please try again.'));
    } finally {
      setPosting(false);
    }
  };

  return (
    <Card className="mb-3" style={{ borderLeft: '4px solid #0d6efd' }}>
      <Card.Body>
        <Row className="align-items-center mb-2">
          <Col>
            <div className="fw-semibold">{t('Today’s vitals')}</div>
            <div className="text-muted small">{t('Please enter your weight and blood pressure for today')} ({today}).</div>
          </Col>
        </Row>

        {error && (
          <Alert variant="danger" className="py-2">{error}</Alert>
        )}

        <Row className="g-3">
          <Col xs={12} md={4}>
            <Form.Label className="mb-1">{t('Weight (kg)')}</Form.Label>
            <Form.Control
              type="number"
              inputMode="decimal"
              step="0.1"
              min="25"
              max="400"
              placeholder="72.4"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </Col>
          <Col xs={6} md={4}>
            <Form.Label className="mb-1">{t('Systolic (mmHg)')}</Form.Label>
            <Form.Control
              type="number"
              inputMode="numeric"
              step="1"
              min="60"
              max="250"
              placeholder="120"
              value={sys}
              onChange={(e) => setSys(e.target.value)}
            />
          </Col>
          <Col xs={6} md={4}>
            <Form.Label className="mb-1">{t('Diastolic (mmHg)')}</Form.Label>
            <Form.Control
              type="number"
              inputMode="numeric"
              step="1"
              min="40"
              max="150"
              placeholder="80"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
            />
          </Col>
        </Row>

        <div className="d-flex gap-2 mt-3">
          <Button
            variant="primary"
            disabled={!canSubmit || posting}
            onClick={submit}
          >
            {posting && <Spinner size="sm" className="me-2" animation="border" />} {t('Save for today')}
          </Button>
          <div className="text-muted small align-self-center">
            {t('You can provide either weight, blood pressure, or both.')}
          </div>
        </div>
      </Card.Body>
    </Card>
  );
};

export default DailyVitalsPrompt;
