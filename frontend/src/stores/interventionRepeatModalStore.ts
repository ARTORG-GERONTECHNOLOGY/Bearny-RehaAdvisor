import { makeAutoObservable } from 'mobx';
import { t as i18nT } from 'i18next';
import apiClient from '../api/client';
import authStore from './authStore';

type Mode = 'create' | 'modify';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const toOrdinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const joinDays = (days: string[] = []) => (days.length ? days.join(', ') : '…');

export class InterventionRepeatModalStore {
  mode: Mode = 'create';

  interval = 1;
  unit: 'day' | 'week' | 'month' = 'week';
  selectedDays: string[] = [];

  endOption: 'never' | 'date' | 'count' = 'never';
  endDate: Date | null = null;
  occurrenceCount = 10;

  startTime = '08:00';
  requireVideoFeedback = false;

  startDateCreate: Date | null = new Date();
  effectiveFrom: Date | null = new Date();

  keepCurrent = false;
  personalNote = '';

  submitting = false;
  success = false;

  error = '';
  fieldErrors: Record<string, string> = {};

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  reset(show: boolean, mode: Mode, defaults?: any) {
    if (!show) return;

    this.mode = mode;

    this.interval = defaults?.interval ?? 1;
    this.unit = (defaults?.unit as any) ?? 'week';
    this.selectedDays = defaults?.selectedDays ?? [];

    this.endOption = defaults?.end?.type ?? 'never';
    this.endDate = defaults?.end?.date ? new Date(defaults.end.date) : null;
    this.occurrenceCount = defaults?.end?.count ?? 10;

    this.startTime = defaults?.startTime ?? '08:00';
    this.requireVideoFeedback = !!defaults?.require_video_feedback;

    this.keepCurrent = !!defaults?.keep_current;
    this.personalNote = defaults?.notes ?? '';

    this.effectiveFrom = defaults?.effectiveFrom ? new Date(defaults.effectiveFrom) : new Date();
    this.startDateCreate = mode === 'create' ? new Date() : null;

    this.submitting = false;
    this.success = false;
    this.error = '';
    this.fieldErrors = {};
  }

  toggleDay(day: string) {
    this.selectedDays = this.selectedDays.includes(day)
      ? this.selectedDays.filter((d) => d !== day)
      : [...this.selectedDays, day];
  }

  get isModify() {
    return this.mode === 'modify';
  }

  get summary() {
    if (this.unit === 'day') {
      return this.interval === 1
        ? i18nT('Occurs every day.')
        : i18nT('Occurs every {{ord}} day.', { ord: toOrdinal(this.interval) });
    }
    if (this.unit === 'week') {
      return this.interval === 1
        ? i18nT('Occurs weekly on {{days}}.', { days: joinDays(this.selectedDays) })
        : i18nT('Occurs every {{ord}} weeks on {{days}}.', {
            ord: toOrdinal(this.interval),
            days: joinDays(this.selectedDays),
          });
    }
    return this.interval === 1
      ? i18nT('Occurs monthly on the same date.')
      : i18nT('Occurs every {{ord}} months on the same date.', { ord: toOrdinal(this.interval) });
  }

  get canSubmit() {
    if (this.isModify) {
      if (!this.effectiveFrom) return false;
      if (this.keepCurrent) return true;
      if (this.unit === 'week' && this.selectedDays.length === 0) return false;
      return true;
    }
    if (!this.startDateCreate) return false;
    if (this.unit === 'week' && this.selectedDays.length === 0) return false;
    return true;
  }

  private getCombinedStartISO(): string | null {
    const base = this.isModify ? this.effectiveFrom : this.startDateCreate;
    if (!base) return null;
    const dt = new Date(base);
    const [hh, mm] = (this.startTime || '08:00').split(':').map(Number);
    dt.setHours(hh, mm, 0, 0);
    return dt.toISOString();
  }

  validate(): boolean {
    const errs: Record<string, string> = {};

    if (!this.startTime) errs.startTime = i18nT('Please choose a start time.');
    if (this.interval < 1) errs.interval = i18nT('Interval must be >= 1.');

    if (!this.isModify && !this.startDateCreate) errs.startDateCreate = i18nT('Please choose a start date.');
    if (this.isModify && !this.effectiveFrom) errs.effectiveFrom = i18nT('Please choose an effective date.');

    if (!(this.isModify && this.keepCurrent)) {
      if (this.unit === 'week' && this.selectedDays.length === 0) errs.selectedDays = i18nT('Select at least one weekday.');
      if (this.endOption === 'date' && !this.endDate) errs.endDate = i18nT('Pick an end date.');
      if (this.endOption === 'count' && (!this.occurrenceCount || this.occurrenceCount < 1))
        errs.occurrenceCount = i18nT('Number of occurrences must be >= 1.');
    }

    this.fieldErrors = errs;
    return Object.keys(errs).length === 0;
  }

  async submit(params: {
    patient: string;
    intervention: string | { _id: string };
    therapistId?: string;
    onSuccess?: () => void;
    isDiagnosis: boolean;
  }) {
    if (!this.validate()) return;

    this.submitting = true;
    this.error = '';

    try {
      const intId = typeof params.intervention === 'string' ? params.intervention : params.intervention._id;

      if (this.isModify) {
        const payload: any = {
          therapistId: params.therapistId || authStore.id,
          patientId: params.patient,
          interventionId: intId,
          effectiveFrom: this.effectiveFrom?.toISOString().slice(0, 10),
          require_video_feedback: this.requireVideoFeedback,
          keep_current: this.keepCurrent,
          notes: this.personalNote ?? '',
        };

        if (!this.keepCurrent) {
          payload.schedule = {
            interval: this.interval,
            unit: this.unit,
            startDate: this.getCombinedStartISO(),
            startTime: this.startTime,
            selectedDays: this.selectedDays,
            end: {
              type: this.endOption,
              date: this.endOption === 'date' && this.endDate ? this.endDate.toISOString() : null,
              count: this.endOption === 'count' ? this.occurrenceCount : null,
            },
          };
        }

        const res = await apiClient.post('/interventions/modify-patient/', payload);
        if (res.status === 200) {
          this.success = true;
          params.onSuccess?.();
          return;
        }
      }

      const payload = {
        therapistId: params.therapistId || authStore.id,
        patientId: params.patient,
        interventions: [
          {
            interval: this.interval,
            interventionId: intId,
            unit: this.unit,
            startDate: this.getCombinedStartISO(),
            selectedDays: this.selectedDays,
            end: {
              type: this.endOption,
              date: this.endOption === 'date' && this.endDate ? this.endDate.toISOString() : null,
              count: this.endOption === 'count' ? this.occurrenceCount : null,
            },
            require_video_feedback: this.requireVideoFeedback,
            notes: this.personalNote ?? '',
          },
        ],
      };

      const path = params.isDiagnosis ? 'interventions/assign-to-patient-types/' : 'interventions/add-to-patient/';
      const res = await apiClient.post(path, payload);

      if (res.status === 200 || res.status === 201) {
        this.success = true;
        params.onSuccess?.();
        return;
      }

      this.error = i18nT('Failed to add intervention.');
    } catch (err: any) {
      const api = err?.response?.data;
      const fErrs = api?.field_errors
        ? Object.entries(api.field_errors).flatMap(([field, arr]) => (arr as string[]).map((msg) => `${field}: ${msg}`))
        : [];
      const nfErrs = api?.non_field_errors || [];
      const message = api?.message || api?.error || err.message;
      const all = [...fErrs, ...nfErrs];

      this.error = all.length > 0 ? `${message}\n• ${all.join('\n• ')}` : message || i18nT('Something went wrong.');
    } finally {
      this.submitting = false;
    }
  }

  get weekdays() {
    return weekdays;
  }
}
