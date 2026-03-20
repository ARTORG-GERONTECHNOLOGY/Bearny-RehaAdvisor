import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Card, Row, Col, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import authStore from '../../stores/authStore';
import { patientVitalsStore } from '../../stores/patientVitalsStore';

const DailyVitalsPrompt: React.FC = observer(() => {
  const { t } = useTranslation();
  const userId = useMemo(() => localStorage.getItem('selectedPatient') || authStore.id, []);

  const [weight, setWeight] = useState<string>('');
  const [sys, setSys] = useState<string>('');
  const [dia, setDia] = useState<string>('');

  useEffect(() => {
    if (!userId) return;
    patientVitalsStore.checkExists(userId);
  }, [userId]);

  if (patientVitalsStore.loading || patientVitalsStore.exists) return null;

  const canSubmit =
    (weight.trim() !== '' && !isNaN(Number(weight))) ||
    (sys.trim() !== '' && !isNaN(Number(sys))) ||
    (dia.trim() !== '' && !isNaN(Number(dia)));

  const submit = async () => {
    await patientVitalsStore.submit(userId, {
      weight_kg: weight.trim() === '' ? null : Number(weight),
      bp_sys: sys.trim() === '' ? null : Number(sys),
      bp_dia: dia.trim() === '' ? null : Number(dia),
    });
  };

  return (
    <Card className="mb-3" style={{ borderLeft: '4px solid #0d6efd' }}>
      <Card.Body>
        <Row className="align-items-center mb-2">
          <Col>
            <div className="fw-semibold fs-5">{t('Today’s vitals')}</div>
            <div className="text-muted small">
              {t('Please enter your weight and blood pressure for today')} (
              {patientVitalsStore.today}).
            </div>
          </Col>
        </Row>

        {patientVitalsStore.successMsg && (
          <Alert
            variant="success"
            dismissible
            onClose={() => (patientVitalsStore.successMsg = '')}
            className="py-2"
          >
            {t(patientVitalsStore.successMsg)}
          </Alert>
        )}

        {patientVitalsStore.error && (
          <Alert variant="danger" className="py-2">
            {t(patientVitalsStore.error)}
          </Alert>
        )}

        <Row className="g-3">
          <Col xs={12} md={4}>
            <Form.Group controlId="vitals-weight">
              <Form.Label className="mb-1">
                {t('Weight (kg)')}{' '}
                <span className="text-muted fw-normal small">({t('optional')})</span>
              </Form.Label>
              <Form.Control
                type="number"
                inputMode="decimal"
                step="0.1"
                min="25"
                max="400"
                placeholder={t('e.g. 72.4')}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
              <div className="form-text text-secondary small fst-italic">
                {t('Enter your weight in kilograms.')}
              </div>
            </Form.Group>
          </Col>

          <Col xs={6} md={4}>
            <Form.Group controlId="vitals-sys">
              <Form.Label className="mb-1">
                {t('Systolic (mmHg)')}{' '}
                <span className="text-muted fw-normal small">({t('optional')})</span>
              </Form.Label>
              <Form.Control
                type="number"
                inputMode="numeric"
                step="1"
                min="60"
                max="250"
                placeholder={t('e.g. 120')}
                value={sys}
                onChange={(e) => setSys(e.target.value)}
              />
              <div className="form-text text-secondary small fst-italic">
                {t('Upper blood pressure number (while heart beats).')}
              </div>
            </Form.Group>
          </Col>

          <Col xs={6} md={4}>
            <Form.Group controlId="vitals-dia">
              <Form.Label className="mb-1">
                {t('Diastolic (mmHg)')}{' '}
                <span className="text-muted fw-normal small">({t('optional')})</span>
              </Form.Label>
              <Form.Control
                type="number"
                inputMode="numeric"
                step="1"
                min="40"
                max="150"
                placeholder={t('e.g. 80')}
                value={dia}
                onChange={(e) => setDia(e.target.value)}
              />
              <div className="form-text text-secondary small fst-italic">
                {t('Lower blood pressure number (while heart rests).')}
              </div>
            </Form.Group>
          </Col>
        </Row>

        <div className="d-flex flex-column flex-md-row gap-2 mt-3">
          <Button
            variant="primary"
            disabled={!canSubmit || patientVitalsStore.posting}
            onClick={submit}
          >
            {patientVitalsStore.posting && (
              <Spinner size="sm" className="me-2" animation="border" />
            )}
            {t('Save for today')}
          </Button>

          <div className="text-muted small align-self-center">
            <span className="fw-semibold">{t('Hint:')}</span>{' '}
            {t('You can provide either weight, blood pressure, or both.')}
          </div>
        </div>
      </Card.Body>
    </Card>
  );
});

export default DailyVitalsPrompt;
