// components/TherapistInterventionPage/TemplateAssignModal.tsx
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Modal, Button, Form, Row, Col, Alert } from 'react-bootstrap';
import apiClient from '../../api/client';
import authStore from '../../stores/authStore';
import { useTranslation } from 'react-i18next';

type Mode = 'create' | 'modify';

type Props = {
  show: boolean;
  onHide: () => void;
  interventionId: string | null;
  interventionTitle?: string;
  diagnoses: string[];
  defaultDiagnosis?: string;
  onSuccess?: () => void;
  mode?: Mode;
};

type ErrorMap = Record<string, string>;

const TemplateAssignModal: React.FC<Props> = ({
  show,
  onHide,
  interventionId,
  interventionTitle,
  diagnoses,
  defaultDiagnosis,
  onSuccess,
  mode = 'create',
}) => {
  const { t } = useTranslation();

  const [diagnosis, setDiagnosis] = useState(defaultDiagnosis || '');
  const [startDay, setStartDay] = useState<number>(1);
  const [lastDay, setLastDay] = useState<number>(10);
  const [everyK, setEveryK] = useState<number>(1);

  const [startTime, setStartTime] = useState<string>('08:00');
  const [keepPrevious, setKeepPrevious] = useState<boolean>(mode === 'modify');

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ErrorMap>({});
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  useEffect(() => {
    if (!show) return;

    setDiagnosis(defaultDiagnosis || '');
    setStartDay(1);
    setLastDay(10);
    setEveryK(1);
    setStartTime('08:00');
    setKeepPrevious(mode === 'modify');

    setError('');
    setFieldErrors({});
    setShowErrorDetails(false);
    setSubmitting(false);
    setSuccess(false);
  }, [show, defaultDiagnosis, mode]);

  const validRange = startDay >= 1 && lastDay >= startDay;
  const canSubmit = useMemo(
    () => !!interventionId && !!diagnosis && validRange && everyK >= 1,
    [interventionId, diagnosis, validRange, everyK]
  );

  const occurrencesCount = useMemo(() => {
    if (!validRange || everyK < 1) return 0;
    return Math.floor((lastDay - startDay) / everyK) + 1;
  }, [startDay, lastDay, everyK, validRange]);

  // track local edits for confirm-close (minimal: diagnosis / startDay / lastDay / everyK / time / checkbox / error)
  const hasUnsavedChanges = useMemo(() => {
    // After successful save, no unsaved changes
    if (success) return false;

    const diagChanged = (diagnosis || '') !== (defaultDiagnosis || '');
    const defaultsChanged =
      startDay !== 1 ||
      lastDay !== 10 ||
      everyK !== 1 ||
      startTime !== '08:00' ||
      (mode === 'modify' ? keepPrevious !== true : keepPrevious !== false);
    return diagChanged || defaultsChanged || !!error;
  }, [
    success,
    diagnosis,
    defaultDiagnosis,
    startDay,
    lastDay,
    everyK,
    startTime,
    keepPrevious,
    mode,
    error,
  ]);

  /* ---------------- ERROR HANDLER ---------------- */
  const applyBackendErrors = (data: any) => {
    const fe: ErrorMap = {};

    if (data?.field_errors) {
      Object.entries(data.field_errors).forEach(([k, v]) => {
        fe[k] = Array.isArray(v) ? v.join(' ') : String(v);
      });
    }

    setFieldErrors(fe);

    const nf =
      (data?.non_field_errors && data.non_field_errors.join(' ')) ||
      data?.message ||
      data?.error ||
      t('Something went wrong.');

    setError(nf);
    setShowErrorDetails(Object.keys(fe).length > 0);
  };

  // ✅ close handler used by X, Esc, and programmatic close
  const confirmClose = useCallback(() => {
    if (submitting) return; // avoid closing mid-submit

    if (hasUnsavedChanges) {
      const ok = window.confirm(t('Close this window? Unsaved changes will be lost.'));
      if (!ok) return;
    }

    setError('');
    setFieldErrors({});
    setShowErrorDetails(false);
    setSubmitting(false);

    onHide();
  }, [hasUnsavedChanges, onHide, submitting, t]);

  // ✅ Esc should trigger same logic
  useEffect(() => {
    if (!show) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        confirmClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [show, confirmClose]);

  /* ---------------- SAVE ---------------- */
  const handleSave = async () => {
    try {
      if (!canSubmit || !interventionId) return;

      setSubmitting(true);
      setError('');
      setFieldErrors({});
      setShowErrorDetails(false);

      // Convert HH:MM → minutes integer
      const [h, m] = startTime.split(':').map(Number);
      const suggestedExecution = h * 60 + m;

      const payload = {
        therapistId: authStore.id,
        patientId: diagnosis, // BE expects diagnosis here
        interventions: [
          {
            interventionId,
            interval: everyK,
            unit: 'day',
            selectedDays: [],
            start_day: startDay,
            end: { type: 'count', count: lastDay },
            keep_previous: mode === 'modify' ? !!keepPrevious : undefined,
            suggested_execution_time: suggestedExecution,
          },
        ],
      };

      const res = await apiClient.post(
        `therapists/${authStore.id}/interventions/assign-to-patient-types/`,
        payload
      );

      if (res.status === 201 || res.status === 200) {
        setSuccess(true);
        onSuccess?.();

        // Auto-close after showing success message briefly
        setTimeout(() => {
          onHide();
        }, 1500);
      } else {
        setError(t('Failed to save template assignment.'));
      }
    } catch (e: any) {
      applyBackendErrors(e?.response?.data || {});
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      show={show}
      onHide={confirmClose} // ✅ X uses confirmClose
      onEscapeKeyDown={(e) => {
        e.preventDefault();
        confirmClose();
      }}
      centered
      backdrop="static"
      keyboard // ✅ Esc triggers onHide
    >
      <Modal.Header closeButton>
        <Modal.Title>
          {mode === 'modify' ? t('Modify template (from day S)') : t('Add to template (Day S → N)')}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {/* SUCCESS BANNER */}
        {success && <Alert variant="success">{t('Intervention successfully added')}</Alert>}

        {/* ERROR BANNER */}
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError('')}>
            <div className="d-flex justify-content-between">
              <span>{error}</span>
              <Button
                size="sm"
                onClick={() => setShowErrorDetails(!showErrorDetails)}
                variant="light"
              >
                {showErrorDetails ? t('Hide details') : t('Show details')}
              </Button>
            </div>

            {showErrorDetails && Object.keys(fieldErrors).length > 0 && (
              <ul className="mt-2 mb-0">
                {Object.entries(fieldErrors).map(([k, v]) => (
                  <li key={k}>
                    <strong>{k}:</strong> {v}
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        )}

        <Form>
          {/* INTERVENTION TITLE */}
          {interventionTitle && (
            <Form.Group className="mb-3">
              <Form.Label>{t('Intervention')}</Form.Label>
              <div className="fw-semibold">{interventionTitle}</div>
            </Form.Group>
          )}
          <Form.Group className="mb-3">
            <Form.Label>{t('Diagnosis_patient_list')}</Form.Label>
            <Form.Select
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              isInvalid={!!fieldErrors['patientId']}
            >
              <option value="">{t('Choose...')}</option>
              {diagnoses.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Form.Select>
            <Form.Control.Feedback type="invalid">{fieldErrors['patientId']}</Form.Control.Feedback>
          </Form.Group>

          {/* Start / End / Interval */}
          <Row className="mb-3">
            <Col md={4}>
              <Form.Label>{t('Start day (S)')}</Form.Label>
              <Form.Control
                type="number"
                value={startDay}
                min={1}
                onChange={(e) => setStartDay(parseInt(e.target.value || '1', 10))}
                isInvalid={!!fieldErrors['interventions[0].start_day']}
              />
              <Form.Control.Feedback type="invalid">
                {fieldErrors['interventions[0].start_day']}
              </Form.Control.Feedback>
            </Col>

            <Col md={4}>
              <Form.Label>{t('Last day (N)')}</Form.Label>
              <Form.Control
                type="number"
                value={lastDay}
                min={startDay}
                onChange={(e) => setLastDay(parseInt(e.target.value || '1', 10))}
                isInvalid={!!fieldErrors['interventions[0].end.count']}
              />
              <Form.Control.Feedback type="invalid">
                {fieldErrors['interventions[0].end.count']}
              </Form.Control.Feedback>
            </Col>

            <Col md={4}>
              <Form.Label>{t('Every K days')}</Form.Label>
              <Form.Control
                type="number"
                value={everyK}
                min={1}
                onChange={(e) => setEveryK(parseInt(e.target.value || '1', 10))}
                isInvalid={!!fieldErrors['interventions[0].interval']}
              />
              <Form.Control.Feedback type="invalid">
                {fieldErrors['interventions[0].interval']}
              </Form.Control.Feedback>
            </Col>
          </Row>

          {/* Suggested execution time */}
          <Form.Group className="mb-3">
            <Form.Label>{t('Suggested execution time')}</Form.Label>
            <Form.Control
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            <small className="text-muted">
              {t('Shown when applying the template to a patient')}
            </small>
          </Form.Group>

          {mode === 'modify' && (
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label={t('Modify from day S onward — keep earlier days unchanged')}
                checked={keepPrevious}
                onChange={(e) => setKeepPrevious(e.target.checked)}
              />
            </Form.Group>
          )}

          <Alert variant="info">
            {t(
              'These are relative template days. Actual calendar dates are set when applying to a patient.'
            )}
          </Alert>

          <div className="text-muted">
            {validRange
              ? t('{{count}} session(s): Days S,S+K,…≤N at ~{{time}}', {
                  count: occurrencesCount,
                  time: startTime,
                })
              : t('Invalid range.')}
          </div>
        </Form>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={confirmClose} disabled={submitting || success}>
          {t('Cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!canSubmit || submitting || success}
        >
          {submitting ? t('Saving...') : success ? t('Saved!') : t('Save')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default TemplateAssignModal;
