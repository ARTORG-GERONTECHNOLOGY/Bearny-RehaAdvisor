// components/RehaTablePage/InterventionRepeatModal.tsx
import React, { useMemo, useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col, Alert } from 'react-bootstrap';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import apiClient from '../../api/client';
import authStore from '../../stores/authStore';
import config from '../../config/config.json';
import { t } from 'i18next';

type Mode = 'create' | 'modify';

const weekdays = ['Mon', 'Dien', 'Mitt', 'Don', 'Fre', 'Sam', 'Son'];

interface Props {
  show: boolean;
  onHide: () => void;
  onSuccess?: () => void;

  patient: string;                       // patient id (or key)
  intervention: string | { _id: string };// intervention id or {_id}

  // NEW (optional)
  mode?: Mode;                           // 'create' (default) | 'modify'
  therapistId?: string;
  defaults?: {
    effectiveFrom?: string;              // YYYY-MM-DD
    startTime?: string;                  // HH:mm
    interval?: number;
    unit?: 'day' | 'week' | 'month';
    selectedDays?: string[];
    end?: { type: 'never' | 'date' | 'count'; date?: string | null; count?: number | null };
    require_video_feedback?: boolean;
    keep_current?: boolean;
  };
}

const InterventionRepeatModal: React.FC<Props> = ({
  show,
  onHide,
  onSuccess,
  patient,
  intervention,
  mode = 'create',
  therapistId,
  defaults,
}) => {
  const isModify = mode === 'modify';

  // Core schedule state (same choices as before)
  const [interval, setInterval] = useState<number>(defaults?.interval ?? 1);
  const [unit, setUnit] = useState<'day' | 'week' | 'month'>(defaults?.unit ?? 'week');
  const [selectedDays, setSelectedDays] = useState<string[]>(defaults?.selectedDays ?? []);
  const [endOption, setEndOption] = useState<'never' | 'date' | 'count'>(defaults?.end?.type ?? 'never');
  const [endDate, setEndDate] = useState<Date | null>(
    defaults?.end?.date ? new Date(defaults.end.date) : null
  );
  const [occurrenceCount, setOccurrenceCount] = useState<number>(defaults?.end?.count ?? 10);
  const [startTime, setStartTime] = useState<string>(defaults?.startTime ?? '08:00');
  const [requireVideoFeedback, setRequireVideoFeedback] = useState<boolean>(
    !!defaults?.require_video_feedback
  );

  // The single date field (depends on mode)
  // create  -> Start Date
  // modify  -> Effective from
  const [startDateCreate, setStartDateCreate] = useState<Date | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState<Date | null>(
    defaults?.effectiveFrom ? new Date(defaults.effectiveFrom) : new Date()
  );

  // Modify-only: keep schedule unchanged (only update flags)
  const [keepCurrent, setKeepCurrent] = useState<boolean>(!!defaults?.keep_current);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);

  // Diagnosis routing (unchanged from your original)
  const specialisations = (authStore.specialisation || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const diagnoses = Array.isArray(specialisations)
    ? specialisations.flatMap((spec) => config?.patientInfo?.function?.[spec]?.diagnosis || [])
    : [];
  const isDiagnosis = diagnoses.includes(patient) || patient === 'all';

  // Keep defaults in sync when modal opens
  useEffect(() => {
    if (!show) return;
    setInterval(defaults?.interval ?? 1);
    setUnit((defaults?.unit as any) ?? 'week');
    setSelectedDays(defaults?.selectedDays ?? []);
    setEndOption(defaults?.end?.type ?? 'never');
    setEndDate(defaults?.end?.date ? new Date(defaults.end.date) : null);
    setOccurrenceCount(defaults?.end?.count ?? 10);
    setStartTime(defaults?.startTime ?? '08:00');
    setRequireVideoFeedback(!!defaults?.require_video_feedback);
    setKeepCurrent(!!defaults?.keep_current);
    setEffectiveFrom(defaults?.effectiveFrom ? new Date(defaults.effectiveFrom) : new Date());
    setStartDateCreate(null);
    setError('');
    setSuccess(false);
  }, [show, defaults]);

  const toggleDay = (day: string) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  // Build ISO datetime from the single date field + time
  const getCombinedStartISO = (): string | null => {
    const baseDate = isModify ? effectiveFrom : startDateCreate;
    if (!baseDate) return null;
    const [hh, mm] = (startTime || '08:00').split(':').map((n) => parseInt(n, 10));
    const dt = new Date(baseDate);
    dt.setHours(hh, mm, 0, 0);
    return dt.toISOString();
  };

  const canSubmit = useMemo(() => {
    if (!patient || !intervention) return false;
    if (isModify) {
      if (!effectiveFrom) return false;
      // if they keep current, we don't need the rest
      if (keepCurrent) return true;
      // otherwise we still need the scheduling inputs to be valid
      if (unit === 'week' && selectedDays.length === 0) return false;
      return true;
    } else {
      // create
      if (!startDateCreate) return false;
      if (unit === 'week' && selectedDays.length === 0) return false;
      return true;
    }
  }, [patient, intervention, isModify, effectiveFrom, keepCurrent, startDateCreate, unit, selectedDays.length]);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError('');

      const intId = typeof intervention === 'string' ? intervention : intervention._id;

      if (isModify) {
        // One date input only: Effective from
        const payload: any = {
          therapistId: therapistId || authStore.id,
          patientId: patient,
          interventionId: intId,
          effectiveFrom: effectiveFrom?.toISOString().slice(0, 10), // YYYY-MM-DD
          require_video_feedback: requireVideoFeedback,
          keep_current: keepCurrent || undefined,
        };

        if (!keepCurrent) {
          payload.schedule = {
            interval,
            unit,
            startDate: getCombinedStartISO(), // derived from Effective from + Start Time
            startTime,
            selectedDays,
            end: {
              type: endOption,
              date: endOption === 'date' && endDate ? endDate.toISOString() : null,
              count: endOption === 'count' ? occurrenceCount : null,
            },
          };
           
        }

        const res = await apiClient.post('/interventions/modify-patient/', payload);
        if (res.status === 200) {
          setSuccess(true);
          onSuccess?.();
          return;
        }
        setError(t('Failed to modify schedule.'));
      } else {
        // CREATE: one date input only: Start Date
        const payload = {
          therapistId: therapistId || authStore.id,
          patientId: patient,
          interventions: [
            {
              interval,
              interventionId: intId,
              unit,
              startDate: getCombinedStartISO(),
              selectedDays,
              end: {
                type: endOption,
                date: endOption === 'date' && endDate ? endDate : null,
                count: endOption === 'count' ? occurrenceCount : null,
              },
              require_video_feedback: requireVideoFeedback,
            },
          ],
        };

        const path = isDiagnosis
          ? 'interventions/assign-to-patient-types/'
          : 'interventions/add-to-patient/';

        const res = await apiClient.post(path, payload);
        if (res.status === 200 || res.status === 201) {
          setSuccess(true);
          onSuccess?.();
          return;
        }
        setError(t('Failed to add intervention.'));
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || t('Something went wrong.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered aria-labelledby="repeat-modal-title">
      <Modal.Header closeButton>
        <Modal.Title id="repeat-modal-title">
          {isModify ? t('Modify schedule') : t('Frequency')}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {error && (
          <Alert variant="danger" onClose={() => setError('')} dismissible>
            {error}
          </Alert>
        )}

        <Form>
          {/* SINGLE DATE FIELD */}
          {isModify ? (
            <Form.Group className="mb-3">
              <Form.Label>{t('Effective from')}</Form.Label>
              <DatePicker
                selected={effectiveFrom}
                onChange={(d) => setEffectiveFrom(d as Date)}
                className="form-control"
                dateFormat="yyyy-MM-dd"
              />
              <Form.Text className="text-muted">
                {t('Only sessions on or after this date will change. Past sessions stay as-is.')}
              </Form.Text>
            </Form.Group>
          ) : (
            <Form.Group className="mb-3">
              <Form.Label>{t('Start Date')}</Form.Label>
              <DatePicker
                selected={startDateCreate}
                onChange={(d) => setStartDateCreate(d as Date)}
                className="form-control"
                dateFormat="yyyy-MM-dd"
              />
            </Form.Group>
          )}

          {/* Modify-only: Keep current schedule */}
          {isModify && (
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                id="keep-current"
                label={t('Keep current schedule (only update flags)')}
                checked={keepCurrent}
                onChange={(e) => setKeepCurrent(e.target.checked)}
              />
            </Form.Group>
          )}

          {/* Start time (needed for both; in modify shown only if not keeping current) */}
          {(!isModify || (isModify && !keepCurrent)) && (
            <Form.Group as={Row} className="mb-3" controlId="start-time">
              <Form.Label column sm={4}>
                {t('Start Time')}
              </Form.Label>
              <Col sm={8}>
                <Form.Control
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </Col>
            </Form.Group>
          )}

          {/* Schedule controls (hidden if keepCurrent in modify) */}
          {(!isModify || (isModify && !keepCurrent)) && (
            <>
              <Form.Group as={Row} className="mb-3" controlId="repeat-every">
                <Form.Label column sm={4}>
                  {t('Repeat every')}
                </Form.Label>
                <Col sm={4}>
                  <Form.Control
                    type="number"
                    min="1"
                    value={interval}
                    onChange={(e) => setInterval(parseInt(e.target.value || '1', 10))}
                  />
                </Col>
                <Col sm={4}>
                  <Form.Select value={unit} onChange={(e) => setUnit(e.target.value as any)}>
                    <option value="day">{t('Day')}</option>
                    <option value="week">{t('Week')}</option>
                    <option value="month">{t('Month')}</option>
                  </Form.Select>
                </Col>
              </Form.Group>

              {unit === 'week' && (
                <Form.Group className="mb-3" role="group" aria-label={t('Select days of the week')}>
                  <div className="d-flex flex-wrap gap-2">
                    {weekdays.map((day) => (
                      <Button
                        key={day}
                        variant={selectedDays.includes(day) ? 'primary' : 'outline-secondary'}
                        onClick={() => toggleDay(day)}
                        aria-pressed={selectedDays.includes(day)}
                      >
                        {day}
                      </Button>
                    ))}
                  </div>
                </Form.Group>
              )}

              {/* End options */}
              <Form.Group className="mb-3" role="radiogroup" aria-label={t('End options')}>
                <Form.Label>{t('Ends')}</Form.Label>
                <div className="d-flex flex-column gap-2">
                  <Form.Check
                    type="radio"
                    label={t('Never')}
                    checked={endOption === 'never'}
                    onChange={() => setEndOption('never')}
                  />
                  <Form.Check
                    type="radio"
                    label={t('On date')}
                    checked={endOption === 'date'}
                    onChange={() => setEndOption('date')}
                  />
                  {endOption === 'date' && (
                    <DatePicker
                      selected={endDate}
                      onChange={(date) => setEndDate(date as Date)}
                      className="form-control"
                      dateFormat="yyyy-MM-dd"
                    />
                  )}
                  <Form.Check
                    type="radio"
                    label={t('After N times')}
                    checked={endOption === 'count'}
                    onChange={() => setEndOption('count')}
                  />
                  {endOption === 'count' && (
                    <Form.Control
                      type="number"
                      value={occurrenceCount}
                      onChange={(e) => setOccurrenceCount(parseInt(e.target.value || '0', 10))}
                    />
                  )}
                </div>
              </Form.Group>
            </>
          )}

          {/* Ask for video feedback */}
          <Form.Group className="mb-1">
            <Form.Check
              type="checkbox"
              id="require-video-feedback"
              label={t('Ask video feedback from patient')}
              checked={requireVideoFeedback}
              onChange={() => setRequireVideoFeedback((prev) => !prev)}
            />
            <Form.Text muted>
              {t('Patients will be prompted to upload or record a video of the exercise.')}
            </Form.Text>
          </Form.Group>
        </Form>
      </Modal.Body>

      <Modal.Footer>
        {!success ? (
          <>
            <Button variant="secondary" onClick={onHide} disabled={submitting}>
              {t('Cancel')}
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit || submitting}>
              {submitting ? t('Saving...') : isModify ? t('Save changes') : t('Save')}
            </Button>
          </>
        ) : (
          <Alert variant="success" className="w-100 text-center m-0">
            {t('Success!')}
          </Alert>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default InterventionRepeatModal;
