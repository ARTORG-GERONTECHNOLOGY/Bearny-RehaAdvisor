// src/components/HomePage/AddInterventionPopup.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Alert, Button, Col, Form, Row, Spinner } from 'react-bootstrap';
import { FaPlus } from 'react-icons/fa';
import axios from 'axios';
import Select from 'react-select';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import apiClient from '../../api/client';
import config from '../../config/config.json';
import authStore from '../../stores/authStore';
import StandardModal from '../common/StandardModal';

interface AddInterventionPopupProps {
  show: boolean;
  handleClose: () => void;
  onSuccess: () => void;
}

type PatientType = {
  type: string;
  frequency: string;
  includeOption: any;
  diagnosis: string;
  diagnosesOptions: string[];
};

const defaultPatientType: PatientType = {
  type: '',
  frequency: '',
  includeOption: null,
  diagnosis: '',
  diagnosesOptions: [],
};

const defaultFormData = {
  title: '',
  description: '',
  duration: 0,
  contentType: '',
  link: '',
  benefitFor: [] as string[],
  isPrivate: false,
  tagList: [] as string[],
  mediaFile: null as File | null,
  previewImage: null as File | null,
  patientId: '',
  patientTypes: [defaultPatientType] as PatientType[],
};

type ErrorMap = Record<string, string>;

// -------------------- HELPERS --------------------
const cleanStr = (v: any) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v);

const isPatientTypeRowComplete = (pt: PatientType) => !!cleanStr(pt.type) && !!cleanStr(pt.diagnosis) && !!cleanStr(pt.frequency);

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

const isDirtyForm = (f: typeof defaultFormData) => {
  if (cleanStr(f.title)) return true;
  if (cleanStr(f.description)) return true;
  if (Number(f.duration) > 0) return true;
  if (cleanStr(f.contentType)) return true;
  if (cleanStr(f.link)) return true;

  if (Array.isArray(f.benefitFor) && f.benefitFor.length) return true;
  if (Array.isArray(f.tagList) && f.tagList.length) return true;

  if (f.mediaFile) return true;
  if (f.previewImage) return true;

  if (f.isPrivate) {
    if (cleanStr(f.patientId)) return true;
  } else {
    if ((f.patientTypes || []).some((pt) => !!cleanStr(pt.type) || !!cleanStr(pt.diagnosis) || !!cleanStr(pt.frequency))) {
      return true;
    }
  }
  return false;
};

const isValidUrlHttp = (raw: string) => {
  if (!raw) return true;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const uniqueStrings = (arr: string[]) => Array.from(new Set((arr || []).filter(Boolean)));

const AddInterventionPopup: React.FC<AddInterventionPopupProps> = observer(({ show, handleClose, onSuccess }) => {
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

  // control fetching: only retrieve when checkbox is ON
  const [privateCheckedOnce, setPrivateCheckedOnce] = useState(false);

  const tagOptions = useMemo(
    () =>
      (config.RecomendationInfo.tags || []).map((tag: string) => ({
        value: tag,
        label: t(tag.charAt(0).toUpperCase() + tag.slice(1)),
      })),
    [t]
  );

  const benefitOptions = useMemo(
    () =>
      (config.RecomendationInfo.benefits || []).map((benefit: string) => ({
        value: benefit,
        label: t(benefit.charAt(0).toUpperCase() + benefit.slice(1)),
      })),
    [t]
  );

  const specializationKeys = Object.keys(config.patientInfo.function || {});

  const getDiagnosesForSpecialization = (specialization: string) =>
    config?.patientInfo?.function?.[specialization]?.diagnosis || [];

  // -------------------- FETCH PATIENTS (MOBX therapist id) --------------------
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
        name: `${p.first_name || ''} ${p.name || ''}`.trim() || p._id,
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

    if (!patientsLoaded && !patientsLoading) {
      fetchTherapistPatients();
    }
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

    const dirty = isDirtyForm(formData);
    const msg = dirty
      ? t('Are you sure you want to close? Unsaved data will be lost.')
      : t('Close this window?');

    if (dirty && !window.confirm(msg)) return;

    resetForm();
    handleClose();
  }, [formData, handleClose, resetForm, submitting, t]);

  // -------------------- FIELD HANDLERS --------------------
  const handlePatientTypeChange = (index: number, field: keyof PatientType, value: string | boolean) => {
    const updated = [...formData.patientTypes];
    // @ts-ignore
    updated[index][field] = typeof value === 'string' ? value : value;

    if (field === 'type') {
      updated[index].diagnosesOptions = getDiagnosesForSpecialization(value as string);
      updated[index].diagnosis = '';
    }

    setFormData((prev) => ({ ...prev, patientTypes: updated }));

    const key = patientTypeRowKey(index, field);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { id, value, type, checked } = e.target as HTMLInputElement;
    const val = type === 'checkbox' ? checked : value;

    setFormData((prev) => {
      const next: any = { ...prev, [id]: type === 'text' || type === 'textarea' ? cleanStr(val) : val };
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

  const handleFileChange =
    (field: 'mediaFile' | 'previewImage') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;

      if (file) {
        const maxBytes = 50 * 1024 * 1024;
        if (file.size > maxBytes) {
          setErrors((prev) => ({ ...prev, [field]: t('File is too large (max 50MB).') }));
          return;
        }
      }

      if (field === 'previewImage' && file && !file.type.startsWith('image/')) {
        setErrors((prev) => ({ ...prev, previewImage: t('Preview image must be an image file') }));
        return;
      }

      setFormData((prev) => ({ ...prev, [field]: file }));

      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    };

  const handleMultiChange = (field: keyof typeof formData, selected: any[]) => {
    setFormData((prev) => ({ ...prev, [field]: uniqueStrings((selected || []).map((opt) => opt.value)) }));

    const key = field as string;
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const addPatientType = () => {
    setErrors((prev) => {
      const next = { ...prev };

      const pts = formData.patientTypes || [];
      if (pts.length >= 5) {
        next.patientTypes = t('You can add up to 5 patient type recommendations only.');
        return next;
      }

      const last = pts[pts.length - 1];
      if (last && !isPatientTypeRowComplete(last)) {
        if (!cleanStr(last.type)) next[patientTypeRowKey(pts.length - 1, 'type')] = t('Patient type is required');
        if (!cleanStr(last.diagnosis)) next[patientTypeRowKey(pts.length - 1, 'diagnosis')] = t('Diagnosis is required');
        if (!cleanStr(last.frequency)) next[patientTypeRowKey(pts.length - 1, 'frequency')] = t('Frequency is required');

        next.patientTypes = t('Please complete the current row before adding a new one.');
        return next;
      }

      delete next.patientTypes;
      return next;
    });

    const pts = formData.patientTypes || [];
    if (pts.length >= 5) return;
    const last = pts[pts.length - 1];
    if (last && !isPatientTypeRowComplete(last)) return;

    setFormData((prev) => ({ ...prev, patientTypes: [...prev.patientTypes, { ...defaultPatientType }] }));
  };

  /* ---------------- VALIDATION ---------------- */
  const validateForm = (): { valid: boolean; errors: ErrorMap } => {
    const e: ErrorMap = {};
    const f = formData;

    const title = cleanStr(f.title);
    const desc = cleanStr(f.description);
    const link = cleanStr(f.link);

    if (!title) e.title = t('Title is required');
    if (!desc) e.description = t('Description is required');

    if (title && String(title).length > 120) e.title = t('Title is too long (max 120 characters).');
    if (desc && String(desc).length > 4000) e.description = t('Description is too long (max 4000 characters).');

    const dur = Number(f.duration);
    if (!dur || Number.isNaN(dur) || dur <= 0) e.duration = t('Duration must be greater than 0');
    if (dur > 600) e.duration = t('Duration seems too high (max 600 minutes).');

    if (!f.contentType) e.contentType = t('Content type is required');
    if (!f.previewImage) e.previewImage = t('Preview image is required');

    if (link && !isValidUrlHttp(link)) {
      e.link = t('Link must be a valid URL starting with http:// or https://');
    }
    if (cleanStr(f.contentType) === 'Link' && !link) {
      e.link = t('Link is required when Content Type is Link.');
    }

    if (f.isPrivate) {
      if (!cleanStr(f.patientId)) e.patientId = t('Please select a patient');
    } else {
      const cleaned = sanitizePatientTypes(f.patientTypes);
      if (cleaned.length === 0) e.patientTypes = t('Please add at least one complete patient type recommendation.');

      f.patientTypes.forEach((pt, idx) => {
        const anyFilled = !!cleanStr(pt.type) || !!cleanStr(pt.diagnosis) || !!cleanStr(pt.frequency);
        const complete = isPatientTypeRowComplete(pt);

        if (anyFilled && !complete) {
          if (!cleanStr(pt.type)) e[patientTypeRowKey(idx, 'type')] = t('Patient type is required');
          if (!cleanStr(pt.diagnosis)) e[patientTypeRowKey(idx, 'diagnosis')] = t('Diagnosis is required');
          if (!cleanStr(pt.frequency)) e[patientTypeRowKey(idx, 'frequency')] = t('Frequency is required');
        }
      });

      if ((f.patientTypes || []).length > 5) e.patientTypes = t('You can add up to 5 patient type recommendations only.');
    }

    if (f.previewImage && !f.previewImage.type.startsWith('image/')) {
      e.previewImage = t('Preview image must be an image file');
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
      Array.isArray(data?.non_field_errors) && data.non_field_errors.length ? data.non_field_errors.join(' ') : '';

    setError(nonField || data?.message || data?.error || t('There are validation errors. Please check the details below.'));
  };

  /* ---------------- SUBMIT ---------------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const cleanedForCheck = {
      ...formData,
      title: cleanStr(formData.title),
      description: cleanStr(formData.description),
      link: cleanStr(formData.link),
      tagList: uniqueStrings(formData.tagList || []),
      benefitFor: uniqueStrings(formData.benefitFor || []),
      patientId: cleanStr(formData.patientId),
      patientTypes: (formData.patientTypes || []).map((pt) => ({
        ...pt,
        type: cleanStr(pt.type),
        diagnosis: cleanStr(pt.diagnosis),
        frequency: cleanStr(pt.frequency),
      })),
    };

    setFormData(cleanedForCheck);

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
      payload.append('title', cleanStr(cleanedForCheck.title));
      payload.append('description', cleanStr(cleanedForCheck.description));
      payload.append('duration', String(cleanedForCheck.duration));
      payload.append('contentType', cleanedForCheck.contentType);
      payload.append('link', cleanStr(cleanedForCheck.link) || '');

      payload.append('tagList', JSON.stringify(uniqueStrings(cleanedForCheck.tagList)));
      payload.append('benefitFor', JSON.stringify(uniqueStrings(cleanedForCheck.benefitFor)));

      payload.append('isPrivate', String(cleanedForCheck.isPrivate));

      if (cleanedForCheck.isPrivate) {
        payload.append('patientId', cleanStr(cleanedForCheck.patientId));
      } else {
        const cleanedPatientTypes = sanitizePatientTypes(cleanedForCheck.patientTypes).slice(0, 5);
        payload.append('patientTypes', JSON.stringify(cleanedPatientTypes));
      }

      if (cleanedForCheck.mediaFile) payload.append('media_file', cleanedForCheck.mediaFile);
      if (cleanedForCheck.previewImage) payload.append('img_file', cleanedForCheck.previewImage);

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
      if (axios.isAxiosError(err)) {
        applyBackendErrors(err.response?.data);
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
      <div className="w-100 d-flex justify-content-between align-items-center">
        <Button variant="outline-secondary" onClick={confirmClose} disabled={submitting}>
          {t('Close')}
        </Button>
        {!success && <div className="text-muted small">{t('Please review all fields before submitting.')}</div>}
      </div>
    ),
    [confirmClose, submitting, success, t]
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
        {(error || patientsLoadError) && (
          <Alert variant="danger" className="mb-4" role="alert" aria-live="assertive">
            <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
              <span>{patientsLoadError || error}</span>
              <Button
                size="sm"
                variant="outline-light"
                onClick={() => setShowErrorDetails(!showErrorDetails)}
                aria-expanded={showErrorDetails}
              >
                {showErrorDetails ? t('Hide details') : t('Show details')}
              </Button>
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
          <Alert variant="success" className="mb-4" role="status" aria-live="polite">
            {t('Intervention successfully added')}
          </Alert>
        )}

        <Form onSubmit={handleSubmit} noValidate>
          <fieldset disabled={success || submitting}>
            <Form.Group controlId="title" className="mb-3">
              <Form.Label className="fw-semibold">{t('InterventionTitle')}</Form.Label>
              <Form.Control type="text" value={formData.title} onChange={handleChange} isInvalid={!!fe('title')} required />
              <Form.Control.Feedback type="invalid">{fe('title')}</Form.Control.Feedback>
            </Form.Group>

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

            <Form.Group controlId="duration" className="mb-3">
              <Form.Label className="fw-semibold">{t('RecomendationDuration(min)')}</Form.Label>
              <Form.Control type="number" value={formData.duration} onChange={handleChange} isInvalid={!!fe('duration')} />
              <Form.Control.Feedback type="invalid">{fe('duration')}</Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">{t('TagList')}</Form.Label>
              <Select
                isMulti
                options={tagOptions}
                value={tagOptions.filter((opt) => formData.tagList.includes(opt.value))}
                onChange={(opts) => handleMultiChange('tagList', opts as any)}
              />
              {fe('tagList') && <div className="text-danger small mt-1">{fe('tagList')}</div>}
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">{t('BenefitFor')}</Form.Label>
              <Select
                isMulti
                options={benefitOptions}
                value={benefitOptions.filter((opt) => formData.benefitFor.includes(opt.value))}
                onChange={(opts) => handleMultiChange('benefitFor', opts as any)}
              />
              {fe('benefitFor') && <div className="text-danger small mt-1">{fe('benefitFor')}</div>}
            </Form.Group>

            <Form.Group className="mb-3" controlId="contentType">
              <Form.Label className="fw-semibold">{t('ContentType')}</Form.Label>
              <Form.Control as="select" value={formData.contentType} onChange={handleChange} isInvalid={!!fe('contentType')}>
                <option value="">{t('SelectContentType')}</option>
                {(config.RecomendationInfo.types || []).map((type: string) => (
                  <option key={type} value={type}>
                    {t(type)}
                  </option>
                ))}
              </Form.Control>
              <Form.Control.Feedback type="invalid">{fe('contentType')}</Form.Control.Feedback>
            </Form.Group>

            <Form.Group controlId="link" className="mb-3">
              <Form.Label className="fw-semibold">{t('Link(Optional)')}</Form.Label>
              <Form.Control
                type="text"
                value={formData.link}
                onChange={handleChange}
                isInvalid={!!fe('link')}
                placeholder="https://..."
              />
              <Form.Control.Feedback type="invalid">{fe('link')}</Form.Control.Feedback>
            </Form.Group>

            <Form.Group controlId="mediaFile" className="mb-3">
              <Form.Label className="fw-semibold">{t('UploadFile(Optional)')}</Form.Label>
              <Form.Control
                type="file"
                accept="image/*,video/*,audio/*,application/pdf"
                onChange={handleFileChange('mediaFile')}
                isInvalid={!!fe('mediaFile')}
              />
              {fe('mediaFile') && <div className="text-danger small mt-1">{fe('mediaFile')}</div>}
            </Form.Group>

            <Form.Group controlId="previewImage" className="mb-3">
              <Form.Label className="fw-semibold">{t('UploadaPreviewImage')}</Form.Label>
              <Form.Control
                type="file"
                accept="image/*"
                onChange={handleFileChange('previewImage')}
                isInvalid={!!fe('previewImage')}
                required
              />
              <Form.Control.Feedback type="invalid">{fe('previewImage')}</Form.Control.Feedback>
            </Form.Group>

            <hr className="my-4" />

            <Form.Group controlId="isPrivate" className="mb-3">
              <Form.Check
                type="checkbox"
                label={t('Make this a private intervention (only visible to the assigned patient)')}
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
                    <Button size="sm" variant="outline-secondary" disabled={patientsLoading} onClick={fetchTherapistPatients}>
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

            {!formData.isPrivate && (
              <>
                <h5 className="mt-4 mb-3">{t('PatientTypeandFrequency')}</h5>

                {fe('patientTypes') && <Alert variant="warning" className="py-2 mb-3">{fe('patientTypes')}</Alert>}

                {formData.patientTypes.map((pt, idx) => (
                  <Row key={idx} className="g-3 mb-3">
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="fw-semibold">{t('PatientType')}</Form.Label>
                        <Form.Control
                          as="select"
                          value={pt.type}
                          onChange={(e) => handlePatientTypeChange(idx, 'type', e.target.value)}
                          isInvalid={!!fe(patientTypeRowKey(idx, 'type'))}
                        >
                          <option value="">{t('SelectType')}</option>
                          {specializationKeys.map((spec) => (
                            <option key={spec} value={spec}>
                              {t(spec)}
                            </option>
                          ))}
                        </Form.Control>
                        <Form.Control.Feedback type="invalid">{fe(patientTypeRowKey(idx, 'type'))}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>

                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="fw-semibold">{t('Diagnosis')}</Form.Label>
                        <Form.Control
                          as="select"
                          value={pt.diagnosis}
                          onChange={(e) => handlePatientTypeChange(idx, 'diagnosis', e.target.value)}
                          isInvalid={!!fe(patientTypeRowKey(idx, 'diagnosis'))}
                          disabled={!pt.type}
                        >
                          <option value="">{t('SelectDiagnosis')}</option>
                          {(pt.diagnosesOptions || []).map((d) => (
                            <option key={d} value={d}>
                              {t(d)}
                            </option>
                          ))}
                          <option value="All">{t('All')}</option>
                        </Form.Control>
                        <Form.Control.Feedback type="invalid">{fe(patientTypeRowKey(idx, 'diagnosis'))}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>

                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="fw-semibold">{t('RecomendationFrequency')}</Form.Label>
                        <Form.Control
                          as="select"
                          value={pt.frequency}
                          onChange={(e) => handlePatientTypeChange(idx, 'frequency', e.target.value)}
                          isInvalid={!!fe(patientTypeRowKey(idx, 'frequency'))}
                        >
                          <option value="">{t('SelectFrequency')}</option>
                          {(config.RecomendationInfo.frequency || []).map((f: string) => (
                            <option key={f} value={f}>
                              {t(f)}
                            </option>
                          ))}
                        </Form.Control>
                        <Form.Control.Feedback type="invalid">{fe(patientTypeRowKey(idx, 'frequency'))}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                  </Row>
                ))}

                <div className="d-flex align-items-center justify-content-between mt-2">
                  <Button variant="link" onClick={addPatientType} disabled={formData.patientTypes.length >= 5} className="px-0">
                    <FaPlus /> {t('AddAnotherPatientType')}
                  </Button>
                  <div className="text-muted small">
                    {t('Max')}: 5
                  </div>
                </div>
              </>
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
        </Form>
      </div>
    </StandardModal>
  );
});

export default AddInterventionPopup;
