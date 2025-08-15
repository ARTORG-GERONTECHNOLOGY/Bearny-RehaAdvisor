// components/RehaTablePage/InterventionRepeatModal.tsx
import React, { useMemo, useState } from 'react';
import { Modal, Button, Form, Row, Col, Alert } from 'react-bootstrap';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import authStore from '../../stores/authStore';
import apiClient from '../../api/client';
import { t } from 'i18next';
import config from '../../config/config.json';

type Mode = 'create' | 'modify';

const weekdays = ['Mon', 'Dien', 'Mitt', 'Don', 'Fre', 'Sam', 'Son'];

interface Props {
  show: boolean;
  onHide: () => void;
  onSuccess?: () => void;
  patient: string;
  /** Can be an id string or an object with _id */
  intervention: string | { _id: string; title?: string } | null;

  /** Optional: open the modal directly in modify mode */
  mode?: Mode;

  /** Prefill when opening in modify mode */
  defaults?: {
    effectiveFrom?: string; // yyyy-mm-dd
    require_video_feedback?: boolean;
    // If you want to prefill schedule as well:
    interval?: number;
    unit?: 'day' | 'week' | 'month';
    selectedDays?: string[];
    startDateISO?: string; // ISO start datetime
    startTime?: string; // 'HH:mm'
    endOption?: 'never' | 'date' | 'count';
    endDateISO?: string; // ISO date
    occurrenceCount?: number;
  };
}

const InterventionRepeatModal: React.FC<Props> = ({
  show,
  onHide,
  onSuccess,
  patient,
  intervention,
  mode = 'create',
  defaults,
}) => {
  // ---------- Helpers ----------
  const interventionId = useMemo(
    () => (typeof intervention === 'string' ? intervention : intervention?._id || ''),
    [intervention]
  );

  const specialisations = authStore.specialisation.split(',').map((s) => s.trim());
  const diagnoses = Array.isArray(specialisations)
    ? specialisations.flatMap((spec) => config?.patientInfo?.function?.[spec]?.diagnosis || [])
    : config?.patientInfo?.function?.[specialisations]?.diagnosis || [];
  const isDiagnosis = diagnoses.includes(patient) || patient === 'all';

  const tomorrowStr = useMemo(() => {
    const dt = new Date();
    dt.setDate(dt.getDate() + 1);
    return dt.toISOString().slice(0, 10);
  }, []);

  // ---------- Form state (frequency UI stays like before) ----------
  const [interval, setInterval] = useState<number>(defaults?.interval ?? 1);
  const [unit, setUnit] = useState<'day' | 'week' | 'month'>(defaults?.unit ?? 'week');
  const [selectedDays, setSelectedDays] = useState<string[]>(defaults?.selectedDays ?? []);
  const [endOption, setEndOption] = useState<'never' | 'date' | 'count'>(defaults?.endOption ?? 'never');

  const [endDate, setEndDate] = useState<Date | null>(
    defaults?.endDateISO ? new Date(defaults.endDateISO) : null
  );
  const [startDate, setStartDate] = useState<Date | null>(
    defaults?.startDateISO ? new Date(defaults.startDateISO) : null
  );
  const [occurrenceCount, setOccurrenceCount] = useState<number>(defaults?.occurrenceCount ?? 10);
  const [startTime, setStartTime] = useState<string>(defaults?.startTime ?? '08:00');
  const [requireVideoFeedback, setRequireVideoFeedback] = useState<boolean>(
    !!defaults?.require_video_feedback
  );

  // Modify mode pieces
  const isModify = mode === 'modify';
  const [effectiveFrom, setEffectiveFrom] = useState<string>(defaults?.effectiveFrom || '');
  const [keepCurrentSchedule, setKeepCurrentSchedule] = useState<boolean>(false);

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [err, setErr] = useState<string>('');

  const toggleDay = (day: string) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const getCombinedStartDateISO = (): string => {
    // If startDate missing, fall back to "now" at provided time
    const base = startDate ? new Date(startDate) : new Date();
    const [h, m] = (startTime || '08:00').split(':').map(Number);
    base.setHours(h || 8, m || 0, 0, 0);
    return base.toISOString();
  };

  const canSave = useMemo(() => {
    if (!interventionId || !patient) return false;

    if (isModify) {
      // Need effectiveFrom; if not keeping schedule, schedule must be valid
      if (!effectiveFrom) return false;
      if (keepCurrentSchedule) return true;
      // Frequency UI validation (same as create)
    }
    // Create validation
    if (!isDiagnosis && !startDate) return false; // patient-specific needs a start date
    if (unit === 'week' && selectedDays.length === 0) return false;
    if (endOption === 'date' && !endDate) return false;
    if (endOption === 'count' && (!occurrenceCount || occurrenceCount < 1)) return false;

    return interval >= 1;
  }, [
    isModify,
    effectiveFrom,
    keepCurrentSchedule,
    isDiagnosis,
    startDate,
    unit,
    selectedDays,
    endOption,
    endDate,
    occurrenceCount,
    interval,
    interventionId,
    patient,
  ]);

  // ---------- Submit ----------
  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);
    setErr('');

    try {
      if (isModify) {
        const payload: any = {
          therapistId: authStore.id,
          patientId: patient,
          interventionId,
          effectiveFrom, // yyyy-mm-dd
          require_video_feedback: requireVideoFeedback,
        };

        if (!keepCurrentSchedule) {
          payload.schedule = {
            interval,
            unit,
            startDate: getCombinedStartDateISO(),
            startTime,
            selectedDays,
            end: {
              type: endOption,
              date: endOption === 'date' && endDate ? endDate.toISOString() : null,
              count: endOption === 'count' ? occurrenceCount : null,
            },
          };
        } else {
          payload.keep_current = true;
        }

        const res = await apiClient.post('/interventions/modify-patient/', payload);
        if (res.status === 200) {
          setSuccess(true);
          onSuccess?.();
          return;
        }
        setErr(t('Failed to modify schedule.'));
      } else {
        // CREATE/ASSIGN
        const path = isDiagnosis
          ? 'interventions/assign-to-patient-types/'
          : 'interventions/add-to-patient/';

        const payload = {
          therapistId: authStore.id,
          patientId: patient,
          interventions: [
            {
              interval,
              interventionId,
              unit,
              startDate: getCombinedStartDateISO(),
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

        const res = await apiClient.post(path, payload);
        if (res.status === 200 || res.status === 201) {
          setSuccess(true);
          onSuccess?.();
          return;
        }
        setErr(t('Error assigning intervention'));
      }
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || t('Something went wrong.');
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  // ---------- Render ----------
  return (
    <Modal show={show} onHide={onHide} centered aria-labelledby="repeat-modal-title" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title id="repeat-modal-title">
          {isModify ? t('Modify schedule') : t('Frequency')}
          {typeof intervention === 'object' && intervention?.title ? (
            <span className="text-muted ms-2">— {intervention.title}</span>
          ) : null}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {err && (
          <Alert variant="danger" onClose={() => setErr('')} dismissible>
            {err}
          </Alert>
        )}

        {/* Modify-only controls */}
        {isModify && (
          <>
            <Form.Group className="mb-3" controlId="effective-from">
              <Form.Label>{t('Effective from')}</Form.Label>
              <Form.Control
                type="date"
                value={effectiveFrom}
                min={tomorrowStr}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                required
              />
              <Form.Text className="text-muted">
                {t('Only sessions on or after this date will change. Past sessions stay as-is.')}
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3" controlId="keep-current">
              <Form.Check
                type="checkbox"
                label={t('Keep current schedule (only update flags)')}
                checked={keepCurrentSchedule}
                onChange={(e) => setKeepCurrentSchedule(e.target.checked)}
              />
            </Form.Group>
          </>
        )}

        {/* Start date & time (hidden for diagnosis-wide assign) */}
        {!isDiagnosis && (
          <>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="start-date">{t('Start Date')}</Form.Label>
              <DatePicker
                selected={startDate}
                onChange={(date) => setStartDate(date)}
                className="form-control"
                dateFormat="yyyy-MM-dd"
                id="start-date"
                aria-label={t('Start Date')}
                disabled={isModify && keepCurrentSchedule}
              />
            </Form.Group>

            <Form.Group as={Row} className="mb-3" controlId="start-time">
              <Form.Label column sm={4}>
                {t('Start Time')}
              </Form.Label>
              <Col sm={8}>
                <Form.Control
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  aria-label={t('Start Time')}
                  disabled={isModify && keepCurrentSchedule}
                />
              </Col>
            </Form.Group>
          </>
        )}

        {/* Repeat every … */}
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
              aria-label={t('Interval')}
              disabled={isModify && keepCurrentSchedule}
            />
          </Col>
          <Col sm={4}>
            <Form.Select
              value={unit}
              onChange={(e) => setUnit(e.target.value as 'day' | 'week' | 'month')}
              disabled={isModify && keepCurrentSchedule}
            >
              <option value="day">{t('Day')}</option>
              <option value="week">{t('Week')}</option>
              <option value="month">{t('Month')}</option>
            </Form.Select>
          </Col>
        </Form.Group>

        {/* Weekday picker */}
        {unit === 'week' && (
          <Form.Group className="mb-3" role="group" aria-label={t('Select days of the week')}>
            <div className="d-flex flex-wrap gap-2">
              {weekdays.map((day, idx) => (
                <Button
                  key={idx}
                  variant={selectedDays.includes(day) ? 'primary' : 'outline-secondary'}
                  onClick={() => toggleDay(day)}
                  aria-pressed={selectedDays.includes(day)}
                  aria-label={t(`Day ${day}`)}
                  disabled={isModify && keepCurrentSchedule}
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
              disabled={isModify && keepCurrentSchedule}
            />
            <Form.Check
              type="radio"
              label={t('On date')}
              checked={endOption === 'date'}
              onChange={() => setEndOption('date')}
              disabled={isModify && keepCurrentSchedule}
            />
            {endOption === 'date' && (
              <DatePicker
                selected={endDate}
                onChange={(date) => setEndDate(date)}
                className="form-control"
                dateFormat="yyyy-MM-dd"
                aria-label={t('End date')}
                disabled={isModify && keepCurrentSchedule}
              />
            )}
            <Form.Check
              type="radio"
              label={t('After N times')}
              checked={endOption === 'count'}
              onChange={() => setEndOption('count')}
              disabled={isModify && keepCurrentSchedule}
            />
            {endOption === 'count' && (
              <Form.Control
                type="number"
                value={occurrenceCount}
                onChange={(e) => setOccurrenceCount(parseInt(e.target.value || '1', 10))}
                aria-label={t('Number of occurrences')}
                disabled={isModify && keepCurrentSchedule}
              />
            )}
          </div>
        </Form.Group>

        {/* Flags */}
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
      </Modal.Body>

      <Modal.Footer>
        {!success ? (
          <>
            <Button variant="secondary" onClick={onHide} disabled={saving}>
              {t('Cancel')}
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={!canSave || saving}>
              {saving ? t('Saving...') : t('Save')}
            </Button>
          </>
        ) : (
          <div className="alert alert-success w-100 text-center m-0">{t('Success!')}</div>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default InterventionRepeatModal;
