// src/components/HomePage/AddInterventionPopup.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { Alert, Button, Col, Form, Modal, Row } from 'react-bootstrap';
import { FaPlus } from 'react-icons/fa';
import apiClient from '../../api/client';
import config from '../../config/config.json';
import axios from 'axios';
import Select from 'react-select';
import { t } from 'i18next';

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

// used to show per-row validation message
const patientTypeRowKey = (idx: number, field: keyof PatientType) => `patientTypes.${idx}.${field}`;

const AddInterventionPopup: React.FC<AddInterventionPopupProps> = ({
  show,
  handleClose,
  onSuccess,
}) => {
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

  // ✅ control fetching: only retrieve when checkbox is ON
  const [privateCheckedOnce, setPrivateCheckedOnce] = useState(false);

  const tagOptions = useMemo(
    () =>
      config.RecomendationInfo.tags.map((tag: string) => ({
        value: tag,
        label: t(tag.charAt(0).toUpperCase() + tag.slice(1)),
      })),
    []
  );

  const benefitOptions = useMemo(
    () =>
      config.RecomendationInfo.benefits.map((benefit: string) => ({
        value: benefit,
        label: t(benefit.charAt(0).toUpperCase() + benefit.slice(1)),
      })),
    []
  );

  const specializationKeys = Object.keys(config.patientInfo.function);

  const getDiagnosesForSpecialization = (specialization: string) =>
    config?.patientInfo?.function?.[specialization]?.diagnosis || [];

  // -------------------- FETCH PATIENTS (ONLY WHEN CHECKBOX ENABLED) --------------------
  const fetchTherapistPatients = async () => {
    if (patientsLoading) return;
    setPatientsLoading(true);
    setPatientsLoadError('');

    try {
      const therapistId = localStorage.getItem('id');
      if (!therapistId) {
        setPatientsLoadError(t('Missing therapist id.'));
        setTherapistPatients([]);
        setPatientsLoaded(false);
        return;
      }

      const { data } = await apiClient.get(`/therapists/${therapistId}/patients/`);

      // backend returns: { success: true, data: [...] }
      const arr = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

      const patientOptions = arr.map((p: any) => ({
        id: p._id, // ✅ use _id, not patient_code
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
  };

  useEffect(() => {
    // ✅ Only retrieve when using the checkbox (when it becomes true)
    if (!formData.isPrivate) return;

    setPrivateCheckedOnce(true);

    // fetch only once per open session, unless you want to force refresh
    if (!patientsLoaded && !patientsLoading) {
      fetchTherapistPatients();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.isPrivate]);

  // -------------------- RESET --------------------
  const resetForm = () => {
    setFormData(defaultFormData);
    setError('');
    setErrors({});
    setSuccess(false);
    setSubmitting(false);
    setShowErrorDetails(false);

    // reset fetch state per opening
    setTherapistPatients([]);
    setPatientsLoaded(false);
    setPatientsLoading(false);
    setPatientsLoadError('');
    setPrivateCheckedOnce(false);
  };

  const handleModalClose = () => {
    resetForm();
    handleClose();
  };

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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { id, value, type, checked } = e.target as HTMLInputElement;
    const val = type === 'checkbox' ? checked : value;

    setFormData((prev) => {
      const next: any = { ...prev, [id]: type === 'text' || type === 'textarea' ? cleanStr(val) : val };

      // if toggling from private -> public, clear patient selection
      if (id === 'isPrivate' && !checked) {
        next.patientId = '';
      }
      // if toggling from public -> private, reset patientTypes validation (optional)
      return next;
    });

    if (errors[id]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleFileChange =
    (field: 'mediaFile' | 'previewImage') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;

      if (field === 'previewImage' && file && !file.type.startsWith('image/')) {
        setErrors((prev) => ({
          ...prev,
          previewImage: t('Preview image must be an image file'),
        }));
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
    setFormData((prev) => ({
      ...prev,
      [field]: (selected || []).map((opt) => opt.value),
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

  // ✅ limit to 5 rows & require previous row complete
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
        // mark missing fields on last row
        if (!cleanStr(last.type)) next[patientTypeRowKey(pts.length - 1, 'type')] = t('Patient type is required');
        if (!cleanStr(last.diagnosis)) next[patientTypeRowKey(pts.length - 1, 'diagnosis')] = t('Diagnosis is required');
        if (!cleanStr(last.frequency)) next[patientTypeRowKey(pts.length - 1, 'frequency')] = t('Frequency is required');

        next.patientTypes = t('Please complete the current row before adding a new one.');
        return next;
      }

      // no error
      delete next.patientTypes;
      return next;
    });

    const pts = formData.patientTypes || [];
    if (pts.length >= 5) return;

    const last = pts[pts.length - 1];
    if (last && !isPatientTypeRowComplete(last)) return;

    setFormData((prev) => ({
      ...prev,
      patientTypes: [...prev.patientTypes, { ...defaultPatientType }],
    }));
  };

  /* ---------------- VALIDATION ---------------- */
  const validateForm = (): { valid: boolean; errors: ErrorMap } => {
    const e: ErrorMap = {};
    const f = formData;

    // clean main strings
    const title = cleanStr(f.title);
    const desc = cleanStr(f.description);
    const link = cleanStr(f.link);

    if (!title) e.title = t('Title is required');
    if (!desc) e.description = t('Description is required');

    if (!f.duration || Number(f.duration) <= 0) {
      e.duration = t('Duration must be greater than 0');
    }

    if (!f.contentType) e.contentType = t('Content type is required');
    if (!f.previewImage) e.previewImage = t('Preview image is required');

    if (link) {
      try {
        const url = new URL(link);
        if (!['http:', 'https:'].includes(url.protocol)) {
          e.link = t('Link must start with http:// or https://');
        }
      } catch (_) {
        e.link = t('Link must be a valid URL');
      }
    }

    if (f.isPrivate) {
      if (!cleanStr(f.patientId)) e.patientId = t('Please select a patient');
    } else {
      // ✅ only validate non-empty rows; don't send empty/partial rows later
      const cleaned = sanitizePatientTypes(f.patientTypes);

      if (cleaned.length === 0) {
        e.patientTypes = t('Please add at least one complete patient type recommendation.');
      }

      // also highlight first incomplete row (if any) to guide user
      f.patientTypes.forEach((pt, idx) => {
        const anyFilled = !!cleanStr(pt.type) || !!cleanStr(pt.diagnosis) || !!cleanStr(pt.frequency);
        const complete = isPatientTypeRowComplete(pt);

        if (anyFilled && !complete) {
          if (!cleanStr(pt.type)) e[patientTypeRowKey(idx, 'type')] = t('Patient type is required');
          if (!cleanStr(pt.diagnosis)) e[patientTypeRowKey(idx, 'diagnosis')] = t('Diagnosis is required');
          if (!cleanStr(pt.frequency)) e[patientTypeRowKey(idx, 'frequency')] = t('Frequency is required');
        }
      });

      // limit check
      if ((f.patientTypes || []).length > 5) {
        e.patientTypes = t('You can add up to 5 patient type recommendations only.');
      }
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

    if (Object.keys(fieldErrors).length > 0) {
      setShowErrorDetails(true);
    }

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

    const { valid, errors: found } = validateForm();
    if (!valid) {
      setErrors(found);
      setError(t('Please correct the highlighted fields.'));
      setShowErrorDetails(true);
      return;
    }

    try {
      setSubmitting(true);

      const payload = new FormData();

      payload.append('title', cleanStr(formData.title));
      payload.append('description', cleanStr(formData.description));
      payload.append('duration', String(formData.duration));
      payload.append('contentType', formData.contentType);
      payload.append('link', cleanStr(formData.link) || '');

      payload.append('tagList', JSON.stringify(formData.tagList));
      payload.append('benefitFor', JSON.stringify(formData.benefitFor));

      payload.append('isPrivate', String(formData.isPrivate));

      if (formData.isPrivate) {
        payload.append('patientId', cleanStr(formData.patientId));
      } else {
        // ✅ don't send empty/partial rows
        const cleanedPatientTypes = sanitizePatientTypes(formData.patientTypes).slice(0, 5);
        payload.append('patientTypes', JSON.stringify(cleanedPatientTypes));
      }

      if (formData.mediaFile) payload.append('media_file', formData.mediaFile);
      if (formData.previewImage) payload.append('img_file', formData.previewImage);

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
        return;
      }
      setError(t('An unexpected error occurred. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const fe = (key: string) => errors[key];

  return (
    <Modal show={show} onHide={handleModalClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>{t('Add New Intervention')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {(error || patientsLoadError) && (
          <Alert variant="danger" className="mb-3">
            <div className="d-flex justify-content-between align-items-center">
              <span>{patientsLoadError || error}</span>
              <Button size="sm" onClick={() => setShowErrorDetails(!showErrorDetails)}>
                {showErrorDetails ? t('Hide details') : t('Show details')}
              </Button>
            </div>

            {showErrorDetails && (
              <div className="mt-2">
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
          <Alert variant="success" className="mb-3">
            {t('Intervention successfully added')}
          </Alert>
        )}

        <Form onSubmit={handleSubmit} noValidate>
          <fieldset disabled={success || submitting}>
            {/* Title */}
            <Form.Group controlId="title">
              <Form.Label>{t('InterventionTitle')}</Form.Label>
              <Form.Control
                type="text"
                value={formData.title}
                onChange={handleChange}
                isInvalid={!!fe('title')}
                required
              />
              <Form.Control.Feedback type="invalid">{fe('title')}</Form.Control.Feedback>
            </Form.Group>

            {/* Description */}
            <Form.Group controlId="description" className="mt-3">
              <Form.Label>{t('Description')}</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={formData.description}
                onChange={handleChange}
                isInvalid={!!fe('description')}
              />
              <Form.Control.Feedback type="invalid">{fe('description')}</Form.Control.Feedback>
            </Form.Group>

            {/* Duration */}
            <Form.Group controlId="duration" className="mt-3">
              <Form.Label>{t('RecomendationDuration(min)')}</Form.Label>
              <Form.Control
                type="number"
                value={formData.duration}
                onChange={handleChange}
                isInvalid={!!fe('duration')}
              />
              <Form.Control.Feedback type="invalid">{fe('duration')}</Form.Control.Feedback>
            </Form.Group>

            {/* Tags */}
            <Form.Group className="mt-3">
              <Form.Label>{t('TagList')}</Form.Label>
              <Select
                isMulti
                options={tagOptions}
                value={tagOptions.filter((opt) => formData.tagList.includes(opt.value))}
                onChange={(opts) => handleMultiChange('tagList', opts as any)}
              />
            </Form.Group>

            {/* Benefit For */}
            <Form.Group className="mt-3">
              <Form.Label>{t('BenefitFor')}</Form.Label>
              <Select
                isMulti
                options={benefitOptions}
                value={benefitOptions.filter((opt) => formData.benefitFor.includes(opt.value))}
                onChange={(opts) => handleMultiChange('benefitFor', opts as any)}
              />
            </Form.Group>

            {/* Content Type */}
            <Form.Group className="mt-3" controlId="contentType">
              <Form.Label>{t('ContentType')}</Form.Label>
              <Form.Control
                as="select"
                value={formData.contentType}
                onChange={handleChange}
                isInvalid={!!fe('contentType')}
              >
                <option value="">{t('SelectContentType')}</option>
                {config.RecomendationInfo.types.map((type: string) => (
                  <option key={type} value={type}>
                    {t(type)}
                  </option>
                ))}
              </Form.Control>
              <Form.Control.Feedback type="invalid">{fe('contentType')}</Form.Control.Feedback>
            </Form.Group>

            {/* Link */}
            <Form.Group controlId="link" className="mt-3">
              <Form.Label>{t('Link(Optional)')}</Form.Label>
              <Form.Control
                type="text"
                value={formData.link}
                onChange={handleChange}
                isInvalid={!!fe('link')}
              />
              <Form.Control.Feedback type="invalid">{fe('link')}</Form.Control.Feedback>
            </Form.Group>

            {/* Media File */}
            <Form.Group controlId="mediaFile" className="mt-3">
              <Form.Label>{t('UploadFile(Optional)')}</Form.Label>
              <Form.Control
                type="file"
                accept="image/*,video/*,audio/*,application/pdf"
                onChange={handleFileChange('mediaFile')}
              />
            </Form.Group>

            {/* Preview Image */}
            <Form.Group controlId="previewImage" className="mt-3">
              <Form.Label>{t('UploadaPreviewImage')}</Form.Label>
              <Form.Control
                type="file"
                accept="image/*"
                onChange={handleFileChange('previewImage')}
                isInvalid={!!fe('previewImage')}
                required
              />
              <Form.Control.Feedback type="invalid">{fe('previewImage')}</Form.Control.Feedback>
            </Form.Group>

            {/* Private toggle */}
            <Form.Group controlId="isPrivate" className="mt-4">
              <Form.Check
                type="checkbox"
                label={t('Make this a private intervention (only visible to the assigned patient)')}
                checked={formData.isPrivate}
                onChange={handleChange}
              />
            </Form.Group>

            {/* Assign Patient (Private) */}
            {formData.isPrivate && (
              <Form.Group controlId="patientId" className="mt-3">
                <Form.Label>{t('Assign to Patient')}</Form.Label>

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

            {/* Public Patient Types */}
            {!formData.isPrivate && (
              <>
                <h5 className="mt-4">{t('PatientTypeandFrequency')}</h5>

                {fe('patientTypes') && (
                  <Alert variant="warning" className="py-2">
                    {fe('patientTypes')}
                  </Alert>
                )}

                {formData.patientTypes.map((pt, idx) => (
                  <Row key={idx} className="mb-3">
                    {/* Type */}
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label>{t('PatientType')}</Form.Label>
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
                        <Form.Control.Feedback type="invalid">
                          {fe(patientTypeRowKey(idx, 'type'))}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>

                    {/* Diagnosis */}
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label>{t('Diagnosis')}</Form.Label>
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
                        <Form.Control.Feedback type="invalid">
                          {fe(patientTypeRowKey(idx, 'diagnosis'))}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>

                    {/* Frequency */}
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label>{t('RecomendationFrequency')}</Form.Label>
                        <Form.Control
                          as="select"
                          value={pt.frequency}
                          onChange={(e) => handlePatientTypeChange(idx, 'frequency', e.target.value)}
                          isInvalid={!!fe(patientTypeRowKey(idx, 'frequency'))}
                        >
                          <option value="">{t('SelectFrequency')}</option>
                          {config.RecomendationInfo.frequency.map((f: string) => (
                            <option key={f} value={f}>
                              {t(f)}
                            </option>
                          ))}
                        </Form.Control>
                        <Form.Control.Feedback type="invalid">
                          {fe(patientTypeRowKey(idx, 'frequency'))}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                  </Row>
                ))}

                <div className="d-flex align-items-center justify-content-between">
                  <Button variant="link" onClick={addPatientType} disabled={formData.patientTypes.length >= 5}>
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
            <Button variant="primary" type="submit" className="mt-4 w-100">
              {submitting ? t('Submitting...') : t('Submit')}
            </Button>
          )}
        </Form>
      </Modal.Body>
    </Modal>
  );
};

export default AddInterventionPopup;
