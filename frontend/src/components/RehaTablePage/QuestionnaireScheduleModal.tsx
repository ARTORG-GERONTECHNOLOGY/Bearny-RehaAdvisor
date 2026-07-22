// src/components/RehaTablePage/QuestionnaireScheduleModal.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Alert } from '@/components/ui/alert';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import apiClient from '@/api/client';
import authStore from '@/stores/authStore';
import StandardModal from '@/components/common/StandardModal';
import { toISODateUTC } from '@/utils/dateFormat';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldGroup, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

type Mode = 'create' | 'modify';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const toOrdinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const joinDays = (days: string[] = []) => (days.length ? days.join(', ') : '…');

export interface QuestionnaireLite {
  _id: string;
  key?: string;
  title: string;
}

interface Defaults {
  effectiveFrom?: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
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

const extractApiError = (
  e: any,
  fallback: string
): { message: string; fieldErrors: Record<string, string> } => {
  const api = e?.response?.data;
  if (!api) return { message: fallback, fieldErrors: {} };

  const pieces: string[] = [];
  const fieldErrors: Record<string, string> = {};

  if (typeof api.message === 'string' && api.message.trim()) pieces.push(api.message.trim());
  if (typeof api.error === 'string' && api.error.trim()) pieces.push(api.error.trim());
  if (typeof api.details === 'string' && api.details.trim()) pieces.push(api.details.trim());

  if (Array.isArray(api.non_field_errors))
    pieces.push(...api.non_field_errors.map((x: any) => String(x)));

  if (api.field_errors && typeof api.field_errors === 'object') {
    Object.entries(api.field_errors).forEach(([field, msgs]) => {
      const list = Array.isArray(msgs) ? msgs : [msgs];
      const cleaned = list.filter(Boolean).map((m) => String(m));
      if (cleaned.length) fieldErrors[field] = cleaned.join(' ');
    });
  }

  const text = pieces.join(' ').trim();
  return { message: text || fallback, fieldErrors };
};

const tomorrow = () => new Date(Date.now() + 86400000);

const QuestionnaireScheduleModal: React.FC<Props> = observer(
  ({ show, mode = 'create', onHide, onSuccess, patientId, questionnaire, defaults }) => {
    const { t } = useTranslation();
    const isModify = mode === 'modify';

    const [interval, setInterval] = useState<number>(defaults?.interval ?? 1);
    const [unit, setUnit] = useState<'day' | 'week' | 'month'>(defaults?.unit ?? 'week');
    const [selectedDays, setSelectedDays] = useState<string[]>(defaults?.selectedDays ?? []);
    const [endOption, setEndOption] = useState<'never' | 'date' | 'count'>(
      defaults?.end?.type ?? 'never'
    );
    const [endDate, setEndDate] = useState<Date | null>(
      defaults?.end?.date ? new Date(defaults.end.date) : null
    );
    const [occurrenceCount, setOccurrenceCount] = useState<number>(defaults?.end?.count ?? 8);
    const [startTime, setStartTime] = useState<string>(defaults?.startTime ?? '08:00');

    const [startDateCreate, setStartDateCreate] = useState<Date | null>(null);
    const [effectiveFrom, setEffectiveFrom] = useState<Date | null>(
      defaults?.effectiveFrom ? new Date(defaults.effectiveFrom) : tomorrow()
    );

    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const [error, setError] = useState<string>('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    useEffect(() => {
      if (!show) return;

      setInterval(defaults?.interval ?? 1);
      setUnit((defaults?.unit as any) ?? 'week');
      setSelectedDays(defaults?.selectedDays ?? []);
      setEndOption(defaults?.end?.type ?? 'never');
      setEndDate(defaults?.end?.date ? new Date(defaults.end.date) : null);
      setOccurrenceCount(defaults?.end?.count ?? 8);
      setStartTime(defaults?.startTime ?? '08:00');

      setEffectiveFrom(defaults?.effectiveFrom ? new Date(defaults.effectiveFrom) : tomorrow());
      setStartDateCreate(isModify ? null : tomorrow());

      setSubmitting(false);
      setSuccess(false);
      setError('');
      setFieldErrors({});
    }, [show, defaults, isModify]);

    const toggleDay = (day: string) => {
      setSelectedDays((prev) =>
        prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
      );
    };

    const getCombinedStartISO = (): string | null => {
      const baseDate = isModify ? effectiveFrom : startDateCreate;
      if (!baseDate) return null;

      const [hh, mm] = (startTime || '08:00').split(':').map((n) => parseInt(n, 10));
      const dt = new Date(baseDate);
      dt.setHours(Number.isFinite(hh) ? hh : 8, Number.isFinite(mm) ? mm : 0, 0, 0);
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
    }, [interval, unit, selectedDays, t]);

    const validate = (): boolean => {
      const fe: Record<string, string> = {};

      if (!questionnaire?._id) fe.questionnaire = t('No questionnaire selected.');
      if (!patientId) fe.patientId = t('No patient selected.');
      if (!startTime) fe.startTime = t('Please choose a start time.');
      if (!interval || interval < 1) fe.interval = t('Interval must be >= 1.');

      if (isModify) {
        if (!effectiveFrom) fe.effectiveFrom = t('Please choose an effective date.');
      } else {
        if (!startDateCreate) fe.startDateCreate = t('Please choose a start date.');
      }

      if (unit === 'week' && selectedDays.length === 0)
        fe.selectedDays = t('Select at least one weekday.');
      if (endOption === 'date' && !endDate) fe.endDate = t('Pick an end date.');
      if (endOption === 'count' && (!occurrenceCount || occurrenceCount < 1))
        fe.occurrenceCount = t('Number of occurrences must be >= 1.');

      setFieldErrors(fe);
      return Object.keys(fe).length === 0;
    };

    const canSubmit = useMemo(() => {
      if (!patientId || !questionnaire?._id) return false;
      if (!startTime) return false;
      if (interval < 1) return false;

      const baseOk = isModify ? !!effectiveFrom : !!startDateCreate;
      if (!baseOk) return false;

      if (unit === 'week' && selectedDays.length === 0) return false;
      if (endOption === 'date' && !endDate) return false;
      if (endOption === 'count' && (!occurrenceCount || occurrenceCount < 1)) return false;
      return true;
    }, [
      patientId,
      questionnaire?._id,
      startTime,
      interval,
      isModify,
      effectiveFrom,
      startDateCreate,
      unit,
      selectedDays.length,
      endOption,
      endDate,
      occurrenceCount,
    ]);

    const handleSubmit = useCallback(async () => {
      if (submitting) return;

      setError('');
      setFieldErrors({});
      setSuccess(false);

      if (!validate()) return;
      if (!questionnaire) return;

      setSubmitting(true);
      try {
        const key = questionnaire.key || questionnaire._id;

        const payload: any = {
          therapistId: authStore.id,
          patientId,
          questionnaireKey: key,
          questionnaireId: questionnaire._id,
          ...(isModify ? { effectiveFrom: effectiveFrom && toISODateUTC(effectiveFrom) } : {}),
          schedule: {
            interval,
            unit,
            startDate: getCombinedStartISO(), // date + time in ISO
            startTime,
            selectedDays,
            end: {
              type: endOption,
              date: endOption === 'date' && endDate ? endDate.toISOString() : null,
              count: endOption === 'count' ? occurrenceCount : null,
            },
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
        const parsed = extractApiError(e, t('Something went wrong.'));
        setError(parsed.message);
        if (parsed.fieldErrors && Object.keys(parsed.fieldErrors).length) {
          setFieldErrors((prev) => ({ ...prev, ...parsed.fieldErrors }));
        }
      } finally {
        setSubmitting(false);
      }
    }, [
      submitting,
      questionnaire,
      patientId,
      isModify,
      effectiveFrom,
      interval,
      unit,
      startTime,
      selectedDays,
      endOption,
      endDate,
      occurrenceCount,
      onSuccess,
      t,
    ]);

    const confirmClose = useCallback(() => {
      if (submitting) return;
      onHide();
    }, [onHide, submitting]);

    const footer = useMemo(() => {
      if (success) {
        return (
          <div className="w-100 text-center">
            <span className="text-success fw-semibold">{t('Success!')}</span>
          </div>
        );
      }

      return (
        <div className="w-100 d-flex gap-2 justify-content-end">
          <Button size="dashboard" variant="secondary" onClick={confirmClose} disabled={submitting}>
            {t('Cancel')}
          </Button>
          <Button size="dashboard" onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? (
              <>
                <Spinner /> {t('Saving...')}
              </>
            ) : (
              t('Save')
            )}
          </Button>
        </div>
      );
    }, [success, t, confirmClose, submitting, handleSubmit, canSubmit]);

    return (
      <StandardModal
        show={show}
        onHide={confirmClose}
        title={isModify ? t('Modify questionnaire schedule') : t('Assign questionnaire')}
        size="lg"
        backdrop="static"
        keyboard
        footer={footer}
      >
        {error && (
          <Alert variant="destructive" onClose={() => setError('')} closeLabel={t('Close alert')}>
            {error}
          </Alert>
        )}

        {Object.keys(fieldErrors).length > 0 && (
          <Alert variant="destructive">
            <ul className="mb-0">
              {Object.entries(fieldErrors).map(([k, msg]) => (
                <li key={k}>{msg}</li>
              ))}
            </ul>
          </Alert>
        )}

        <strong>{questionnaire?.title || t('Questionnaire')}</strong>

        <form>
          <FieldGroup>
            {isModify ? (
              <Field>
                <FieldLabel htmlFor="q-effective-from">{t('Effective from')}</FieldLabel>
                <DatePicker
                  id="q-effective-from"
                  selected={effectiveFrom}
                  onChange={(d) => setEffectiveFrom(d as Date)}
                  className="form-control"
                  dateFormat="yyyy-MM-dd"
                />
                <FieldDescription>
                  {t('Only sessions on or after this date will change. Past sessions stay as-is.')}
                </FieldDescription>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="q-start-date">{t('Start Date')}</FieldLabel>
                <DatePicker
                  id="q-start-date"
                  selected={startDateCreate}
                  onChange={(d) => setStartDateCreate(d as Date)}
                  className="form-control"
                  dateFormat="yyyy-MM-dd"
                />
                <FieldDescription>{t('If unsure, start tomorrow at 08:00.')}</FieldDescription>
              </Field>
            )}

            <Field className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <FieldLabel htmlFor="q-start-time" className="sm:col-span-4 mb-0">
                {t('Start Time')}
              </FieldLabel>
              <div className="sm:col-span-8">
                <Input
                  id="q-start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
            </Field>

            <Field className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <FieldLabel htmlFor="q-repeat-every" className="sm:col-span-4 mb-0">
                {t('Repeat every')}
              </FieldLabel>
              <div className="sm:col-span-4">
                <Input
                  id="q-repeat-every"
                  type="number"
                  min={1}
                  value={interval}
                  onChange={(e) => setInterval(parseInt(e.target.value || '1', 10))}
                />
              </div>
              <div className="sm:col-span-4">
                <Select value={unit} onValueChange={(v) => setUnit(v as any)}>
                  <SelectTrigger id="q-repeat-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">{t('Day')}</SelectItem>
                    <SelectItem value="week">{t('Week')}</SelectItem>
                    <SelectItem value="month">{t('Month')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-12">
                <FieldDescription>{summary}</FieldDescription>
              </div>
            </Field>

            {unit === 'week' && (
              <div role="group" aria-label={t('Select days of the week')}>
                <div className="d-flex flex-wrap gap-2">
                  {weekdays.map((day) => (
                    <Button
                      key={day}
                      type="button"
                      size="dashboard"
                      variant={selectedDays.includes(day) ? undefined : 'secondary'}
                      onClick={() => toggleDay(day)}
                      aria-pressed={selectedDays.includes(day)}
                      disabled={submitting}
                    >
                      {t(day)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <Field>
              <FieldLabel>{t('Ends')}</FieldLabel>
              <RadioGroup
                value={endOption}
                onValueChange={(v) => setEndOption(v as any)}
                disabled={submitting}
                aria-label={t('End options')}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="never" id="q-end-never" />
                  <Label htmlFor="q-end-never" className="cursor-pointer">
                    {t('Never')}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="date" id="q-end-date" />
                  <Label htmlFor="q-end-date" className="cursor-pointer">
                    {t('On date')}
                  </Label>
                </div>
                {endOption === 'date' && (
                  <DatePicker
                    selected={endDate}
                    onChange={(d) => setEndDate(d as Date)}
                    className="form-control"
                    dateFormat="yyyy-MM-dd"
                  />
                )}

                <div className="flex items-center gap-2">
                  <RadioGroupItem value="count" id="q-end-count" />
                  <Label htmlFor="q-end-count" className="cursor-pointer">
                    {t('After N times')}
                  </Label>
                </div>
                {endOption === 'count' && (
                  <Input
                    type="number"
                    min={1}
                    value={occurrenceCount}
                    onChange={(e) => setOccurrenceCount(parseInt(e.target.value || '1', 10))}
                  />
                )}
              </RadioGroup>
            </Field>
          </FieldGroup>
        </form>
      </StandardModal>
    );
  }
);

export default QuestionnaireScheduleModal;
