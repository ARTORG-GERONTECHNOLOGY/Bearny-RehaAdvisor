// src/components/TherapistInterventionPage/ApplyTemplateModal.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Button, Form, Row, Col, Alert } from 'react-bootstrap';
import apiClient from '../../api/client';
import authStore from '../../stores/authStore';
import { useTranslation } from 'react-i18next';

type Props = {
  show: boolean;
  onHide: () => void;
  diagnoses: string[];
  defaultDiagnosis?: string;
  onApplied?: (res: { applied: number; sessions_created: number }) => void;
};

type ErrMap = Record<string, string>;

const ApplyTemplateModal: React.FC<Props> = ({
  show,
  onHide,
  diagnoses,
  defaultDiagnosis,
  onApplied,
}) => {
  const { t } = useTranslation();

  const [patientId, setPatientId] = useState('');
  const [diagnosis, setDiagnosis] = useState(defaultDiagnosis || '');
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  );
  const [startTime, setStartTime] = useState('08:00');
  const [overwrite, setOverwrite] = useState(false);
  const [forceVideo, setForceVideo] = useState(false);
  const [notes, setNotes] = useState('');

  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ErrMap>({});
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => patientId && diagnosis && effectiveFrom,
    [patientId, diagnosis, effectiveFrom]
  );

  const humanize = (key: string) => {
    const map: Record<string, string> = {
      patientId: t('Patient ID'),
      diagnosis: t('Diagnosis'),
      effectiveFrom: t('Effective from'),
      startTime: t('Start time'),
    };
    return map[key] || key;
  };

  const applyErrors = (data: any) => {
    const fe: ErrMap = {};

    if (data?.field_errors) {
      Object.entries(data.field_errors).forEach(([k, v]) => {
        fe[k] = Array.isArray(v) ? v.join(' ') : String(v);
      });
    }

    setFieldErrors(fe);
    setShowErrors(Object.keys(fe).length > 0);

    const msg =
      (Array.isArray(data?.non_field_errors) && data.non_field_errors.join(' ')) ||
      data?.message ||
      data?.error ||
      t('An error occurred.');

    setError(msg);
  };

  const resetLocalErrors = () => {
    setError('');
    setFieldErrors({});
    setShowErrors(false);
  };

  // ✅ detect unsaved changes (for confirm close)
  const hasUnsavedChanges = useMemo(() => {
    const baseEff = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const baseDiag = defaultDiagnosis || '';
    return (
      patientId.trim() !== '' ||
      diagnosis !== baseDiag ||
      effectiveFrom !== baseEff ||
      startTime !== '08:00' ||
      overwrite !== false ||
      forceVideo !== false ||
      notes.trim() !== ''
    );
  }, [
    patientId,
    diagnosis,
    effectiveFrom,
    startTime,
    overwrite,
    forceVideo,
    notes,
    defaultDiagnosis,
  ]);

  // ✅ confirm-close used by X, Esc, Cancel
  const confirmClose = useCallback(() => {
    // If submitting, ask before aborting UI (request will still finish server-side)
    if (submitting) {
      if (!window.confirm(t('A request is in progress. Do you want to close?'))) return;
    } else if (hasUnsavedChanges) {
      if (!window.confirm(t('Are you sure you want to close? Unsaved data will be lost.'))) return;
    }

    resetLocalErrors();
    setSubmitting(false);
    onHide();
  }, [hasUnsavedChanges, onHide, submitting, t]);

  // ✅ Esc key should trigger the same close logic (even if backdrop is static elsewhere)
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

  const handleApply = async () => {
    if (!canSubmit) return;

    try {
      setSubmitting(true);
      resetLocalErrors();

      const res = await apiClient.post(`therapists/${authStore.id}/templates/apply`, {
        patientId,
        diagnosis,
        effectiveFrom,
        startTime,
        overwrite,
        require_video_feedback: forceVideo,
        notes,
      });

      onApplied?.(res.data);
      // Close after success (no confirm)
      resetLocalErrors();
      setSubmitting(false);
      onHide();
    } catch (e: any) {
      console.error('apply_template_to_patient error:', e?.response?.data || e);
      applyErrors(e?.response?.data || {});
      setSubmitting(false);
    }
  };

  return (
    <Modal
      show={show}
      onHide={confirmClose} // ✅ X button uses confirmClose
      onEscapeKeyDown={(e) => {
        e.preventDefault();
        confirmClose();
      }}
      centered
      backdrop="static"
      keyboard // ✅ enable Esc to reach onHide
    >
      <Modal.Header closeButton>
        <Modal.Title>{t('Apply template to patient')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {/* Error banner */}
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError('')}>
            <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
              <span>{error}</span>
              <Button size="sm" variant="light" onClick={() => setShowErrors(!showErrors)}>
                {showErrors ? t('Hide details') : t('Show details')}
              </Button>
            </div>

            {showErrors && Object.keys(fieldErrors).length > 0 && (
              <ul className="mt-2 mb-0">
                {Object.entries(fieldErrors).map(([key, msg]) => (
                  <li key={key}>
                    <strong>{humanize(key)}:</strong> {msg}
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        )}

        <Form>
          <Form.Group className="mb-3">
            <Form.Label>{t('Patient ID or username')}</Form.Label>
            <Form.Control
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              isInvalid={!!fieldErrors.patientId}
            />
            <Form.Control.Feedback type="invalid">{fieldErrors.patientId}</Form.Control.Feedback>
          </Form.Group>

          <Row className="mb-3">
            <Col md={7}>
              <Form.Group>
                <Form.Label>{t('Diagnosis_patient_list')}</Form.Label>
                <Form.Select
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  isInvalid={!!fieldErrors.diagnosis}
                >
                  <option value="">{t('Choose...')}</option>
                  {diagnoses.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Form.Select>
                <Form.Control.Feedback type="invalid">
                  {fieldErrors.diagnosis}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>

            <Col md={5}>
              <Form.Group>
                <Form.Label>{t('Effective from')}</Form.Label>
                <Form.Control
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  isInvalid={!!fieldErrors.effectiveFrom}
                />
                <Form.Control.Feedback type="invalid">
                  {fieldErrors.effectiveFrom}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
          </Row>

          <Row className="mb-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label>{t('Start time')}</Form.Label>
                <Form.Control
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  isInvalid={!!fieldErrors.startTime}
                />
                <Form.Control.Feedback type="invalid">
                  {fieldErrors.startTime}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>

            <Col md={6} className="d-flex align-items-end">
              <Form.Check
                type="checkbox"
                id="overwrite"
                label={t('Overwrite future sessions')}
                checked={overwrite}
                onChange={(e) => setOverwrite(e.currentTarget.checked)}
              />
            </Col>
          </Row>

          <Form.Group className="mb-3">
            <Form.Check
              type="checkbox"
              id="force-video"
              label={t('Ask video feedback for all')}
              checked={forceVideo}
              onChange={(e) => setForceVideo(e.currentTarget.checked)}
            />
          </Form.Group>

          <Form.Group>
            <Form.Label>{t('Notes (optional)')}</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Form.Group>
        </Form>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={confirmClose} disabled={submitting}>
          {t('Cancel')}
        </Button>
        <Button variant="primary" onClick={handleApply} disabled={!canSubmit || submitting}>
          {submitting ? t('Applying...') : t('Apply')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ApplyTemplateModal;
