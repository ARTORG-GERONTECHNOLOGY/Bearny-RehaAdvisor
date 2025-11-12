// src/components/HomePage/AddInterventionPopup.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Alert, Button, Col, Form, Modal, Row } from 'react-bootstrap';
import { FaPlus } from 'react-icons/fa';
import apiClient from '../../api/client';
import config from '../../config/config.json';
import axios from 'axios';
import Select from 'react-select';
import InfoBubble from '../common/InfoBubble';
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
  contentType: 'Article',
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

  const getDiagnosesForSpecialization = (specialization: string) => {
    return config?.patientInfo?.function?.[specialization]?.diagnosis || [];
  };

  useEffect(() => {
    const fetchTherapistPatients = async () => {
      try {
        const therapistId = localStorage.getItem('id');
        const { data } = await apiClient.get(`/therapists/${therapistId}/patients/`);
        const patientOptions = data.map((p: any) => ({
          id: p._id,
          name: `${p.first_name || ''} ${p.name || ''}`.trim(),
        }));
        setTherapistPatients(patientOptions);
      } catch (err) {
        console.error('Failed to fetch patients:', err);
      }
    };

    if (formData.isPrivate) {
      fetchTherapistPatients();
    }
  }, [formData.isPrivate]);

  const resetForm = () => {
    setFormData(defaultFormData);
    setError('');
    setErrors({});
    setSuccess(false);
    setSubmitting(false);
  };

  const handlePatientTypeChange = (index: number, field: keyof PatientType, value: string | boolean) => {
    const updated = [...formData.patientTypes];
    // @ts-ignore
    updated[index][field] = value;

    if (field === 'type') {
      updated[index].diagnosesOptions = getDiagnosesForSpecialization(value as string);
      updated[index].diagnosis = '';
    }

    setFormData((prev) => ({ ...prev, patientTypes: updated }));
    // clear any prior error on that field
    const key = `patientTypes.${index}.${field}`;
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { id, value, type, checked } = e.target as HTMLInputElement;
    const val = type === 'checkbox' ? checked : value;
    setFormData((prev) => ({ ...prev, [id]: val }));
    if (errors[id]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleFileChange = (field: 'mediaFile' | 'previewImage') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
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

  const handleMultiChange = (field: keyof typeof formData, selectedOptions: any[]) => {
    setFormData((prev) => ({
      ...prev,
      [field]: (selectedOptions || []).map((opt: any) => opt.value),
    }));
    if (errors[field as string]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as string];
        return next;
      });
    }
  };

  const addPatientType = () => {
    setFormData((prev) => ({
      ...prev,
      patientTypes: [...prev.patientTypes, { ...defaultPatientType }],
    }));
  };

  // ---------- Validation ----------
  const validateForm = (): { valid: boolean; errors: ErrorMap } => {
    const e: ErrorMap = {};
    const f = formData;

    if (!f.title.trim()) e.title = t('Title is required');
    if (!f.description.trim()) e.description = t('Description is required');
    if (f.duration === null || f.duration === undefined || Number.isNaN(Number(f.duration))) {
      e.duration = t('Duration is required');
    } else if (Number(f.duration) <= 0) {
      e.duration = t('Duration must be greater than 0');
    }
    if (!f.contentType) e.contentType = t('Content type is required');
    if (!f.previewImage) {
      e.previewImage = t('Preview image is required');
    }

    if (f.isPrivate) {
      if (!f.patientId) e.patientId = t('Please select a patient for a private intervention');
    } else {
      if (!f.patientTypes.length) {
        e['patientTypes'] = t('Add at least one patient type');
      } else {
        f.patientTypes.forEach((pt, idx) => {
          if (!pt.type) e[`patientTypes.${idx}.type`] = t('Patient type is required');
          if (!pt.diagnosis) e[`patientTypes.${idx}.diagnosis`] = t('Diagnosis (or All) is required');
          if (!pt.frequency) e[`patientTypes.${idx}.frequency`] = t('Frequency is required');
        });
      }
    }

    const MAX_FILE_MB = 500;
    const MAX_IMG_MB = 20;
    if (f.mediaFile && f.mediaFile.size > MAX_FILE_MB * 1024 * 1024) {
      e.mediaFile = t('Uploaded file is too large');
    }
    if (f.previewImage && f.previewImage.size > MAX_IMG_MB * 1024 * 1024) {
      e.previewImage = t('Preview image file is too large');
    }

    return { valid: Object.keys(e).length === 0, errors: e };
  };

  const humanizeField = (key: string) => {
    if (key.startsWith('patientTypes.')) {
      const [, idx, field] = key.split('.');
      const labelMap: Record<string, string> = {
        type: t('Patient Type'),
        diagnosis: t('Diagnosis'),
        frequency: t('Frequency'),
      };
      return `${t('Patient Type')} #${Number(idx) + 1} – ${labelMap[field] || field}`;
    }
    const map: Record<string, string> = {
      title: t('Title'),
      description: t('Description'),
      duration: t('Duration'),
      contentType: t('Content Type'),
      patientId: t('Patient'),
      mediaFile: t('Upload File'),
      previewImage: t('Preview Image'),
      link: t('Link'),
      patientTypes: t('Patient Types'),
    };
    return map[key] || key;
  };

  const applyBackendErrors = (data: any) => {
    // Expect shape from backend: { message?, error?, field_errors?, non_field_errors? }
    const fieldErrors: ErrorMap = {};
    if (data?.field_errors && typeof data.field_errors === 'object') {
      Object.entries(data.field_errors).forEach(([k, v]) => {
        const first = Array.isArray(v) ? v[0] : v;
        fieldErrors[String(k)] = String(first);
      });
    }
    setErrors(fieldErrors);

    const nf = (data?.non_field_errors || []) as string[];
    const msg = data?.message || data?.error;
    if (nf.length || msg) {
      const summary =
        (nf && nf.join(' ')) ||
        (typeof msg === 'string' ? msg : t('Error adding recommendation'));
      setError(summary);
    } else if (Object.keys(fieldErrors).length) {
      const summary = Object.keys(fieldErrors)
        .map((k) => humanizeField(k))
        .join(', ');
      setError(t('Please correct the following fields before submitting: ') + summary);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setError('');
    setSuccess(false);
    setErrors({});

    const { valid, errors: found } = validateForm();
    if (!valid) {
      setErrors(found);
      const summary = Object.keys(found)
        .map((k) => humanizeField(k))
        .join(', ');
      setError(t('Please correct the following fields before submitting: ') + summary);
      return;
    }

    try {
      setSubmitting(true);

      const payload = new FormData();
      payload.append('title', formData.title);
      payload.append('description', formData.description);
      payload.append('duration', String(formData.duration));
      payload.append('contentType', formData.contentType);
      if (formData.link) payload.append('link', formData.link);
      if (formData.mediaFile) payload.append('media_file', formData.mediaFile);
      if (formData.previewImage) payload.append('img_file', formData.previewImage);
      payload.append('tagList', JSON.stringify(formData.tagList));
      payload.append('benefitFor', JSON.stringify(formData.benefitFor));
      payload.append('isPrivate', String(formData.isPrivate));
      if (formData.isPrivate && formData.patientId) {
        payload.append('patientId', formData.patientId);
      }
      payload.append('patientTypes', JSON.stringify(formData.patientTypes));

      const res = await apiClient.post('interventions/add/', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.status === 201) {
        setSuccess(true);              // show success alert
        setSubmitting(false);          // just in case
        onSuccess();                   // refresh list
        // DO NOT reset form here; keep success visible and submit hidden
      } else {
        applyBackendErrors(res.data);
        setSubmitting(false);
      }
    } catch (err) {
      setSubmitting(false);
      if (axios.isAxiosError(err) && err.response) {
        applyBackendErrors(err.response.data);
      } else {
        setError(t('An unexpected error occurred'));
      }
    }
  };

  const handleModalClose = () => {
    // Now clear everything when user dismisses the dialog
    resetForm();
    handleClose();
  };

  // Helper: get field error
  const fe = (key: string) => errors[key];

  return (
    <Modal show={show} onHide={handleModalClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>{t('Add New Intervention')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="mb-3">{error}</Alert>}
        {success && <Alert variant="success" className="mb-3">{t('Intervention successfully added')}</Alert>}

        <Form onSubmit={handleSubmit} noValidate>
          {/* Disable the whole form after success */}
          <fieldset disabled={success || submitting}>
            {/* Title */}
            <Form.Group controlId="title">
              <Form.Label>{t('InterventionTitle')}</Form.Label>
              <Form.Control
                type="text"
                placeholder={t('Enterrecommendationtitle')}
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
                placeholder={t('Enterdescription')}
                value={formData.description}
                onChange={handleChange}
                isInvalid={!!fe('description')}
                required
              />
              <Form.Control.Feedback type="invalid">{fe('description')}</Form.Control.Feedback>
            </Form.Group>

            {/* Duration */}
            <Form.Group controlId="duration" className="mt-3">
              <Form.Label>{t('RecomendationDuration(min)')}</Form.Label>
              <InfoBubble tooltip={t('Putthedurationofthethattheinterventionshouldlasthereaproximatelyinminutes')} />
              <Form.Control
                type="number"
                value={formData.duration}
                onChange={handleChange}
                placeholder={t('Enterrecommendationduartioninminutes')}
                isInvalid={!!fe('duration')}
                required
              />
              <Form.Control.Feedback type="invalid">{fe('duration')}</Form.Control.Feedback>
            </Form.Group>

            {/* Tags */}
            <Form.Group controlId="tagList" className="mt-3">
              <Form.Label>{t('TagList')}</Form.Label>
              <InfoBubble tooltip={t('Selectmultipletagstocategorizetherecommendation')} />
              <Select
                isMulti
                options={tagOptions}
                value={tagOptions.filter((opt) => formData.tagList.includes(opt.value))}
                onChange={(opts) => handleMultiChange('tagList', opts as any)}
              />
            </Form.Group>

            {/* Benefit For */}
            <Form.Group controlId="benefitFor" className="mt-3">
              <Form.Label>{t('BenefitFor')}</Form.Label>
              <Select
                isMulti
                options={benefitOptions}
                value={benefitOptions.filter((opt) => formData.benefitFor.includes(opt.value))}
                onChange={(opts) => handleMultiChange('benefitFor', opts as any)}
              />
            </Form.Group>

            {/* Content Type */}
            <Form.Group controlId="contentType" className="mt-3">
              <Form.Label>{t('ContentType')}</Form.Label>
              <Form.Control
                as="select"
                value={formData.contentType}
                onChange={handleChange}
                isInvalid={!!fe('contentType')}
                required
              >
                <option value="">{t('SelectContentType')}</option>
                {config.RecomendationInfo.types.map((type: string) => (
                  <option key={type} value={type}>
                    {t(type.charAt(0).toUpperCase() + type.slice(1))}
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
                placeholder={t('Enterlink')}
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
                isInvalid={!!fe('mediaFile')}
              />
              <Form.Control.Feedback type="invalid">{fe('mediaFile')}</Form.Control.Feedback>
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

            {/* Is Private */}
            <Form.Group controlId="isPrivate" className="mt-3">
              <Form.Check
                type="checkbox"
                label={t('Make this a private intervention (only visible to the assigned patient)')}
                checked={formData.isPrivate}
                onChange={handleChange}
              />
              <small className="text-muted">
                {t('Private interventions can include patient videos and will not be accessible or assignable to others.')}
              </small>
            </Form.Group>

            {/* Assign Patient (if private) */}
            {formData.isPrivate && (
              <Form.Group controlId="patientId" className="mt-3">
                <Form.Label>{t('Assign to Patient')}</Form.Label>
                <Form.Control
                  as="select"
                  value={formData.patientId}
                  onChange={handleChange}
                  isInvalid={!!fe('patientId')}
                  required
                >
                  <option value="">{t('Select a patient')}</option>
                  {therapistPatients.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Form.Control>
                <Form.Control.Feedback type="invalid">{fe('patientId')}</Form.Control.Feedback>
              </Form.Group>
            )}

            {/* Patient Type Assignments (only if not private) */}
            {!formData.isPrivate && (
              <>
                <h5 className="mt-4">{t('PatientTypeandFrequency')}</h5>
                {!!fe('patientTypes') && <Alert variant="danger" className="py-2">{fe('patientTypes')}</Alert>}
                {formData.patientTypes.map((pt, idx) => (
                  <Row key={idx} className="mb-3">
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label>{t('PatientType')}</Form.Label>
                        <Form.Control
                          as="select"
                          value={pt.type}
                          onChange={(e) => handlePatientTypeChange(idx, 'type', e.target.value)}
                          isInvalid={!!fe(`patientTypes.${idx}.type`)}
                        >
                          <option value="">{t('SelectType')}</option>
                          {specializationKeys.map((spec) => (
                            <option key={spec} value={spec}>{t(spec)}</option>
                          ))}
                        </Form.Control>
                        <Form.Control.Feedback type="invalid">{fe(`patientTypes.${idx}.type`)}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label>{t('Diagnosis')}</Form.Label>
                        <Form.Control
                          as="select"
                          value={pt.diagnosis}
                          onChange={(e) => handlePatientTypeChange(idx, 'diagnosis', e.target.value)}
                          isInvalid={!!fe(`patientTypes.${idx}.diagnosis`)}
                        >
                          <option value="">{t('SelectDiagnosis')}</option>
                          {(pt.diagnosesOptions || []).map((d) => (
                            <option key={d} value={d}>{t(d)}</option>
                          ))}
                          <option value="All">{t('All')}</option>
                        </Form.Control>
                        <Form.Control.Feedback type="invalid">{fe(`patientTypes.${idx}.diagnosis`)}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label>{t('RecomendationFrequency')}</Form.Label>
                        <Form.Control
                          as="select"
                          value={pt.frequency}
                          onChange={(e) => handlePatientTypeChange(idx, 'frequency', e.target.value)}
                          isInvalid={!!fe(`patientTypes.${idx}.frequency`)}
                        >
                          <option value="">{t('SelectFrequency')}</option>
                          {config.RecomendationInfo.frequency.map((f: string) => (
                            <option key={f} value={f}>{t(f)}</option>
                          ))}
                        </Form.Control>
                        <Form.Control.Feedback type="invalid">{fe(`patientTypes.${idx}.frequency`)}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                  </Row>
                ))}
                <Button variant="link" onClick={addPatientType}><FaPlus /> {t('AddAnotherPatientType')}</Button>
              </>
            )}
          </fieldset>

          {/* Submit is hidden once success is true */}
          {!success && (
            <Button variant="primary" type="submit" className="mt-4 w-100" disabled={submitting}>
              {submitting ? t('Submitting...') : t('Submit')}
            </Button>
          )}
        </Form>
      </Modal.Body>
    </Modal>
  );
};

export default AddInterventionPopup;
