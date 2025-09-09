import React, { useMemo, useEffect, useState } from 'react';
import { Modal, Button, Form, Row, Col, Alert } from 'react-bootstrap';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import apiClient from '../../api/client';
import authStore from '../../stores/authStore';
import { t } from 'i18next';

type Mode = 'create' | 'modify';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const toOrdinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const joinDays = (days: string[] = []) => (days.length ? days.join(', ') : '…');

export interface QuestionnaireLite {
  _id: string;           // use the group key (e.g., "16_profile") as id
  key?: string;          // same as _id; kept for flexibility
  title: string;
}

interface Defaults {
  effectiveFrom?: string;                 // YYYY-MM-DD
  startTime?: string;                     // HH:mm
  interval?: number;
  unit?: 'day' | 'week' | 'month';
  selectedDays?: string[];
  end?: { type: 'never' | 'date' | 'count'; date?: string | null; count?: number | null };
}

interface Props {
  show: boolean;
  mode?: Mode;
  onHide: () => void;
  onSuccess?: () => void;

  patientId: string;
  questionnaire: QuestionnaireLite | null;

  defaults?: Defaults;
}

const QuestionnaireScheduleModal: React.FC<Props> = ({
  show,
  mode = 'create',
  onHide,
  onSuccess,
  patientId,
  questionnaire,
  defaults,
}) => {
  const isModify = mode === 'modify';

  // schedule state (mirrors InterventionRepeatModal, minus video/keep_current)
  const [interval, setInterval] = useState<number>(defaults?.interval ?? 1);
  const [unit, setUnit] = useState<'day' | 'week' | 'month'>(defaults?.unit ?? 'week');
  const [selectedDays, setSelectedDays] = useState<string[]>(defaults?.selectedDays ?? []);
  const [endOption, setEndOption] = useState<'never' | 'date' | 'count'>(defaults?.end?.type ?? 'never');
  const [endDate, setEndDate] = useState<Date | null>(defaults?.end?.date ? new Date(defaults.end.date) : null);
  const [occurrenceCount, setOccurrenceCount] = useState<number>(defaults?.end?.count ?? 8);
  const [startTime, setStartTime] = useState<string>(defaults?.startTime ?? '08:00');

  const [startDateCreate, setStartDateCreate] = useState<Date | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState<Date | null>(
    defaults?.effectiveFrom ? new Date(defaults.effectiveFrom) : new Date()
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!show) return;
    setInterval(defaults?.interval ?? 1);
    setUnit((defaults?.unit as any) ?? 'week');
    setSelectedDays(defaults?.selectedDays ?? []);
    setEndOption(defaults?.end?.type ?? 'never');
    setEndDate(defaults?.end?.date ? new Date(defaults.end.date) : null);
    setOccurrenceCount(defaults?.end?.count ?? 8);
    setStartTime(defaults?.startTime ?? '08:00');
    setEffectiveFrom(defaults?.effectiveFrom ? new Date(defaults.effectiveFrom) : new Date());
    setStartDateCreate(null);
    setError('');
    setSuccess(false);
  }, [show, defaults]);

  const toggleDay = (day: string) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const getCombinedStartISO = (): string | null => {
    const baseDate = isModify ? effectiveFrom : startDateCreate;
    if (!baseDate) return null;
    const [hh, mm] = (startTime || '08:00').split(':').map((n) => parseInt(n, 10));
    const dt = new Date(baseDate);
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
      const days = joinDays(selectedDays);
      return interval === 1
        ? t('Occurs weekly on {{days}}.', { days })
        : t('Occurs every {{ord}} week on {{days}}.', { ord: toOrdinal(interval), days });
    }
    return interval === 1
      ? t('Occurs monthly on the same date.')
      : t('Occurs every {{ord}} month on the same date.', { ord: toOrdinal(interval) });
  }, [interval, unit, selectedDays]);

  const canSubmit = useMemo(() => {
    if (!patientId || !questionnaire?._id) return false;
    if (isModify) {
      if (!effectiveFrom) return false;
      if (unit === 'week' && selectedDays.length === 0) return false;
      return true;
    }
    if (!startDateCreate) return false;
    if (unit === 'week' && selectedDays.length === 0) return false;
    return true;
  }, [patientId, questionnaire?._id, isModify, effectiveFrom, startDateCreate, unit, selectedDays.length]);

  const handleSubmit = async () => {
    try {
      if (!questionnaire) return;
      setSubmitting(true);
      setError('');

      const key = questionnaire.key || questionnaire._id;

      const payload: any = {
        therapistId: authStore.id,
        patientId,
        questionnaireKey: key,
        questionnaireId: questionnaire._id,
      };

      if (isModify) {
        payload.effectiveFrom = effectiveFrom?.toISOString().slice(0, 10);
      }

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

      const res = await apiClient.post('/questionnaires/assign/', payload);
      if (res.status === 200 || res.status === 201) {
        setSuccess(true);
        onSuccess?.();
        return;
      }
      setError(t('Failed to save questionnaire schedule.'));
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || t('Something went wrong.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>{isModify ? t('Modify questionnaire schedule') : t('Assign questionnaire')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {error && (
          <Alert variant="danger" onClose={() => setError('')} dismissible>
            {error}
          </Alert>
        )}

        <div className="mb-2"><strong>{questionnaire?.title}</strong></div>

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

          {/* Start time */}
          <Form.Group as={Row} className="mb-3" controlId="start-time">
            <Form.Label column sm={4}>{t('Start Time')}</Form.Label>
            <Col sm={8}>
              <Form.Control type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Col>
          </Form.Group>

          {/* Repeat rule */}
          <Form.Group as={Row} className="mb-3" controlId="repeat-every">
            <Form.Label column sm={4}>{t('Repeat every')}</Form.Label>
            <Col sm={4}>
              <Form.Control
                type="number"
                min="1"
                value={interval}
                onChange={(e) => setInterval(parseInt(e.target.value || '1', 10))}
                aria-describedby="repeat-help"
              />
            </Col>
            <Col sm={4}>
              <Form.Select value={unit} onChange={(e) => setUnit(e.target.value as any)}>
                <option value="day">{t('Day')}</option>
                <option value="week">{t('Week')}</option>
                <option value="month">{t('Month')}</option>
              </Form.Select>
            </Col>
            <Col xs={12}>
              <Form.Text id="repeat-help" className="text-muted">{summary}</Form.Text>
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
                    {t(day)}
                  </Button>
                ))}
              </div>
            </Form.Group>
          )}

          {/* End options */}
          <Form.Group className="mb-3" role="radiogroup" aria-label={t('End options')}>
            <Form.Label>{t('Ends')}</Form.Label>
            <div className="d-flex flex-column gap-2">
              <Form.Check type="radio" label={t('Never')}     checked={endOption === 'never'} onChange={() => setEndOption('never')} />
              <Form.Check type="radio" label={t('On date')}   checked={endOption === 'date'}  onChange={() => setEndOption('date')} />
              {endOption === 'date' && (
                <DatePicker selected={endDate} onChange={(d) => setEndDate(d as Date)} className="form-control" dateFormat="yyyy-MM-dd" />
              )}
              <Form.Check type="radio" label={t('After N times')} checked={endOption === 'count'} onChange={() => setEndOption('count')} />
              {endOption === 'count' && (
                <Form.Control type="number" value={occurrenceCount} onChange={(e) => setOccurrenceCount(parseInt(e.target.value || '0', 10))} />
              )}
            </div>
          </Form.Group>
        </Form>
      </Modal.Body>

      <Modal.Footer>
        {!success ? (
          <>
            <Button variant="secondary" onClick={onHide} disabled={submitting}>{t('Cancel')}</Button>
            <Button variant="success" onClick={handleSubmit} disabled={!canSubmit || submitting}>
              {submitting ? t('Saving...') : t('Save')}
            </Button>
          </>
        ) : (
          <Alert variant="success" className="w-100 text-center m-0">{t('Success!')}</Alert>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default QuestionnaireScheduleModal;
