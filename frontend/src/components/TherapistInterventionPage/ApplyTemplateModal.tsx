// src/components/TherapistInterventionPage/ApplyTemplateModal.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Button, Form, Row, Col, Alert, Spinner, Badge } from 'react-bootstrap';
import apiClient from '../../api/client';
import authStore from '../../stores/authStore';
import { useTranslation } from 'react-i18next';

type PatientOption = {
  _id: string;
  patient_code: string;
  first_name: string;
  name: string;
  diagnosis: string[];
};

type Props = {
  show: boolean;
  onHide: () => void;
  diagnoses: string[];
  defaultDiagnosis?: string;
  onApplied?: (res: {
    applied: number;
    sessions_created: number;
    patients_affected?: number;
  }) => void;
  templateId?: string;
};

type ErrMap = Record<string, string>;

const ApplyTemplateModal: React.FC<Props> = ({
  show,
  onHide,
  diagnoses,
  defaultDiagnosis,
  onApplied,
  templateId,
}) => {
  const { t } = useTranslation();

  const [mode, setMode] = useState<'patient' | 'diagnosis'>('patient');

  // Patient mode
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Diagnosis mode
  const [diagnosis, setDiagnosis] = useState(defaultDiagnosis || '');

  // Shared
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  );
  const [overwrite, setOverwrite] = useState(false);
  const [forceVideo, setForceVideo] = useState(false);
  const [notes, setNotes] = useState('');

  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ErrMap>({});
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Fetch clinic patients when modal opens ────────────────────────────────
  useEffect(() => {
    if (!show || !authStore.id) return;
    setLoadingPatients(true);
    apiClient
      .get(`therapists/${authStore.id}/patients/`)
      .then((res) => {
        const list: PatientOption[] = (res.data || []).map((p: any) => ({
          _id: p._id || p.id || '',
          patient_code: p.patient_code || '',
          first_name: p.first_name || '',
          name: p.name || '',
          diagnosis: p.diagnosis || [],
        }));
        setPatients(list);
      })
      .catch(() => setPatients([]))
      .finally(() => setLoadingPatients(false));
  }, [show]);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) =>
        p.patient_code.toLowerCase().includes(q) ||
        `${p.first_name} ${p.name}`.toLowerCase().includes(q)
    );
  }, [patients, patientSearch]);

  const togglePatient = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredPatients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPatients.map((p) => p._id)));
    }
  };

  const canSubmit = useMemo(() => {
    if (!effectiveFrom) return false;
    if (mode === 'patient') return selectedIds.size > 0;
    return !!diagnosis;
  }, [mode, selectedIds, diagnosis, effectiveFrom]);

  const humanize = (key: string) => {
    const map: Record<string, string> = {
      patientIds: t('Patients'),
      diagnosis: t('Diagnosis'),
      effectiveFrom: t('Effective from'),
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

  const hasUnsavedChanges = useMemo(() => {
    const baseEff = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const baseDiag = defaultDiagnosis || '';
    return (
      selectedIds.size > 0 ||
      diagnosis !== baseDiag ||
      effectiveFrom !== baseEff ||
      overwrite !== false ||
      forceVideo !== false ||
      notes.trim() !== ''
    );
  }, [selectedIds, diagnosis, effectiveFrom, overwrite, forceVideo, notes, defaultDiagnosis]);

  const confirmClose = useCallback(() => {
    if (submitting) {
      if (!window.confirm(t('A request is in progress. Do you want to close?'))) return;
    } else if (hasUnsavedChanges) {
      if (!window.confirm(t('Are you sure you want to close? Unsaved data will be lost.'))) return;
    }
    resetLocalErrors();
    setSubmitting(false);
    onHide();
  }, [hasUnsavedChanges, onHide, submitting, t]);

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

      const url = templateId
        ? `templates/${templateId}/apply/`
        : `therapists/${authStore.id}/templates/apply`;

      const res = await apiClient.post(url, {
        patientIds: mode === 'patient' ? Array.from(selectedIds) : undefined,
        diagnosis: mode === 'diagnosis' ? diagnosis : undefined,
        effectiveFrom,
        overwrite,
        require_video_feedback: forceVideo,
        notes,
      });

      onApplied?.(res.data);
      resetLocalErrors();
      setSubmitting(false);
      onHide();
    } catch (e: any) {
      console.error('apply_template error:', e?.response?.data || e);
      applyErrors(e?.response?.data || {});
      setSubmitting(false);
    }
  };

  return (
    <Modal
      show={show}
      onHide={confirmClose}
      onEscapeKeyDown={(e) => {
        e.preventDefault();
        confirmClose();
      }}
      centered
      backdrop="static"
      keyboard
      size="lg"
    >
      <Modal.Header closeButton>
        <Modal.Title>{t('Apply template to patient')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
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
          {/* Mode toggle */}
          <div className="d-flex gap-2 mb-3">
            <Button
              size="sm"
              variant={mode === 'patient' ? 'primary' : 'outline-secondary'}
              onClick={() => setMode('patient')}
            >
              {t('Select patients')}
            </Button>
            <Button
              size="sm"
              variant={mode === 'diagnosis' ? 'primary' : 'outline-secondary'}
              onClick={() => setMode('diagnosis')}
            >
              {t('By diagnosis')}
            </Button>
          </div>

          {/* ── Patient multi-select ── */}
          {mode === 'patient' && (
            <Form.Group className="mb-3">
              <Form.Label>
                {t('Patients')}{' '}
                {selectedIds.size > 0 && (
                  <Badge bg="primary" className="ms-1">
                    {selectedIds.size} {t('selected')}
                  </Badge>
                )}
              </Form.Label>

              {loadingPatients ? (
                <div className="text-center py-3">
                  <Spinner animation="border" size="sm" />
                </div>
              ) : (
                <>
                  <Form.Control
                    size="sm"
                    placeholder={t('Search')}
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    className="mb-2"
                  />
                  <div className="border rounded" style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {filteredPatients.length === 0 ? (
                      <div className="text-muted text-center py-3 small">
                        {t('No data available')}
                      </div>
                    ) : (
                      <>
                        {/* Select all row */}
                        <div
                          className="d-flex align-items-center px-3 py-2 border-bottom bg-light"
                          style={{ cursor: 'pointer' }}
                          onClick={toggleAll}
                        >
                          <Form.Check
                            type="checkbox"
                            readOnly
                            checked={
                              filteredPatients.length > 0 &&
                              selectedIds.size === filteredPatients.length
                            }
                            className="me-2 pointer-events-none"
                          />
                          <span className="small fw-semibold">{t('Select All')}</span>
                        </div>

                        {filteredPatients.map((p) => (
                          <div
                            key={p._id}
                            className={`d-flex align-items-center px-3 py-2 border-bottom ${selectedIds.has(p._id) ? 'bg-primary bg-opacity-10' : ''}`}
                            style={{ cursor: 'pointer' }}
                            onClick={() => togglePatient(p._id)}
                          >
                            <Form.Check
                              type="checkbox"
                              readOnly
                              checked={selectedIds.has(p._id)}
                              className="me-2 pointer-events-none"
                            />
                            <span className="small">
                              <strong>
                                {p.first_name} {p.name}
                              </strong>
                              <span className="text-muted ms-2">({p.patient_code})</span>
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                  {fieldErrors.patientIds && (
                    <div className="text-danger small mt-1">{fieldErrors.patientIds}</div>
                  )}
                </>
              )}
            </Form.Group>
          )}

          {/* ── Diagnosis bulk mode ── */}
          {mode === 'diagnosis' && (
            <Form.Group className="mb-3">
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
              <Form.Text className="text-muted">
                {t('Applies to all clinic patients with this diagnosis.')}
              </Form.Text>
              <Form.Control.Feedback type="invalid">{fieldErrors.diagnosis}</Form.Control.Feedback>
            </Form.Group>
          )}

          <Row className="mb-3">
            <Col md={6}>
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
