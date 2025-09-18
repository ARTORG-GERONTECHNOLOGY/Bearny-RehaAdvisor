// src/components/TherapistInterventionPage/ApplyTemplateModal.tsx
import React, { useMemo, useState } from 'react';
import { Modal, Button, Form, Row, Col, Alert } from 'react-bootstrap';
import apiClient from '../../api/client';
import authStore from '../../stores/authStore';
import { useTranslation } from 'react-i18next';

type Props = {
  show: boolean;
  onHide: () => void;
  diagnoses: string[];              // pass from TherapistRecomendations
  defaultDiagnosis?: string;
  onApplied?: (res: {applied:number; sessions_created:number}) => void;
};

const ApplyTemplateModal: React.FC<Props> = ({ show, onHide, diagnoses, defaultDiagnosis, onApplied }) => {
  const { t } = useTranslation();
  const [patientId, setPatientId] = useState<string>('');
  const [diagnosis, setDiagnosis] = useState<string>(defaultDiagnosis || '');
  const [effectiveFrom, setEffectiveFrom] = useState<string>(new Date(Date.now()+86400000).toISOString().slice(0,10));
  const [startTime, setStartTime] = useState<string>('08:00');
  const [overwrite, setOverwrite] = useState<boolean>(false);
  const [forceVideo, setForceVideo] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const canSubmit = useMemo(() => patientId && diagnosis && effectiveFrom, [patientId, diagnosis, effectiveFrom]);

  const handleApply = async () => {
    try {
      setSubmitting(true);
      setError('');
      const res = await apiClient.post(
        `therapists/${authStore.id}/templates/apply`,
        { patientId, diagnosis, effectiveFrom, startTime, overwrite, require_video_feedback: forceVideo, notes }
      );
      onApplied?.(res.data);
      onHide();
    } catch (e: any) {
      setError(
        e?.response?.data?.error ||
        e?.message ||
        t('Failed to apply template.')
      );
    } finally { setSubmitting(false); }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton><Modal.Title>{t('Apply template to patient')}</Modal.Title></Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" onClose={()=>setError('')} dismissible>{error}</Alert>}

        <Form>
          <Form.Group className="mb-3">
            <Form.Label>{t('Patient ID or username')}</Form.Label>
            <Form.Control
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            />
            <Form.Text className="text-muted">{t('Paste the patient _id or username.')}</Form.Text>
          </Form.Group>

          <Row className="mb-3">
            <Col md={7}>
              <Form.Group>
                <Form.Label>{t('Diagnosis_patient_list')}</Form.Label>
                <Form.Select value={diagnosis} onChange={(e)=>setDiagnosis(e.target.value)}>
                  <option value="">{t('Choose...')}</option>
                  {diagnoses.map((d)=> <option key={d} value={d}>{d}</option>)}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={5}>
              <Form.Group>
                <Form.Label>{t('Effective from')}</Form.Label>
                <Form.Control type="date" value={effectiveFrom} onChange={(e)=>setEffectiveFrom(e.target.value)} />
              </Form.Group>
            </Col>
          </Row>

          <Row className="mb-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label>{t('Start time')}</Form.Label>
                <Form.Control type="time" value={startTime} onChange={(e)=>setStartTime(e.target.value)} />
              </Form.Group>
            </Col>
            <Col md={6} className="d-flex align-items-end">
              <Form.Check
                type="checkbox"
                id="overwrite"
                label={t('Overwrite future sessions')}
                checked={overwrite}
                onChange={(e)=>setOverwrite(e.currentTarget.checked)}
              />
            </Col>
          </Row>

          <Form.Group className="mb-3">
            <Form.Check
              type="checkbox"
              id="force-video"
              label={t('Ask video feedback for all')}
              checked={forceVideo}
              onChange={(e)=>setForceVideo(e.currentTarget.checked)}
            />
          </Form.Group>

          <Form.Group>
            <Form.Label>{t('Notes (optional)')}</Form.Label>
            <Form.Control as="textarea" rows={2} value={notes} onChange={(e)=>setNotes(e.target.value)} />
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide} disabled={submitting}>{t('Cancel')}</Button>
        <Button variant="primary" onClick={handleApply} disabled={!canSubmit || submitting}>
          {submitting ? t('Applying...') : t('Apply')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ApplyTemplateModal;
