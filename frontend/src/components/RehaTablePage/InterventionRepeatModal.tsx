// src/components/RehaTablePage/InterventionRepeatModal.tsx

import React, { useMemo, useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col, Alert } from 'react-bootstrap';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import apiClient from '../../api/client';
import authStore from '../../stores/authStore';
import config from '../../config/config.json';
import { t } from 'i18next';

type Mode = 'create' | 'modify';

// Helper utilities
const toOrdinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const joinDays = (days: string[] = []) => (days.length ? days.join(', ') : '…');

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  show: boolean;
  onHide: () => void;
  onSuccess?: () => void;
  patient: string;
  intervention: string | { _id: string };
  mode?: Mode;
  therapistId?: string;
  defaults?: {
    effectiveFrom?: string;
    startTime?: string;
    interval?: number;
    unit?: 'day' | 'week' | 'month';
    selectedDays?: string[];
    end?: {
      type: 'never' | 'date' | 'count';
      date?: string | null;
      count?: number | null;
    };
    require_video_feedback?: boolean;
    keep_current?: boolean;
    notes?: string;
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

  // STATE --------------------------------------------------------
  const [interval, setInterval] = useState(defaults?.interval ?? 1);
  const [unit, setUnit] = useState<'day' | 'week' | 'month'>(defaults?.unit ?? 'week');
  const [selectedDays, setSelectedDays] = useState<string[]>(defaults?.selectedDays ?? []);
  const [endOption, setEndOption] = useState<'never' | 'date' | 'count'>(defaults?.end?.type ?? 'never');
  const [endDate, setEndDate] = useState<Date | null>(
    defaults?.end?.date ? new Date(defaults.end.date) : null
  );
  const [occurrenceCount, setOccurrenceCount] = useState(defaults?.end?.count ?? 10);
  const [startTime, setStartTime] = useState(defaults?.startTime ?? '08:00');
  const [requireVideoFeedback, setRequireVideoFeedback] = useState(
    !!defaults?.require_video_feedback
  );

  const [startDateCreate, setStartDateCreate] = useState<Date | null>(
    mode === 'create' ? new Date() : null
  );
  const [effectiveFrom, setEffectiveFrom] = useState<Date | null>(
    defaults?.effectiveFrom ? new Date(defaults.effectiveFrom) : new Date()
  );

  const [keepCurrent, setKeepCurrent] = useState<boolean>(!!defaults?.keep_current);
  const [personalNote, setPersonalNote] = useState(defaults?.notes ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Unified error
  const [error, setError] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Determine diagnosis-based routing
  const specialisations = (authStore.specialisation || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const diagnoses = Array.isArray(specialisations)
    ? specialisations.flatMap((spec) => config?.patientInfo?.function?.[spec]?.diagnosis || [])
    : [];

  const isDiagnosis = diagnoses.includes(patient) || patient === 'all';

  // RESET ON OPEN ------------------------------------------------
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
    setStartDateCreate(mode === 'create' ? new Date() : null);

    setPersonalNote(defaults?.notes ?? '');
    setFieldErrors({});
    setError('');
    setSuccess(false);
  }, [show, defaults, mode]);

  // UI Helpers ---------------------------------------------------
  const toggleDay = (day: string) =>
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );

  const getCombinedStartISO = (): string | null => {
    const dt = new Date(isModify ? effectiveFrom! : startDateCreate!);
    const [hh, mm] = startTime.split(':').map(Number);
    dt.setHours(hh, mm, 0, 0);
    return dt.toISOString();
  };

  const summary = useMemo(() => {
    if (unit === 'day') {
      return interval === 1
        ? t('Occurs every day.')
        : t('Occurs every {{ord}} day.', { ord: toOrdinal(interval) });
    }
    if (unit === 'week') {
      return interval === 1
        ? t('Occurs weekly on {{days}}.', { days: joinDays(selectedDays) })
        : t('Occurs every {{ord}} weeks on {{days}}.', {
            ord: toOrdinal(interval),
            days: joinDays(selectedDays),
          });
    }
    return interval === 1
      ? t('Occurs monthly on the same date.')
      : t('Occurs every {{ord}} months on the same date.', { ord: toOrdinal(interval) });
  }, [interval, unit, selectedDays]);

  const canSubmit = useMemo(() => {
    if (!patient || !intervention) return false;
    if (isModify) {
      if (!effectiveFrom) return false;
      if (keepCurrent) return true;
      if (unit === 'week' && selectedDays.length === 0) return false;
      return true;
    }
    if (!startDateCreate) return false;
    if (unit === 'week' && selectedDays.length === 0) return false;
    return true;
  }, [patient, intervention, isModify, keepCurrent, effectiveFrom, startDateCreate, unit, selectedDays]);

  // VALIDATION ---------------------------------------------------
  const validate = (): string[] => {
    const errs: Record<string, string> = {};

    if (!startTime) errs.startTime = t('Please choose a start time.');
    if (interval < 1) errs.interval = t('Interval must be >= 1.');

    if (!isModify && !startDateCreate)
      errs.startDateCreate = t('Please choose a start date.');

    if (isModify && !effectiveFrom)
      errs.effectiveFrom = t('Please choose an effective date.');

    if (!(isModify && keepCurrent)) {
      if (unit === 'week' && selectedDays.length === 0)
        errs.selectedDays = t('Select at least one weekday.');
      if (endOption === 'date' && !endDate)
        errs.endDate = t('Pick an end date.');
      if (endOption === 'count' && (!occurrenceCount || occurrenceCount < 1))
        errs.occurrenceCount = t('Number of occurrences must be >= 1.');
    }

    setFieldErrors(errs);
    return Object.values(errs);
  };

  // SUBMIT --------------------------------------------------------
  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    const problems = validate();
    if (problems.length) {
      setSubmitting(false);
      return;
    }

    try {
      const intId = typeof intervention === 'string' ? intervention : intervention._id;

      // -------- MODIFY MODE --------
      if (isModify) {
        const payload: any = {
          therapistId: therapistId || authStore.id,
          patientId: patient,
          interventionId: intId,
          effectiveFrom: effectiveFrom?.toISOString().slice(0, 10),
          require_video_feedback: requireVideoFeedback,
          keep_current: keepCurrent,
          notes: personalNote ?? '',
        };

        if (!keepCurrent) {
          payload.schedule = {
            interval,
            unit,
            startDate: getCombinedStartISO(),
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
      }

      // -------- CREATE MODE --------
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
              date: endOption === 'date' && endDate ? endDate.toISOString() : null,
              count: endOption === 'count' ? occurrenceCount : null,
            },
            require_video_feedback: requireVideoFeedback,
            notes: personalNote ?? '',
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
    } catch (err: any) {
      // Advanced backend error extraction
      const api = err?.response?.data;

      const fErrs = api?.field_errors
        ? Object.entries(api.field_errors).flatMap(([field, arr]) =>
            (arr as string[]).map((msg) => `${field}: ${msg}`)
          )
        : [];

      const nfErrs = api?.non_field_errors || [];
      const message = api?.message || api?.error || err.message;

      const all = [...fErrs, ...nfErrs];

      setError(
        all.length > 0
          ? `${message}\n• ${all.join('\n• ')}`
          : message || t('Something went wrong.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ----------------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------------
  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>{isModify ? t('Modify schedule') : t('Frequency')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {error && (
          <Alert
            variant="danger"
            dismissible
            onClose={() => setError('')}
            style={{ whiteSpace: 'pre-wrap' }}
          >
            {error}
          </Alert>
        )}

        {Object.keys(fieldErrors).length > 0 && (
          <Alert variant="danger">
            <ul className="mb-0">
              {Object.entries(fieldErrors).map(([key, msg]) => (
                <li key={key}>{msg}</li>
              ))}
            </ul>
          </Alert>
        )}

        <Form>
          {/* DATE FIELD */}
          {isModify ? (
            <Form.Group className="mb-3">
              <Form.Label>{t('Effective from')}</Form.Label>
              <DatePicker
                selected={effectiveFrom}
                onChange={(d) => setEffectiveFrom(d as Date)}
                className="form-control"
                dateFormat="yyyy-MM-dd"
              />
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

          {/* KEEP CURRENT */}
          {isModify && (
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label={t('Keep current schedule (only update flags)')}
                checked={keepCurrent}
                onChange={(e) => setKeepCurrent(e.target.checked)}
              />
            </Form.Group>
          )}

          {/* TIME FIELD */}
          {(!isModify || !keepCurrent) && (
            <Form.Group as={Row} className="mb-3">
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

          {/* SCHEDULE SETTINGS */}
          {(!isModify || !keepCurrent) && (
            <>
              <Form.Group as={Row} className="mb-3">
                <Form.Label column sm={4}>
                  {t('Repeat every')}
                </Form.Label>
                <Col sm={4}>
                  <Form.Control
                    type="number"
                    min="1"
                    value={interval}
                    onChange={(e) => setInterval(Number(e.target.value))}
                  />
                </Col>
                <Col sm={4}>
                  <Form.Select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as any)}
                  >
                    <option value="day">{t('Day')}</option>
                    <option value="week">{t('Week')}</option>
                    <option value="month">{t('Month')}</option>
                  </Form.Select>
                </Col>

                <Col xs={12}>
                  <Form.Text muted>{summary}</Form.Text>
                </Col>
              </Form.Group>

              {/* Select days */}
              {unit === 'week' && (
                <Form.Group className="mb-3">
                  <div className="d-flex flex-wrap gap-2">
                    {weekdays.map((day) => (
                      <Button
                        key={day}
                        variant={
                          selectedDays.includes(day)
                            ? 'primary'
                            : 'outline-secondary'
                        }
                        onClick={() => toggleDay(day)}
                      >
                        {t(day)}
                      </Button>
                    ))}
                  </div>
                </Form.Group>
              )}

              {/* END OPTIONS */}
              <Form.Group className="mb-3">
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
                      onChange={(d) => setEndDate(d as Date)}
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
                      onChange={(e) =>
                        setOccurrenceCount(Number(e.target.value))
                      }
                    />
                  )}
                </div>
              </Form.Group>
            </>
          )}

          {/* NOTES */}
          <Form.Group className="mb-3">
            <Form.Label>{t('Personal instructions for the patient')}</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={personalNote}
              onChange={(e) => setPersonalNote(e.target.value)}
              placeholder={t(
                'e.g., Keep shoulders relaxed; perform slowly and stop if pain > 4/10.'
              )}
            />
          </Form.Group>

          {/* VIDEO FEEDBACK */}
          <Form.Group className="mb-3">
            <Form.Check
              type="checkbox"
              label={t('Ask video feedback from patient')}
              checked={requireVideoFeedback}
              onChange={() => setRequireVideoFeedback((prev) => !prev)}
            />
          </Form.Group>
        </Form>
      </Modal.Body>

      <Modal.Footer>
        {!success ? (
          <>
            <Button variant="secondary" onClick={onHide} disabled={submitting}>
              {t('Cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
            >
              {submitting
                ? t('Saving...')
                : isModify
                ? t('Save changes')
                : t('Save')}
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
