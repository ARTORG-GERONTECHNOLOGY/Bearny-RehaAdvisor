// src/components/TherapistInterventionPage/AddInterventionPopUp.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Alert, Button, Col, Form, Row, Spinner } from 'react-bootstrap';
import { FaPlus, FaTrash } from 'react-icons/fa';
import axios from 'axios';
import Select from 'react-select';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import apiClient from '../../api/client';
import config from '../../config/config.json';
import authStore from '../../stores/authStore';
import StandardModal from '../common/StandardModal';
import interventionsTaxonomyStore from '../../stores/interventionsTaxonomyStore';

type PatientType = {
  type: string;
  frequency: string;
  includeOption: any;
  diagnosis: string;
  diagnosesOptions: string[];
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

const defaultPatientType: PatientType = {
  type: '',
  frequency: '',
  includeOption: null,
  diagnosis: '',
  diagnosesOptions: [],
};

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

const isPatientTypeRowComplete = (pt: PatientType) =>
  !!cleanStr(pt.type) && !!cleanStr(pt.diagnosis) && !!cleanStr(pt.frequency);

const sanitizePatientTypes = (pts: PatientType[]) =>
  (pts || [])
    .map((pt) => ({
      ...pt,
      type: cleanStr(pt.type),
      diagnosis: cleanStr(pt.diagnosis),
      frequency: cleanStr(pt.frequency),
    }))
    .filter((pt) => isPatientTypeRowComplete(pt));

const patientTypeRowKey = (idx: number, field: keyof PatientType) => `patientTypes.${idx}.${field}`;

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
    }, [formData.isPrivate, patientsLoaded, patientsLoading, fetchTherapistPatients]);

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

      if (!cleanStr(f.contentType)) e.contentType = t('Content type is required');

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
        contentType: cleanStr(formData.contentType),

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

        if (res.status === 201) {
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
        <Button variant="outline-secondary" onClick={confirmClose} disabled={submitting}>
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
        <div className="px-1 px-sm-2">
          <Form onSubmit={handleSubmit} noValidate>
            <fieldset disabled={success || submitting}>
              {/* ---------- core fields ---------- */}
              <Row className="g-3">
                <Col md={8}>
                  <Form.Group controlId="title" className="mb-3">
                    <Form.Label className="fw-semibold">{t('InterventionTitle')}</Form.Label>
                    <Form.Control
                      type="text"
                      value={formData.title}
                      onChange={handleChange}
                      isInvalid={!!fe('title')}
                      required
                    />
                    <Form.Control.Feedback type="invalid">{fe('title')}</Form.Control.Feedback>
                  </Form.Group>
                </Col>

                <Col md={4}>
                  <Form.Group controlId="language" className="mb-3">
                    <Form.Label className="fw-semibold">{t('Language')}</Form.Label>
                    <Form.Control
                      as="select"
                      value={formData.language}
                      onChange={handleChange}
                      isInvalid={!!fe('language')}
                    >
                      {langOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Form.Control>
                    <Form.Control.Feedback type="invalid">{fe('language')}</Form.Control.Feedback>
                  </Form.Group>
                </Col>
              </Row>

              <Row className="g-3">
                <Col md={6}>
                  <Form.Group controlId="externalId" className="mb-3">
                    <Form.Label className="fw-semibold">{t('External ID (optional)')}</Form.Label>
                    <Form.Control
                      type="text"
                      value={formData.externalId}
                      onChange={handleChange}
                      placeholder="e.g. 3500_web or 30500_vid"
                    />
                    <Form.Text className="text-muted">
                      4 digits = original · 5 digits = self-made · format: vid, img, gfx, pdf, br,
                      web, aud, app
                    </Form.Text>
                  </Form.Group>
                </Col>

                <Col md={6}>
                  <Form.Group controlId="provider" className="mb-3">
                    <Form.Label className="fw-semibold">{t('Provider (optional)')}</Form.Label>
                    <Form.Control
                      type="text"
                      value={formData.provider}
                      onChange={handleChange}
                      placeholder="e.g. compass / spotify / youtube"
                    />
                  </Form.Group>
                </Col>
              </Row>

              <Form.Group controlId="description" className="mb-3">
                <Form.Label className="fw-semibold">{t('Description')}</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={formData.description}
                  onChange={handleChange}
                  isInvalid={!!fe('description')}
                />
                <Form.Control.Feedback type="invalid">{fe('description')}</Form.Control.Feedback>
              </Form.Group>

              <Row className="g-3">
                <Col md={6}>
                  <Form.Group controlId="duration" className="mb-3">
                    <Form.Label className="fw-semibold">{t('Duration (min)')}</Form.Label>
                    <Form.Control
                      type="number"
                      value={formData.duration}
                      onChange={handleChange}
                      isInvalid={!!fe('duration')}
                    />
                    <Form.Control.Feedback type="invalid">{fe('duration')}</Form.Control.Feedback>
                  </Form.Group>
                </Col>

                <Col md={6}>
                  <Form.Group className="mb-3" controlId="contentType">
                    <Form.Label className="fw-semibold">{t('Content type')}</Form.Label>
                    <Form.Control
                      as="select"
                      value={formData.contentType}
                      onChange={handleChange}
                      isInvalid={!!fe('contentType')}
                    >
                      <option value="">{t('Select')}</option>
                      {contentTypes.map((ct: string) => (
                        <option key={ct} value={ct}>
                          {t(ct)}
                        </option>
                      ))}
                    </Form.Control>
                    <Form.Control.Feedback type="invalid">
                      {fe('contentType')}
                    </Form.Control.Feedback>
                  </Form.Group>
                </Col>
              </Row>

              {/* ---------- taxonomy fields ---------- */}
              <hr className="my-4" />
              <h5 className="mb-3">{t('Taxonomy')}</h5>

              <Row className="g-3">
                <Col md={6}>
                  <Form.Label className="fw-semibold">{t('Input from')}</Form.Label>
                  <Select
                    isMulti
                    placeholder={t('Select...')}
                    options={inputFromOptions}
                    value={inputFromOptions.filter((o) =>
                      (formData.inputFrom || []).includes(o.value)
                    )}
                    onChange={(opts) => handleMultiChange('inputFrom', opts as any)}
                  />
                </Col>
              </Row>

              <Row className="g-3 mt-1">
                <Col md={6}>
                  <Form.Group controlId="originalLanguage">
                    <Form.Label className="fw-semibold">{t('Original language')}</Form.Label>
                    <Form.Control
                      as="select"
                      value={formData.originalLanguage}
                      onChange={handleChange}
                    >
                      <option value="">{t('Select')}</option>
                      {originalLanguageOptions.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </Form.Control>
                  </Form.Group>
                </Col>

                <Col md={6}>
                  <Form.Group controlId="primaryDiagnosis">
                    <Form.Label className="fw-semibold">{t('Primary diagnosis')}</Form.Label>
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
                  </Form.Group>
                </Col>
              </Row>

              <Row className="g-3 mt-1">
                <Col md={6}>
                  <Form.Label className="fw-semibold">{t('Aims')}</Form.Label>
                  <Select
                    isMulti
                    placeholder={t('Select...')}
                    options={aimsOptions}
                    value={aimsOptions.filter((o) => (formData.aims || []).includes(o.value))}
                    onChange={(opts) => handleMultiChange('aims', opts as any)}
                  />
                </Col>

                <Col md={6}>
                  <Form.Label className="fw-semibold">{t('Topics')}</Form.Label>
                  <Select
                    isMulti
                    placeholder={t('Select...')}
                    options={topicsOptions}
                    value={topicsOptions.filter((o) => (formData.topics || []).includes(o.value))}
                    onChange={(opts) => handleMultiChange('topics', opts as any)}
                  />
                </Col>
              </Row>

              <Row className="g-3 mt-1">
                <Col md={4}>
                  <Form.Group controlId="cognitiveLevel">
                    <Form.Label className="fw-semibold">{t('Cognitive level')}</Form.Label>
                    <Form.Control
                      as="select"
                      value={formData.cognitiveLevel}
                      onChange={handleChange}
                    >
                      <option value="">{t('Select')}</option>
                      {cognitiveLevelOptions.map((x) => (
                        <option key={x} value={x}>
                          {t(x)}
                        </option>
                      ))}
                    </Form.Control>
                  </Form.Group>
                </Col>

                <Col md={4}>
                  <Form.Group controlId="physicalLevel">
                    <Form.Label className="fw-semibold">{t('Physical level')}</Form.Label>
                    <Form.Control
                      as="select"
                      value={formData.physicalLevel}
                      onChange={handleChange}
                    >
                      <option value="">{t('Select')}</option>
                      {physicalLevelOptions.map((x) => (
                        <option key={x} value={x}>
                          {t(x)}
                        </option>
                      ))}
                    </Form.Control>
                  </Form.Group>
                </Col>

                <Col md={4}>
                  <Form.Group controlId="durationBucket">
                    <Form.Label className="fw-semibold">{t('Duration bucket')}</Form.Label>
                    <Form.Control
                      as="select"
                      value={formData.durationBucket}
                      onChange={handleChange}
                    >
                      <option value="">{t('Select')}</option>
                      {durationBucketOptions.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </Form.Control>
                  </Form.Group>
                </Col>
              </Row>

              <Row className="g-3 mt-1">
                <Col md={4}>
                  <Form.Group controlId="sexSpecific">
                    <Form.Label className="fw-semibold">{t('Sex specific')}</Form.Label>
                    <Form.Control as="select" value={formData.sexSpecific} onChange={handleChange}>
                      <option value="">{t('Select')}</option>
                      {sexSpecificOptions.map((x) => (
                        <option key={x} value={x}>
                          {t(x)}
                        </option>
                      ))}
                    </Form.Control>
                  </Form.Group>
                </Col>
              </Row>

              <Row className="g-3 mt-1">
                <Col md={6}>
                  <Form.Label className="fw-semibold">{t('Where')}</Form.Label>
                  <Select
                    isMulti
                    placeholder={t('Select...')}
                    options={whereOptions}
                    value={whereOptions.filter((o) => (formData.where || []).includes(o.value))}
                    onChange={(opts) => handleMultiChange('where', opts as any)}
                  />
                </Col>

                <Col md={6}>
                  <Form.Label className="fw-semibold">{t('Setting')}</Form.Label>
                  <Select
                    isMulti
                    placeholder={t('Select...')}
                    options={settingOptions}
                    value={settingOptions.filter((o) => (formData.setting || []).includes(o.value))}
                    onChange={(opts) => handleMultiChange('setting', opts as any)}
                  />
                </Col>
              </Row>

              {/* ---------- media ---------- */}
              <hr className="my-4" />
              <div className="d-flex align-items-center justify-content-between mb-2">
                <h5 className="mb-0">{t('Media')}</h5>
                <Button variant="outline-primary" size="sm" onClick={addMediaRow}>
                  <FaPlus /> {t('Add media')}
                </Button>
              </div>

              {(formData.media || []).length === 0 && (
                <div className="text-muted mb-3">
                  {t('No media added yet. You can add links or upload files.')}
                </div>
              )}

              {(formData.media || []).map((m, idx) => {
                const baseKey = `media.${idx}`;
                return (
                  <div key={idx} className="border rounded p-3 mb-3">
                    <div className="d-flex justify-content-between align-items-start gap-2">
                      <div className="fw-semibold">
                        {t('Media item')} #{idx + 1}
                      </div>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => removeMediaRow(idx)}
                        aria-label={t('Remove media')}
                      >
                        <FaTrash />
                      </Button>
                    </div>

                    <Row className="g-3 mt-1">
                      <Col md={4}>
                        <Form.Group>
                          <Form.Label className="fw-semibold">{t('Kind')}</Form.Label>
                          <Form.Control
                            as="select"
                            value={m.kind}
                            onChange={(e) =>
                              updateMediaRow(idx, { kind: e.target.value as 'external' | 'file' })
                            }
                            isInvalid={!!fe(`${baseKey}.kind`)}
                          >
                            {kindOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {t(o.label)}
                              </option>
                            ))}
                          </Form.Control>
                        </Form.Group>
                      </Col>

                      <Col md={4}>
                        <Form.Group>
                          <Form.Label className="fw-semibold">{t('Media type')}</Form.Label>
                          <Form.Control
                            as="select"
                            value={m.media_type}
                            onChange={(e) =>
                              updateMediaRow(idx, { media_type: e.target.value as MediaType })
                            }
                            isInvalid={!!fe(`${baseKey}.media_type`)}
                          >
                            {mediaTypeOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {t(o.label)}
                              </option>
                            ))}
                          </Form.Control>
                        </Form.Group>
                      </Col>

                      <Col md={4}>
                        <Form.Group>
                          <Form.Label className="fw-semibold">
                            {t('Provider (optional)')}
                          </Form.Label>
                          <Form.Control
                            type="text"
                            value={m.provider || ''}
                            onChange={(e) => updateMediaRow(idx, { provider: e.target.value })}
                            placeholder="spotify / youtube / etc."
                          />
                        </Form.Group>
                      </Col>

                      <Col md={6}>
                        <Form.Group>
                          <Form.Label className="fw-semibold">{t('Title (optional)')}</Form.Label>
                          <Form.Control
                            type="text"
                            value={m.title || ''}
                            onChange={(e) => updateMediaRow(idx, { title: e.target.value })}
                          />
                        </Form.Group>
                      </Col>

                      <Col md={6}>
                        {m.kind === 'external' ? (
                          <Form.Group>
                            <Form.Label className="fw-semibold">{t('URL')}</Form.Label>
                            <Form.Control
                              type="text"
                              value={m.url || ''}
                              onChange={(e) => updateMediaRow(idx, { url: e.target.value })}
                              placeholder="https://..."
                              isInvalid={!!fe(`${baseKey}.url`)}
                            />
                            {fe(`${baseKey}.url`) && (
                              <div className="text-danger small mt-1">{fe(`${baseKey}.url`)}</div>
                            )}
                          </Form.Group>
                        ) : (
                          <Form.Group>
                            <Form.Label className="fw-semibold">{t('Upload file')}</Form.Label>
                            <Form.Control
                              type="file"
                              accept="image/*,video/*,audio/*,application/pdf"
                              onChange={handleMediaFileChange(idx)}
                              isInvalid={!!fe(`${baseKey}.file`)}
                            />
                            {fe(`${baseKey}.file`) && (
                              <div className="text-danger small mt-1">{fe(`${baseKey}.file`)}</div>
                            )}
                          </Form.Group>
                        )}
                      </Col>
                    </Row>
                  </div>
                );
              })}

              {/* ---------- privacy ---------- */}
              <hr className="my-4" />
              <Form.Group controlId="isPrivate" className="mb-3">
                <Form.Check
                  type="checkbox"
                  label={t(
                    'Make this a private intervention (only visible to the assigned patient)'
                  )}
                  checked={formData.isPrivate}
                  onChange={handleChange}
                />
              </Form.Group>

              {formData.isPrivate && (
                <Form.Group controlId="patientId" className="mb-3">
                  <Form.Label className="fw-semibold">{t('Assign to Patient')}</Form.Label>

                  {!patientsLoaded && privateCheckedOnce && (
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <div className="text-muted small">
                        {patientsLoading ? t('Loading patients...') : t('Patients not loaded yet')}
                      </div>
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        disabled={patientsLoading}
                        onClick={fetchTherapistPatients}
                      >
                        {t('Reload')}
                      </Button>
                    </div>
                  )}

                  <Form.Control
                    as="select"
                    value={formData.patientId}
                    onChange={handleChange}
                    isInvalid={!!fe('patientId')}
                    disabled={patientsLoading || !patientsLoaded}
                  >
                    <option value="">{t('Select a patient')}</option>
                    {therapistPatients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Form.Control>
                  <Form.Control.Feedback type="invalid">{fe('patientId')}</Form.Control.Feedback>
                </Form.Group>
              )}

            </fieldset>

            {!success && (
              <Button variant="primary" type="submit" className="mt-4 w-100" disabled={submitting}>
                {submitting ? (
                  <span className="d-inline-flex align-items-center gap-2">
                    <Spinner animation="border" size="sm" /> {t('Submitting...')}
                  </span>
                ) : (
                  t('Submit')
                )}
              </Button>
            )}

            {(error || patientsLoadError) && (
              <Alert variant="danger" className="mt-3 mb-0" role="alert" aria-live="assertive">
                <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
                  <span>{patientsLoadError || error}</span>
                  {Object.keys(errors).length > 0 && (
                    <Button
                      size="sm"
                      variant="outline-light"
                      onClick={() => setShowErrorDetails(!showErrorDetails)}
                      aria-expanded={showErrorDetails}
                    >
                      {showErrorDetails ? t('Hide details') : t('Show details')}
                    </Button>
                  )}
                </div>

                {showErrorDetails && Object.keys(errors).length > 0 && (
                  <div className="mt-3">
                    <ul className="mb-0">
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
          </Form>
        </div>
      </StandardModal>
    );
  }
);

export default AddInterventionPopup;
