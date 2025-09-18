// components/TherapistInterventionPage/TemplateAssignModal.tsx
import React, { useMemo, useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col, Alert } from 'react-bootstrap';
import apiClient from '../../api/client';
import authStore from '../../stores/authStore';
import { useTranslation } from 'react-i18next';

type Mode = 'create' | 'modify';

type Props = {
  show: boolean;
  onHide: () => void;
  interventionId: string | null;
  diagnoses: string[];
  defaultDiagnosis?: string;
  onSuccess?: () => void;
  mode?: Mode; // create | modify
};

const TemplateAssignModal: React.FC<Props> = ({
  show,
  onHide,
  interventionId,
  diagnoses,
  defaultDiagnosis,
  onSuccess,
  mode = 'create',
}) => {
  const { t } = useTranslation();

  // Day S..N, every K days (relative to program start)
  const [diagnosis, setDiagnosis] = useState(defaultDiagnosis || '');
  const [startDay, setStartDay] = useState<number>(1);   // S
  const [lastDay, setLastDay]   = useState<number>(10);  // N
  const [everyK, setEveryK]     = useState<number>(1);   // K

  // NEW: suggested execution time (HH:mm)
  const [startTime, setStartTime] = useState<string>('08:00');

  // Only relevant for modify mode: keep days < S unchanged
  const [keepPrevious, setKeepPrevious] = useState<boolean>(mode === 'modify');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!show) return;
    setDiagnosis(defaultDiagnosis || '');
    setStartDay(1);
    setLastDay(10);
    setEveryK(1);
    setStartTime('08:00');            // reset suggested time
    setKeepPrevious(mode === 'modify'); // default ON in modify mode
    setError('');
    setSubmitting(false);
  }, [show, defaultDiagnosis, mode]);

  const validRange = startDay >= 1 && lastDay >= startDay;
  const canSubmit = useMemo(
    () => !!interventionId && !!diagnosis && validRange && everyK >= 1,
    [interventionId, diagnosis, validRange, everyK]
  );

  const occurrencesCount = useMemo(() => {
    if (!validRange || everyK < 1) return 0;
    return Math.floor((lastDay - startDay) / everyK) + 1; // S, S+K, ... ≤ N
  }, [startDay, lastDay, everyK, validRange]);

  const handleSave = async () => {
    try {
      if (!canSubmit || !interventionId) return;
      setSubmitting(true);
      setError('');

      const startOffsetDays = Math.max(0, startDay - 1);

      // Store/override template settings per diagnosis
      // BE can read startTime (camel) or map to start_time (snake) as needed.
      const payload = {
        therapistId: authStore.id,
        patientId: diagnosis, // diagnosis key
        interventions: [
          {
            interventionId,
            interval: everyK,
            unit: 'day',
            selectedDays: [],
            start_day: startDay,
            start_offset_days: startOffsetDays,
            startTime,                         // ← suggested execution time (HH:mm)
            keep_previous: mode === 'modify' ? !!keepPrevious : undefined,
            end: { type: 'count', count: lastDay },
          },
        ],
      };

      const res = await apiClient.post(`therapists/${authStore.id}/interventions/assign-to-patient-types/`, payload);
      if (res.status === 200 || res.status === 201) {
        onSuccess?.();
        onHide();
      } else {
        setError(t('Failed to save template assignment.'));
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || t('Something went wrong.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>
          {mode === 'modify' ? t('Modify template (from day S)') : t('Add to template (Day S → N)')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert variant="danger" onClose={() => setError('')} dismissible>
            {error}
          </Alert>
        )}

        <Form>
          <Form.Group className="mb-3">
            <Form.Label>{t('Diagnosis_patient_list')}</Form.Label>
            <Form.Select value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)}>
              <option value="">{t('Choose...')}</option>
              {diagnoses.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Form.Select>
          </Form.Group>

          <Row className="mb-3">
            <Col md={4}>
              <Form.Label>{t('Start day (S)')}</Form.Label>
              <Form.Control
                type="number"
                min={1}
                value={startDay}
                onChange={(e) => setStartDay(parseInt(e.target.value || '1', 10))}
                isInvalid={startDay < 1 || startDay > lastDay}
              />
              <Form.Control.Feedback type="invalid">
                {t('Start day must be ≥ 1 and ≤ last day.')}
              </Form.Control.Feedback>
            </Col>

            <Col md={4}>
              <Form.Label>{t('Last day (N)')}</Form.Label>
              <Form.Control
                type="number"
                min={1}
                value={lastDay}
                onChange={(e) => setLastDay(parseInt(e.target.value || '1', 10))}
                isInvalid={lastDay < startDay}
              />
              <Form.Control.Feedback type="invalid">
                {t('Last day must be ≥ start day.')}
              </Form.Control.Feedback>
              <Form.Text muted>
                {t('Generates Day S, Day S+K, … until Day N.')}
              </Form.Text>
            </Col>

            <Col md={4}>
              <Form.Label>{t('Every K days')}</Form.Label>
              <Form.Control
                type="number"
                min={1}
                value={everyK}
                onChange={(e) => setEveryK(parseInt(e.target.value || '1', 10))}
                isInvalid={everyK < 1}
              />
              <Form.Control.Feedback type="invalid">
                {t('K must be at least 1.')}
              </Form.Control.Feedback>
              <Form.Text muted>
                {t('e.g., K=1 daily; K=2 every second day')}
              </Form.Text>
            </Col>
          </Row>

          {/* NEW: Suggested execution time */}
          <Form.Group className="mb-3">
            <Form.Label>{t('Suggested execution time')}</Form.Label>
            <Form.Control
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            <Form.Text muted>
              {t('Shown when applying the template to a patient; can be overridden.')}
            </Form.Text>
          </Form.Group>

          {mode === 'modify' && (
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                id="keep-previous"
                label={t('Modify from day S onward — keep earlier days unchanged')}
                checked={keepPrevious}
                onChange={(e) => setKeepPrevious(e.target.checked)}
              />
            </Form.Group>
          )}

          <Alert variant="info" className="mb-2">
            {t(
              'These are relative template days. Actual calendar dates are set when you apply the template to a patient.'
            )}
          </Alert>

          <div className="text-muted">
            {validRange && everyK >= 1
              ? t('Preview: {{count}} session(s): Day {{S}}, Day {{S}}+{{K}}, … ≤ Day {{N}} at ~{{time}}', {
                  count: occurrencesCount,
                  S: startDay,
                  K: everyK,
                  N: lastDay,
                  time: startTime || '—',
                })
              : t('Please enter a valid range (S ≤ N) and K ≥ 1.')}
          </div>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide} disabled={submitting}>
          {t('Cancel')}
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={!canSubmit || submitting}>
          {submitting ? t('Saving...') : t('Save')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default TemplateAssignModal;
