// src/components/TherapistInterventionPage/ApplyTemplateModal.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge } from 'react-bootstrap';
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
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Field, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
    partial_errors?: { patient: string; reason: string }[];
    warning?: string;
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
  const [effectiveFrom, setEffectiveFrom] = useState(toLocalYMD(new Date(Date.now() + 86400000)));
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
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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
    const baseEff = toLocalYMD(new Date(Date.now() + 86400000));
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

      const data = res.data;
      if (data.partial_errors?.length) {
        applyErrors({
          message: data.warning || t('Template was partially applied.'),
          non_field_errors: data.partial_errors.map(
            (e: { patient: string; reason: string }) => `${e.patient}: ${e.reason}`
          ),
        });
        setSubmitting(false);
        onApplied?.(data);
      } else {
        onApplied?.(data);
        resetLocalErrors();
        setSubmitting(false);
        onHide();
      }
    } catch (e: any) {
      console.error('apply_template error:', e?.response?.data || e);
      applyErrors(e?.response?.data || {});
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={show} onOpenChange={(open) => !open && confirmClose()}>
      <DialogContent
        className="max-w-3xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          confirmClose();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('Apply template to patient')}</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="danger" dismissible onClose={() => setError('')}>
            <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
              <span>{error}</span>
              <Button
                type="button"
                size="dashboard"
                variant="ghost"
                onClick={() => setShowErrors(!showErrors)}
              >
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

        <form>
          {/* Mode toggle */}
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'patient' | 'diagnosis')}>
            <TabsList>
              <TabsTrigger value="patient">{t('Select patients')}</TabsTrigger>
              <TabsTrigger value="diagnosis">{t('By diagnosis')}</TabsTrigger>
            </TabsList>

            {/* ── Patient multi-select ── */}
            <TabsContent value="patient" className="mt-3">
              <Field className="mb-3">
                <FieldLabel>
                  {t('Patients')}{' '}
                  {selectedIds.size > 0 && (
                    <Badge bg="primary" className="ms-1">
                      {selectedIds.size} {t('selected')}
                    </Badge>
                  )}
                </FieldLabel>

                {loadingPatients ? (
                  <div className="text-center py-3">
                    <Spinner />
                  </div>
                ) : (
                  <>
                    <Input
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
                          <div className="d-flex align-items-center px-3 py-2 border-bottom bg-light">
                            <Checkbox
                              id="select-all-patients"
                              checked={
                                filteredPatients.length > 0 &&
                                selectedIds.size === filteredPatients.length
                              }
                              onCheckedChange={toggleAll}
                              className="me-2"
                            />
                            <label
                              htmlFor="select-all-patients"
                              className="small fw-semibold"
                              style={{ cursor: 'pointer' }}
                            >
                              {t('Select All')}
                            </label>
                          </div>

                          {filteredPatients.map((p) => (
                            <div
                              key={p._id}
                              className={`d-flex align-items-center px-3 py-2 border-bottom ${selectedIds.has(p._id) ? 'bg-primary bg-opacity-10' : ''}`}
                            >
                              <Checkbox
                                id={`patient-${p._id}`}
                                checked={selectedIds.has(p._id)}
                                onCheckedChange={() => togglePatient(p._id)}
                                className="me-2"
                              />
                              <label
                                htmlFor={`patient-${p._id}`}
                                className="small"
                                style={{ cursor: 'pointer' }}
                              >
                                <strong>
                                  {p.first_name} {p.name}
                                </strong>
                                <span className="text-muted ms-2">({p.patient_code})</span>
                              </label>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                    {fieldErrors.patientIds && <FieldError>{fieldErrors.patientIds}</FieldError>}
                  </>
                )}
              </Field>
            </TabsContent>

            {/* ── Diagnosis bulk mode ── */}
            <TabsContent value="diagnosis">
              <Field className="mb-3">
                <FieldLabel htmlFor="apply-template-diagnosis">
                  {t('Diagnosis_patient_list')}
                </FieldLabel>
                <Select value={diagnosis || undefined} onValueChange={setDiagnosis}>
                  <SelectTrigger id="apply-template-diagnosis">
                    <SelectValue placeholder={t('Choose...')} />
                  </SelectTrigger>
                  <SelectContent>
                    {diagnoses.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {t('Applies to all clinic patients with this diagnosis.')}
                </FieldDescription>
                {fieldErrors.diagnosis && <FieldError>{fieldErrors.diagnosis}</FieldError>}
              </Field>
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
            <div className="md:col-span-6">
              <Field>
                <FieldLabel htmlFor="effective-from">{t('Effective from')}</FieldLabel>
                <Input
                  id="effective-from"
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
                {fieldErrors.effectiveFrom && <FieldError>{fieldErrors.effectiveFrom}</FieldError>}
              </Field>
            </div>
            <div className="md:col-span-6 flex items-end">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="overwrite"
                  checked={overwrite}
                  onCheckedChange={(checked) => setOverwrite(checked === true)}
                />
                <Label htmlFor="overwrite" className="cursor-pointer">
                  {t('Overwrite future sessions')}
                </Label>
              </div>
            </div>
          </div>

          <div className="mb-3 flex items-center gap-2">
            <Checkbox
              id="force-video"
              checked={forceVideo}
              onCheckedChange={(checked) => setForceVideo(checked === true)}
            />
            <Label htmlFor="force-video" className="cursor-pointer">
              {t('Ask video feedback for all')}
            </Label>
          </div>

          <Field>
            <FieldLabel htmlFor="apply-template-notes">{t('Notes (optional)')}</FieldLabel>
            <Textarea
              id="apply-template-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </form>

        <DialogFooter>
          <Button size="dashboard" variant="secondary" onClick={confirmClose} disabled={submitting}>
            {t('Cancel')}
          </Button>
          <Button size="dashboard" onClick={handleApply} disabled={!canSubmit || submitting}>
            {submitting ? t('Applying...') : t('Apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ApplyTemplateModal;
