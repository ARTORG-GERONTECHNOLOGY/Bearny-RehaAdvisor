// components/TherapistInterventionPage/TemplateAssignModal.tsx
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from '@/components/ui/alert';
import apiClient from '@/api/client';
import authStore from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { toLocalYMD } from '@/utils/dateFormat';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldGroup, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

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
  /** When set, saves to named template instead of the therapist's implicit template */
  templateId?: string;
};

type ErrorMap = Record<string, string>;
type AutoApplyScope = 'off' | 'future' | 'all_past_and_future';
const todayIso = () => toLocalYMD(new Date());
// Sentinel for the "All diagnoses" Select item — Radix forbids an empty-string item value.
const ALL_DIAGNOSES_VALUE = '__all__';

const TemplateAssignModal: React.FC<Props> = ({
  show,
  onHide,
  interventionId,
  interventionTitle,
  diagnoses,
  defaultDiagnosis,
  onSuccess,
  mode = 'create',
  templateId,
}) => {
  const { t } = useTranslation();

  const [diagnosis, setDiagnosis] = useState(defaultDiagnosis || '');
  const [startDay, setStartDay] = useState<number>(1);
  const [lastDay, setLastDay] = useState<number>(10);
  const [everyK, setEveryK] = useState<number>(1);

  const [startTime, setStartTime] = useState<string>('08:00');
  const [keepPrevious, setKeepPrevious] = useState<boolean>(mode === 'modify');
  const [autoApplyScope, setAutoApplyScope] = useState<AutoApplyScope>(
    templateId ? 'off' : 'future'
  );
  const [autoApplyStartingFrom, setAutoApplyStartingFrom] = useState<string>(todayIso());

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ErrorMap>({});
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  // Cleared on unmount so the auto-close setTimeout can't fire onHide() after the component is gone.
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!show) return;

    setDiagnosis(defaultDiagnosis || '');
    setStartDay(1);
    setLastDay(10);
    setEveryK(1);
    setStartTime('08:00');
    setKeepPrevious(mode === 'modify');
    setAutoApplyScope(templateId ? 'off' : 'future');
    setAutoApplyStartingFrom(todayIso());

    setError('');
    setFieldErrors({});
    setShowErrorDetails(false);
    setSubmitting(false);
    setSuccess(false);
  }, [show, defaultDiagnosis, mode, templateId]);

  const validRange = startDay >= 1 && lastDay >= startDay;
  const canSubmit = useMemo(
    () => !!interventionId && (templateId ? true : !!diagnosis) && validRange && everyK >= 1,
    [interventionId, diagnosis, validRange, everyK, templateId]
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
      (mode === 'modify' ? keepPrevious !== true : keepPrevious !== false) ||
      autoApplyScope !== 'off';
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
    autoApplyScope,
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

      let res: any;

      if (templateId) {
        // Named template endpoint
        const payload = {
          interventionId,
          diagnosis: diagnosis || '',
          start_day: startDay,
          end_day: lastDay,
          interval: everyK,
          unit: 'day',
          selected_days: [],
          suggested_execution_time: suggestedExecution,
          auto_apply_scope: autoApplyScope,
          auto_apply_starting_from:
            autoApplyScope === 'all_past_and_future' ? autoApplyStartingFrom : undefined,
        };
        res = await apiClient.post(`templates/${templateId}/interventions/`, payload);
      } else {
        // Legacy implicit therapist template endpoint
        const payload = {
          therapistId: authStore.id,
          patientId: diagnosis,
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
              auto_apply_scope: autoApplyScope === 'off' ? 'future' : autoApplyScope,
              auto_apply_starting_from:
                autoApplyScope === 'all_past_and_future' ? autoApplyStartingFrom : undefined,
            },
          ],
        };
        res = await apiClient.post(
          `therapists/${authStore.id}/interventions/assign-to-patient-types/`,
          payload
        );
      }

      if (res.status === 201 || res.status === 200) {
        setSuccess(true);
        onSuccess?.();

        // Auto-close after showing success message briefly
        closeTimeoutRef.current = setTimeout(() => {
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
    <Dialog open={show} onOpenChange={(open) => !open && confirmClose()}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          confirmClose();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {mode === 'modify'
              ? t('Modify template (from day S)')
              : t('Add to template (Day S → N)')}
          </DialogTitle>
        </DialogHeader>

        {/* SUCCESS BANNER */}
        {success && <Alert variant="success">{t('Intervention successfully added')}</Alert>}

        {/* ERROR BANNER */}
        {error && (
          <Alert variant="destructive" onClose={() => setError('')} closeLabel="Close alert">
            <div className="d-flex justify-content-between">
              <span>{error}</span>
              <Button
                size="dashboard"
                variant="secondary"
                onClick={() => setShowErrorDetails(!showErrorDetails)}
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

        <form>
          <FieldGroup>
            {/* INTERVENTION TITLE */}
            {interventionTitle && (
              <Field>
                <FieldLabel>{t('Intervention')}</FieldLabel>
                <div className="fw-semibold">{interventionTitle}</div>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="template-diagnosis">
                {t('Diagnosis_patient_list')}
                {templateId && (
                  <span className="text-muted ms-1 small">
                    ({t('optional — leave blank for all')})
                  </span>
                )}
              </FieldLabel>
              <Select
                value={
                  diagnosis === '' ? (templateId ? ALL_DIAGNOSES_VALUE : undefined) : diagnosis
                }
                onValueChange={(v) => setDiagnosis(v === ALL_DIAGNOSES_VALUE ? '' : v)}
              >
                <SelectTrigger id="template-diagnosis" aria-invalid={!!fieldErrors['patientId']}>
                  <SelectValue placeholder={t('Choose...')} />
                </SelectTrigger>
                <SelectContent>
                  {templateId && (
                    <SelectItem value={ALL_DIAGNOSES_VALUE}>{t('All diagnoses')}</SelectItem>
                  )}
                  {diagnoses.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors['patientId'] && <FieldError>{fieldErrors['patientId']}</FieldError>}
            </Field>

            {/* Start / End / Interval */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <Field className="md:col-span-4">
                <FieldLabel htmlFor="template-start-day">{t('Start day (S)')}</FieldLabel>
                <Input
                  id="template-start-day"
                  type="number"
                  value={startDay}
                  min={1}
                  onChange={(e) => setStartDay(parseInt(e.target.value || '1', 10))}
                  aria-invalid={!!fieldErrors['interventions[0].start_day']}
                />
                {fieldErrors['interventions[0].start_day'] && (
                  <FieldError>{fieldErrors['interventions[0].start_day']}</FieldError>
                )}
              </Field>

              <Field className="md:col-span-4">
                <FieldLabel htmlFor="template-last-day">{t('Last day (N)')}</FieldLabel>
                <Input
                  id="template-last-day"
                  type="number"
                  value={lastDay}
                  min={startDay}
                  onChange={(e) => setLastDay(parseInt(e.target.value || '1', 10))}
                  aria-invalid={!!fieldErrors['interventions[0].end.count']}
                />
                {fieldErrors['interventions[0].end.count'] && (
                  <FieldError>{fieldErrors['interventions[0].end.count']}</FieldError>
                )}
              </Field>

              <Field className="md:col-span-4">
                <FieldLabel htmlFor="template-every-k">{t('Every K days')}</FieldLabel>
                <Input
                  id="template-every-k"
                  type="number"
                  value={everyK}
                  min={1}
                  onChange={(e) => setEveryK(parseInt(e.target.value || '1', 10))}
                  aria-invalid={!!fieldErrors['interventions[0].interval']}
                />
                {fieldErrors['interventions[0].interval'] && (
                  <FieldError>{fieldErrors['interventions[0].interval']}</FieldError>
                )}
              </Field>
            </div>

            {/* Suggested execution time */}
            <Field>
              <FieldLabel htmlFor="template-start-time">{t('Suggested execution time')}</FieldLabel>
              <Input
                id="template-start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <small className="text-muted">
                {t('Shown when applying the template to a patient')}
              </small>
            </Field>

            {mode === 'modify' && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="template-keep-previous"
                  checked={keepPrevious}
                  onCheckedChange={(checked) => setKeepPrevious(!!checked)}
                />
                <Label htmlFor="template-keep-previous" className="cursor-pointer">
                  {t('Modify from day S onward — keep earlier days unchanged')}
                </Label>
              </div>
            )}

            <Alert variant="info">
              {t(
                'These are relative template days. Actual calendar dates are set when applying to a patient.'
              )}
            </Alert>

            {diagnosis && (
              <Field>
                <FieldLabel htmlFor="template-auto-apply-scope">
                  {t('Diagnosis auto-apply mode')}
                </FieldLabel>
                <Select
                  value={autoApplyScope}
                  onValueChange={(v) => setAutoApplyScope(v as AutoApplyScope)}
                >
                  <SelectTrigger id="template-auto-apply-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templateId && (
                      <SelectItem value="off">
                        {t('Only keep in template (no automatic assignment)')}
                      </SelectItem>
                    )}
                    <SelectItem value="future">
                      {t('Automatically assign to new matching patients')}
                    </SelectItem>
                    <SelectItem value="all_past_and_future">
                      {t('Assign now to all existing matching patients and future ones')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {autoApplyScope === 'all_past_and_future' && (
                  <Field className="mt-2">
                    <FieldLabel htmlFor="template-auto-apply-starting-from">
                      {t('Start assigning from date')}
                    </FieldLabel>
                    <Input
                      id="template-auto-apply-starting-from"
                      type="date"
                      value={autoApplyStartingFrom}
                      onChange={(e) => setAutoApplyStartingFrom(e.target.value)}
                    />
                    <small className="text-muted">
                      {t(
                        'Defaults to today. Existing patients receive sessions from this date onward.'
                      )}
                    </small>
                  </Field>
                )}
                <small className="text-muted">
                  {t('New matching patients means future registrations with this diagnosis.')}
                </small>
                <br />
                <small className="text-muted">
                  {t('Matching patients are limited to your own clinic/project access.')}
                </small>
              </Field>
            )}

            <div className="text-muted">
              {validRange
                ? t('{{count}} session(s): Days S,S+K,…≤N at ~{{time}}', {
                    count: occurrencesCount,
                    time: startTime,
                  })
                : t('Invalid range.')}
            </div>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button
            size="dashboard"
            variant="secondary"
            onClick={confirmClose}
            disabled={submitting || success}
          >
            {t('Cancel')}
          </Button>
          <Button
            size="dashboard"
            onClick={handleSave}
            disabled={!canSubmit || submitting || success}
          >
            {submitting ? t('Saving...') : success ? t('Saved!') : t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateAssignModal;
