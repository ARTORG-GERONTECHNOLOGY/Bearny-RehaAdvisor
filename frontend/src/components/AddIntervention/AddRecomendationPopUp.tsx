// src/components/TherapistInterventionPage/AddInterventionPopUp.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Alert } from '@/components/ui/alert';
import { FaPlus, FaTrash } from 'react-icons/fa';
import axios from 'axios';
import Select from 'react-select';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import apiClient from '@/api/client';
import authStore from '@/stores/authStore';
import StandardModal from '../common/StandardModal';
import interventionsTaxonomyStore from '@/stores/interventionsTaxonomyStore';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

// Sentinel for the "clear selection" Select item — Radix forbids an empty-string item value.
const UNSET_OPTION = '__unset__';

const CONTENT_TYPE_TO_BACKEND: Record<string, string> = {
  brochure: 'pdf',
  video: 'video',
  audio: 'audio',
  graphics: 'image',
  app: 'app',
  website: 'website',
};

type MediaType = 'audio' | 'video' | 'image' | 'pdf' | 'website' | 'app' | 'streaming' | 'text';
type MediaProvider = 'spotify' | 'youtube' | 'soundcloud' | 'vimeo' | string;

type MediaItem = {
  kind: 'external' | 'file';
  media_type: MediaType;
  provider?: MediaProvider | '';
  title?: string;
  url?: string;
  file?: File | null;
};

interface AddInterventionPopupProps {
  show: boolean;
  handleClose: () => void;
  onSuccess: () => void;
}

type ErrorMap = Record<string, string>;

const defaultMediaItem: MediaItem = {
  kind: 'external',
  media_type: 'website',
  provider: '',
  title: '',
  url: '',
  file: null,
};

const defaultFormData = {
  title: '',
  description: '',
  duration: 0,
  contentType: '' as string,

  // NEW model fields
  language: 'en',
  externalId: '',
  provider: '',

  // taxonomy fields (NEW)
  inputFrom: [] as string[],
  originalLanguage: '' as string,
  primaryDiagnosis: [] as string[],
  aims: [] as string[],
  topics: [] as string[],
  cognitiveLevel: '' as string,
  physicalLevel: '' as string,
  durationBucket: '' as string,
  sexSpecific: '' as string,
  where: [] as string[],
  setting: [] as string[],

  // media
  media: [] as MediaItem[],

  // private/public
  isPrivate: false,
  patientId: '',
};

// -------------------- HELPERS --------------------
const cleanStr = (v: any) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v);
const uniqueStrings = (arr: string[]) => Array.from(new Set((arr || []).filter(Boolean)));

const isValidUrlHttp = (raw: string) => {
  if (!raw) return true;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const kindOptions = [
  { value: 'external', label: 'External link' },
  { value: 'file', label: 'Upload file' },
];

const langOptions = [
  { value: 'de', label: 'DE — Deutsch' },
  { value: 'en', label: 'EN — English' },
  { value: 'fr', label: 'FR — Français' },
  { value: 'it', label: 'IT — Italiano' },
  { value: 'pt', label: 'PT — Português' },
  { value: 'nl', label: 'NL — Nederlands' },
];

const mediaTypeOptions: { value: MediaType; label: string }[] = [
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'image', label: 'Image' },
  { value: 'pdf', label: 'PDF' },
  { value: 'website', label: 'Website' },
  { value: 'app', label: 'App' },
  { value: 'streaming', label: 'Streaming' },
  { value: 'text', label: 'Text' },
];

const AddInterventionPopup: React.FC<AddInterventionPopupProps> = observer(
  ({ show, handleClose, onSuccess }) => {
    const { t } = useTranslation();

    const [formData, setFormData] = useState(defaultFormData);
    const [error, setError] = useState('');
    const [errors, setErrors] = useState<ErrorMap>({});
    const [success, setSuccess] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [therapistPatients, setTherapistPatients] = useState<{ id: string; name: string }[]>([]);
    const [patientsLoaded, setPatientsLoaded] = useState(false);
    const [patientsLoading, setPatientsLoading] = useState(false);
    const [patientsLoadError, setPatientsLoadError] = useState<string>('');
    const [showErrorDetails, setShowErrorDetails] = useState(false);
    const [privateCheckedOnce, setPrivateCheckedOnce] = useState(false);

    // ---------- taxonomy options (store) ----------
    const taxonomy = interventionsTaxonomyStore;

    const inputFromOptions = useMemo(
      () => taxonomy.inputFrom.map((v) => ({ value: v, label: t(v) })),
      [taxonomy, t]
    );
    const aimsOptions = useMemo(
      () => taxonomy.aims.map((v) => ({ value: v, label: t(v) })),
      [taxonomy, t]
    );
    const topicsOptions = useMemo(
      () => taxonomy.topics.map((v) => ({ value: v, label: t(v) })),
      [taxonomy, t]
    );
    const whereOptions = useMemo(
      () => taxonomy.where.map((v) => ({ value: v, label: t(v) })),
      [taxonomy, t]
    );
    const settingOptions = useMemo(
      () => taxonomy.setting.map((v) => ({ value: v, label: t(v) })),
      [taxonomy, t]
    );

    // dropdown options
    const originalLanguageOptions = useMemo(() => taxonomy.originalLanguages, [taxonomy]);
    const primaryDiagnosisOptions = useMemo(() => taxonomy.primaryDiagnoses, [taxonomy]);
    const cognitiveLevelOptions = useMemo(() => taxonomy.cognitiveLevels, [taxonomy]);
    const physicalLevelOptions = useMemo(() => taxonomy.physicalLevels, [taxonomy]);
    const durationBucketOptions = useMemo(() => taxonomy.durationBuckets, [taxonomy]);
    const sexSpecificOptions = useMemo(() => taxonomy.sexSpecific, [taxonomy]);

    const contentTypes = useMemo(() => taxonomy.contentTypes, [taxonomy]);

    // -------------------- FETCH PATIENTS --------------------
    const fetchTherapistPatients = useCallback(async () => {
      if (patientsLoading) return;

      setPatientsLoading(true);
      setPatientsLoadError('');

      try {
        const therapistId = authStore.id;
        if (!therapistId) {
          setPatientsLoadError(t('Missing therapist id.'));
          setTherapistPatients([]);
          setPatientsLoaded(false);
          return;
        }

        const { data } = await apiClient.get(`/therapists/${therapistId}/patients/`);
        const arr = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        const patientOptions = arr.map((p: any) => ({
          id: p._id,
          name: p.patient_code,
        }));

        setTherapistPatients(patientOptions);
        setPatientsLoaded(true);
      } catch (err) {
        console.error('Failed to fetch patients:', err);
        setPatientsLoadError(t('Failed to fetch patients.'));
        setTherapistPatients([]);
        setPatientsLoaded(false);
      } finally {
        setPatientsLoading(false);
      }
    }, [patientsLoading, t]);

    useEffect(() => {
      if (!show) return;
      authStore.checkAuthentication();
    }, [show]);

    useEffect(() => {
      if (!formData.isPrivate) return;
      setPrivateCheckedOnce(true);
      if (!patientsLoaded && !patientsLoading) fetchTherapistPatients();
    }, [formData.isPrivate]);

    // -------------------- RESET --------------------
    const resetForm = useCallback(() => {
      setFormData(defaultFormData);
      setError('');
      setErrors({});
      setSuccess(false);
      setSubmitting(false);
      setShowErrorDetails(false);

      setTherapistPatients([]);
      setPatientsLoaded(false);
      setPatientsLoading(false);
      setPatientsLoadError('');
      setPrivateCheckedOnce(false);
    }, []);

    useEffect(() => {
      if (!show) resetForm();
    }, [show, resetForm]);

    const confirmClose = useCallback(() => {
      if (submitting) return;
      resetForm();
      handleClose();
    }, [handleClose, resetForm, submitting]);

    // -------------------- FIELD HANDLERS --------------------
    const handleChange = (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => {
      const { id, value, type, checked } = e.target as HTMLInputElement;
      const val = type === 'checkbox' ? checked : value;

      setFormData((prev) => {
        const next: any = {
          ...prev,
          [id]: type === 'text' || type === 'textarea' ? cleanStr(val) : val,
        };
        if (id === 'isPrivate' && !checked) next.patientId = '';
        return next;
      });

      if (errors[id]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
      setError('');
    };

    const handleMultiChange = (field: keyof typeof formData, selected: any[]) => {
      setFormData((prev) => ({
        ...prev,
        [field]: uniqueStrings((selected || []).map((opt) => opt.value)),
      }));
      const key = field as string;
      if (errors[key]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    };

    // -------------------- MEDIA EDITING --------------------
    const addMediaRow = () => {
      setFormData((prev) => ({ ...prev, media: [...(prev.media || []), { ...defaultMediaItem }] }));
    };

    const removeMediaRow = (idx: number) => {
      setFormData((prev) => ({ ...prev, media: (prev.media || []).filter((_, i) => i !== idx) }));
    };

    const updateMediaRow = (idx: number, patch: Partial<MediaItem>) => {
      setFormData((prev) => {
        const next = [...(prev.media || [])];
        const current = next[idx] || { ...defaultMediaItem };

        let merged: MediaItem = { ...current, ...patch };
        if (patch.kind === 'external') merged = { ...merged, file: null };
        if (patch.kind === 'file') merged = { ...merged, url: '' };

        next[idx] = merged;
        return { ...prev, media: next };
      });

      const rowKey = `media.${idx}`;
      setErrors((prev) => {
        const next = { ...prev };
        Object.keys(next)
          .filter((k) => k.startsWith(rowKey))
          .forEach((k) => delete next[k]);
        return next;
      });
    };

    const handleMediaFileChange = (idx: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      if (file) {
        const maxBytes = 1024 * 1024 * 1024;
        if (file.size > maxBytes) {
          setErrors((prev) => ({
            ...prev,
            [`media.${idx}.file`]: t('File is too large (max 1GB).'),
          }));
          return;
        }
      }
      updateMediaRow(idx, { file });
    };

    /* ---------------- VALIDATION ---------------- */
    const validateForm = (): { valid: boolean; errors: ErrorMap } => {
      const e: ErrorMap = {};
      const f = formData;

      const title = cleanStr(f.title);
      const desc = cleanStr(f.description);

      if (!title) e.title = t('Title is required');
      if (!desc) e.description = t('Description is required');

      const dur = Number(f.duration);
      if (!dur || Number.isNaN(dur) || dur <= 0) e.duration = t('Duration must be greater than 0');
      if (dur > 600) e.duration = t('Duration seems too high (max 600 minutes).');

      if (!cleanStr(f.contentType)) e.contentType = t('Please select a content type.');

      const lang = cleanStr(f.language);
      if (!lang) e.language = t('Language is required');

      // media validation
      (f.media || []).forEach((m, idx) => {
        if (!m?.media_type) e[`media.${idx}.media_type`] = t('Media type is required');
        if (m.kind === 'external') {
          const url = cleanStr(m.url || '');
          if (!url) e[`media.${idx}.url`] = t('URL is required');
          else if (!isValidUrlHttp(url))
            e[`media.${idx}.url`] = t('URL must start with http:// or https://');
        } else if (m.kind === 'file') {
          if (!m.file) e[`media.${idx}.file`] = t('Please select a file');
        } else {
          e[`media.${idx}.kind`] = t('Invalid media kind');
        }
      });

      if (f.isPrivate) {
        if (!cleanStr(f.patientId)) e.patientId = t('Please select a patient');
      }

      return { valid: Object.keys(e).length === 0, errors: e };
    };

    /* ---------------- BACKEND ERROR HANDLER ---------------- */
    const applyBackendErrors = (data: any) => {
      if (!data) return;

      const fieldErrors: ErrorMap = {};
      if (data.field_errors && typeof data.field_errors === 'object') {
        Object.entries(data.field_errors).forEach(([key, value]) => {
          fieldErrors[key] = Array.isArray(value) ? value.join(' ') : String(value);
        });
      }
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length > 0) setShowErrorDetails(true);

      const nonField =
        Array.isArray(data?.non_field_errors) && data.non_field_errors.length
          ? data.non_field_errors.join(' ')
          : '';

      setError(
        nonField ||
          data?.message ||
          data?.error ||
          t('There are validation errors. Please check the details below.')
      );
    };

    /* ---------------- SUBMIT ---------------- */
    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) return;

      const cleaned = {
        ...formData,
        title: cleanStr(formData.title),
        description: cleanStr(formData.description),
        externalId: cleanStr(formData.externalId),
        provider: cleanStr(formData.provider),
        language: cleanStr(formData.language),
        contentType:
          CONTENT_TYPE_TO_BACKEND[cleanStr(formData.contentType)?.toLowerCase()] ??
          cleanStr(formData.contentType),

        inputFrom: uniqueStrings(formData.inputFrom),
        aims: uniqueStrings(formData.aims),
        topics: uniqueStrings(formData.topics),
        where: uniqueStrings(formData.where),
        setting: uniqueStrings(formData.setting),

        media: (formData.media || []).map((m) => ({
          ...m,
          title: cleanStr(m.title || ''),
          url: cleanStr(m.url || ''),
          provider: cleanStr(m.provider || ''),
        })),
      };

      setFormData(cleaned as any);

      const { valid, errors: found } = validateForm();
      if (!valid) {
        setErrors(found);
        setError(t('Please correct the highlighted fields.'));
        setShowErrorDetails(true);
        return;
      }

      try {
        setSubmitting(true);
        setError('');
        setShowErrorDetails(false);

        const payload = new FormData();

        payload.append('title', String(cleaned.title || ''));
        payload.append('description', String(cleaned.description || ''));
        payload.append('duration', String(cleaned.duration || 0));
        payload.append('contentType', String(cleaned.contentType || ''));

        payload.append('language', String(cleaned.language || 'en'));
        if (cleaned.externalId) payload.append('external_id', String(cleaned.externalId));
        if (cleaned.provider) payload.append('provider', String(cleaned.provider));

        payload.append(
          'taxonomy',
          JSON.stringify({
            input_from: cleaned.inputFrom,
            original_language: cleaned.originalLanguage || null,
            primary_diagnosis: cleaned.primaryDiagnosis,
            aims: cleaned.aims,
            topics: cleaned.topics,
            cognitive_level: cleaned.cognitiveLevel || null,
            physical_level: cleaned.physicalLevel || null,
            duration_bucket: cleaned.durationBucket || null,
            sex_specific: cleaned.sexSpecific || null,
            where: cleaned.where,
            setting: cleaned.setting,
          })
        );

        payload.append('isPrivate', String(cleaned.isPrivate));

        if (cleaned.isPrivate) {
          payload.append('patientId', String(cleaned.patientId || ''));
        }

        const mediaMeta = (cleaned.media || []).map((m, idx) => ({
          kind: m.kind,
          media_type: m.media_type,
          provider: m.provider || null,
          title: m.title || null,
          url: m.kind === 'external' ? m.url || null : null,
          file_field: m.kind === 'file' ? `media_file_${idx}` : null,
        }));
        payload.append('media', JSON.stringify(mediaMeta));

        (cleaned.media || []).forEach((m, idx) => {
          if (m.kind === 'file' && m.file) payload.append(`media_file_${idx}`, m.file);
        });

        const res = await apiClient.post('/interventions/add/', payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (res.data?.success) {
          setSuccess(true);
          setError('');
          setErrors({});
          setShowErrorDetails(false);
          onSuccess();
          return;
        }

        applyBackendErrors(res.data);
      } catch (err: any) {
        if (axios.isAxiosError(err) && err.response?.data) {
          applyBackendErrors(err.response.data);
        } else {
          setError(t('An unexpected error occurred. Please try again.'));
          setShowErrorDetails(true);
        }
      } finally {
        setSubmitting(false);
      }
    };

    const fe = (key: string) => errors[key];

    const footer = useMemo(
      () => (
        <Button size="dashboard" variant="secondary" onClick={confirmClose} disabled={submitting}>
          {t('Close')}
        </Button>
      ),
      [confirmClose, submitting, t]
    );

    return (
      <StandardModal
        show={show}
        onHide={confirmClose}
        title={t('Add New Intervention')}
        size="lg"
        backdrop="static"
        keyboard
        footer={footer}
      >
        <div>
          <form onSubmit={handleSubmit} noValidate>
            <fieldset disabled={success || submitting}>
              {/* ---------- core fields ---------- */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
                <div className="md:col-span-8">
                  <Field>
                    <FieldLabel htmlFor="title">{t('InterventionTitle')}</FieldLabel>
                    <Input
                      id="title"
                      type="text"
                      value={formData.title}
                      onChange={handleChange}
                      required
                    />
                    {fe('title') && <FieldError>{fe('title')}</FieldError>}
                  </Field>
                </div>

                <div className="md:col-span-4">
                  <Field>
                    <FieldLabel htmlFor="language">{t('Language')}</FieldLabel>
                    <UiSelect
                      value={formData.language}
                      onValueChange={(value) =>
                        handleChange({ target: { id: 'language', value, type: 'text' } } as any)
                      }
                    >
                      <SelectTrigger id="language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {langOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </UiSelect>
                    {fe('language') && <FieldError>{fe('language')}</FieldError>}
                  </Field>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <Field>
                    <FieldLabel htmlFor="externalId">{t('External ID (optional)')}</FieldLabel>
                    <Input
                      id="externalId"
                      type="text"
                      value={formData.externalId}
                      onChange={handleChange}
                      placeholder="e.g. 3500_web or 30500_vid"
                    />
                    <FieldDescription>
                      4 digits = original · 5 digits = self-made · format: vid, img, gfx, pdf, br,
                      web, aud, app
                    </FieldDescription>
                  </Field>
                </div>

                <div>
                  <Field>
                    <FieldLabel htmlFor="provider">{t('Provider (optional)')}</FieldLabel>
                    <Input
                      id="provider"
                      type="text"
                      value={formData.provider}
                      onChange={handleChange}
                      placeholder="e.g. compass / spotify / youtube"
                    />
                  </Field>
                </div>
              </div>

              <Field className="mb-3">
                <FieldLabel htmlFor="description">{t('Description')}</FieldLabel>
                <Textarea
                  id="description"
                  rows={3}
                  value={formData.description}
                  onChange={handleChange}
                />
                {fe('description') && <FieldError>{fe('description')}</FieldError>}
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Field>
                    <FieldLabel htmlFor="duration">{t('Duration (min)')}</FieldLabel>
                    <Input
                      id="duration"
                      type="number"
                      value={formData.duration}
                      onChange={handleChange}
                    />
                    {fe('duration') && <FieldError>{fe('duration')}</FieldError>}
                  </Field>
                </div>

                <div>
                  <Field>
                    <FieldLabel htmlFor="contentType">{t('Content type')}</FieldLabel>
                    <UiSelect
                      value={formData.contentType || UNSET_OPTION}
                      onValueChange={(value) =>
                        handleChange({
                          target: {
                            id: 'contentType',
                            value: value === UNSET_OPTION ? '' : value,
                            type: 'text',
                          },
                        } as any)
                      }
                    >
                      <SelectTrigger id="contentType">
                        <SelectValue placeholder={t('Select')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSET_OPTION}>{t('Select')}</SelectItem>
                        {contentTypes.map((ct: string) => (
                          <SelectItem key={ct} value={ct}>
                            {t(ct)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </UiSelect>
                    {fe('contentType') && <FieldError>{fe('contentType')}</FieldError>}
                  </Field>
                </div>
              </div>

              {/* ---------- taxonomy fields ---------- */}
              <Separator className="my-6" />
              <h5 className="text-base font-semibold mb-3">{t('Taxonomy')}</h5>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
                <div className="md:col-span-6">
                  <Field>
                    <FieldLabel htmlFor="inputFrom">{t('Input from')}</FieldLabel>
                    <Select
                      inputId="inputFrom"
                      isMulti
                      placeholder={t('Select...')}
                      options={inputFromOptions}
                      value={inputFromOptions.filter((o) =>
                        (formData.inputFrom || []).includes(o.value)
                      )}
                      onChange={(opts) => handleMultiChange('inputFrom', opts as any)}
                    />
                  </Field>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <Field>
                    <FieldLabel htmlFor="originalLanguage">{t('Original language')}</FieldLabel>
                    <UiSelect
                      value={formData.originalLanguage || UNSET_OPTION}
                      onValueChange={(value) =>
                        handleChange({
                          target: {
                            id: 'originalLanguage',
                            value: value === UNSET_OPTION ? '' : value,
                            type: 'text',
                          },
                        } as any)
                      }
                    >
                      <SelectTrigger id="originalLanguage">
                        <SelectValue placeholder={t('Select')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSET_OPTION}>{t('Select')}</SelectItem>
                        {originalLanguageOptions.map((x) => (
                          <SelectItem key={x} value={x}>
                            {x}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </UiSelect>
                  </Field>
                </div>

                <div>
                  <Field>
                    <FieldLabel htmlFor="primaryDiagnosis">{t('Primary diagnosis')}</FieldLabel>
                    <Select
                      isMulti
                      inputId="primaryDiagnosis"
                      options={primaryDiagnosisOptions.map((x) => ({ value: x, label: t(x) }))}
                      value={(formData.primaryDiagnosis || []).map((x) => ({
                        value: x,
                        label: t(x),
                      }))}
                      onChange={(opts) =>
                        setFormData((prev) => ({
                          ...prev,
                          primaryDiagnosis: (opts || []).map((o: any) => o.value),
                        }))
                      }
                      placeholder={t('Select')}
                    />
                  </Field>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <Field>
                    <FieldLabel htmlFor="aims">{t('Aims')}</FieldLabel>
                    <Select
                      inputId="aims"
                      isMulti
                      placeholder={t('Select...')}
                      options={aimsOptions}
                      value={aimsOptions.filter((o) => (formData.aims || []).includes(o.value))}
                      onChange={(opts) => handleMultiChange('aims', opts as any)}
                    />
                  </Field>
                </div>

                <div>
                  <Field>
                    <FieldLabel htmlFor="topics">{t('Topics')}</FieldLabel>
                    <Select
                      inputId="topics"
                      isMulti
                      placeholder={t('Select...')}
                      options={topicsOptions}
                      value={topicsOptions.filter((o) => (formData.topics || []).includes(o.value))}
                      onChange={(opts) => handleMultiChange('topics', opts as any)}
                    />
                  </Field>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
                  <Field>
                    <FieldLabel htmlFor="cognitiveLevel">{t('Cognitive level')}</FieldLabel>
                    <UiSelect
                      value={formData.cognitiveLevel || UNSET_OPTION}
                      onValueChange={(value) =>
                        handleChange({
                          target: {
                            id: 'cognitiveLevel',
                            value: value === UNSET_OPTION ? '' : value,
                            type: 'text',
                          },
                        } as any)
                      }
                    >
                      <SelectTrigger id="cognitiveLevel">
                        <SelectValue placeholder={t('Select')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSET_OPTION}>{t('Select')}</SelectItem>
                        {cognitiveLevelOptions.map((x) => (
                          <SelectItem key={x} value={x}>
                            {t(x)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </UiSelect>
                  </Field>
                </div>

                <div>
                  <Field>
                    <FieldLabel htmlFor="physicalLevel">{t('Physical level')}</FieldLabel>
                    <UiSelect
                      value={formData.physicalLevel || UNSET_OPTION}
                      onValueChange={(value) =>
                        handleChange({
                          target: {
                            id: 'physicalLevel',
                            value: value === UNSET_OPTION ? '' : value,
                            type: 'text',
                          },
                        } as any)
                      }
                    >
                      <SelectTrigger id="physicalLevel">
                        <SelectValue placeholder={t('Select')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSET_OPTION}>{t('Select')}</SelectItem>
                        {physicalLevelOptions.map((x) => (
                          <SelectItem key={x} value={x}>
                            {t(x)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </UiSelect>
                  </Field>
                </div>

                <div>
                  <Field>
                    <FieldLabel htmlFor="durationBucket">{t('Duration bucket')}</FieldLabel>
                    <UiSelect
                      value={formData.durationBucket || UNSET_OPTION}
                      onValueChange={(value) =>
                        handleChange({
                          target: {
                            id: 'durationBucket',
                            value: value === UNSET_OPTION ? '' : value,
                            type: 'text',
                          },
                        } as any)
                      }
                    >
                      <SelectTrigger id="durationBucket">
                        <SelectValue placeholder={t('Select')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSET_OPTION}>{t('Select')}</SelectItem>
                        {durationBucketOptions.map((x) => (
                          <SelectItem key={x} value={x}>
                            {x}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </UiSelect>
                  </Field>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
                <div className="md:col-span-4">
                  <Field>
                    <FieldLabel htmlFor="sexSpecific">{t('Sex specific')}</FieldLabel>
                    <UiSelect
                      value={formData.sexSpecific || UNSET_OPTION}
                      onValueChange={(value) =>
                        handleChange({
                          target: {
                            id: 'sexSpecific',
                            value: value === UNSET_OPTION ? '' : value,
                            type: 'text',
                          },
                        } as any)
                      }
                    >
                      <SelectTrigger id="sexSpecific">
                        <SelectValue placeholder={t('Select')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSET_OPTION}>{t('Select')}</SelectItem>
                        {sexSpecificOptions.map((x) => (
                          <SelectItem key={x} value={x}>
                            {t(x)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </UiSelect>
                  </Field>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <Field>
                    <FieldLabel htmlFor="where">{t('Where')}</FieldLabel>
                    <Select
                      inputId="where"
                      isMulti
                      placeholder={t('Select...')}
                      options={whereOptions}
                      value={whereOptions.filter((o) => (formData.where || []).includes(o.value))}
                      onChange={(opts) => handleMultiChange('where', opts as any)}
                    />
                  </Field>
                </div>

                <div>
                  <Field>
                    <FieldLabel htmlFor="setting">{t('Setting')}</FieldLabel>
                    <Select
                      inputId="setting"
                      isMulti
                      placeholder={t('Select...')}
                      options={settingOptions}
                      value={settingOptions.filter((o) =>
                        (formData.setting || []).includes(o.value)
                      )}
                      onChange={(opts) => handleMultiChange('setting', opts as any)}
                    />
                  </Field>
                </div>
              </div>

              {/* ---------- media ---------- */}
              <Separator className="my-4" />
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-base font-semibold mb-0">{t('Media')}</h5>
                <Button size="dashboard" onClick={addMediaRow}>
                  <FaPlus /> {t('Add media')}
                </Button>
              </div>

              <Alert variant="info" className="py-2 px-3 mb-3" style={{ fontSize: '0.875rem' }}>
                {t('multiMediaManualUploadInfo')}
              </Alert>

              {(formData.media || []).length === 0 && (
                <div className="text-muted-foreground mb-3">
                  {t('No media added yet. You can add links or upload files.')}
                </div>
              )}

              {(formData.media || []).map((m, idx) => {
                const baseKey = `media.${idx}`;
                return (
                  <div key={idx} className="border rounded p-3 mb-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="font-semibold mb-3">
                        {t('Media item')} #{idx + 1}
                      </div>
                      <Button
                        size="dashboard"
                        variant="ghost"
                        className="p-0 text-nok hover:text-nok/90"
                        onClick={() => removeMediaRow(idx)}
                        aria-label={t('Remove media')}
                      >
                        <FaTrash />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-4">
                        <Field>
                          <FieldLabel>{t('Kind')}</FieldLabel>
                          <UiSelect
                            value={m.kind}
                            onValueChange={(value) =>
                              updateMediaRow(idx, { kind: value as 'external' | 'file' })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {kindOptions.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {t(o.label)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </UiSelect>
                        </Field>
                      </div>

                      <div className="md:col-span-4">
                        <Field>
                          <FieldLabel>{t('Media type')}</FieldLabel>
                          <UiSelect
                            value={m.media_type}
                            onValueChange={(value) =>
                              updateMediaRow(idx, { media_type: value as MediaType })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {mediaTypeOptions.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {t(o.label)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </UiSelect>
                        </Field>
                      </div>

                      <div className="md:col-span-4">
                        <Field>
                          <FieldLabel>{t('Provider (optional)')}</FieldLabel>
                          <Input
                            type="text"
                            value={m.provider || ''}
                            onChange={(e) => updateMediaRow(idx, { provider: e.target.value })}
                            placeholder="spotify / youtube / etc."
                          />
                        </Field>
                      </div>

                      <div className="md:col-span-6">
                        <Field>
                          <FieldLabel>{t('Title (optional)')}</FieldLabel>
                          <Input
                            type="text"
                            value={m.title || ''}
                            onChange={(e) => updateMediaRow(idx, { title: e.target.value })}
                          />
                        </Field>
                      </div>

                      <div className="md:col-span-6">
                        {m.kind === 'external' ? (
                          <Field>
                            <FieldLabel>{t('URL')}</FieldLabel>
                            <Input
                              type="text"
                              value={m.url || ''}
                              onChange={(e) => updateMediaRow(idx, { url: e.target.value })}
                              placeholder="https://..."
                            />
                            {fe(`${baseKey}.url`) && (
                              <FieldError>{fe(`${baseKey}.url`)}</FieldError>
                            )}
                          </Field>
                        ) : (
                          <Field>
                            <FieldLabel>{t('Upload file')}</FieldLabel>
                            <Input
                              type="file"
                              accept="image/*,video/*,audio/*,application/pdf"
                              onChange={handleMediaFileChange(idx)}
                            />
                            {fe(`${baseKey}.file`) && (
                              <FieldError>{fe(`${baseKey}.file`)}</FieldError>
                            )}
                          </Field>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* ---------- privacy ---------- */}
              <Separator className="my-4" />
              <div className="flex items-center gap-2 mb-3">
                <Checkbox
                  id="isPrivate"
                  checked={formData.isPrivate}
                  onCheckedChange={(checked) =>
                    handleChange({ target: { id: 'isPrivate', checked, type: 'checkbox' } } as any)
                  }
                />
                <Label htmlFor="isPrivate" className="cursor-pointer">
                  {t('Make this a private intervention (only visible to the assigned patient)')}
                </Label>
              </div>

              {formData.isPrivate && (
                <Field>
                  <FieldLabel htmlFor="patientId">{t('Assign to Patient')}</FieldLabel>

                  {!patientsLoaded && privateCheckedOnce && (
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-muted-foreground text-sm">
                        {patientsLoading ? t('Loading patients...') : t('Patients not loaded yet')}
                      </div>
                      <Button
                        size="dashboard"
                        variant="secondary"
                        disabled={patientsLoading}
                        onClick={fetchTherapistPatients}
                      >
                        {t('Reload')}
                      </Button>
                    </div>
                  )}

                  <UiSelect
                    value={formData.patientId || undefined}
                    onValueChange={(value) =>
                      handleChange({ target: { id: 'patientId', value, type: 'text' } } as any)
                    }
                    disabled={patientsLoading || !patientsLoaded}
                  >
                    <SelectTrigger id="patientId">
                      <SelectValue placeholder={t('Select a patient')} />
                    </SelectTrigger>
                    <SelectContent>
                      {therapistPatients.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </UiSelect>
                  {fe('patientId') && <FieldError>{fe('patientId')}</FieldError>}
                </Field>
              )}
            </fieldset>

            {!success && (
              <Button size="dashboard" type="submit" className="mt-4 w-full" disabled={submitting}>
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner /> {t('Submitting...')}
                  </span>
                ) : (
                  t('Submit')
                )}
              </Button>
            )}

            {(error || patientsLoadError) && (
              <Alert variant="destructive" className="mt-3 mb-0" aria-live="assertive">
                <div className="flex justify-between items-center gap-2 flex-wrap">
                  <span>{patientsLoadError || error}</span>
                  {Object.keys(errors).length > 0 && (
                    <Button
                      size="dashboard"
                      variant="secondary"
                      onClick={() => setShowErrorDetails(!showErrorDetails)}
                      aria-expanded={showErrorDetails}
                    >
                      {showErrorDetails ? t('Hide details') : t('Show details')}
                    </Button>
                  )}
                </div>

                {showErrorDetails && Object.keys(errors).length > 0 && (
                  <div className="mt-3">
                    <ul className="list-disc pl-6 mb-0">
                      {Object.entries(errors).map(([field, msg]) => (
                        <li key={field}>
                          <strong>{field}</strong>: {msg}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Alert>
            )}

            {success && (
              <Alert variant="success" className="mt-3 mb-0" role="status" aria-live="polite">
                {t('Intervention successfully added')}
              </Alert>
            )}
          </form>
        </div>
      </StandardModal>
    );
  }
);

export default AddInterventionPopup;
