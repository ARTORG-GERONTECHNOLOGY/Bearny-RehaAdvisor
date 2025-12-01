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
  const [showErrorDetails, setShowErrorDetails] = useState(false);

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

    if (formData.isPrivate) fetchTherapistPatients();
  }, [formData.isPrivate]);

  const resetForm = () => {
    setFormData(defaultFormData);
    setError('');
    setErrors({});
    setSuccess(false);
    setSubmitting(false);
    setShowErrorDetails(false);
  };

  const handlePatientTypeChange = (
    index: number,
    field: keyof PatientType,
    value: string | boolean
  ) => {
    const updated = [...formData.patientTypes];
    // @ts-ignore
    updated[index][field] = value;

    if (field === 'type') {
      updated[index].diagnosesOptions = getDiagnosesForSpecialization(value as string);
      updated[index].diagnosis = '';
    }

    setFormData((prev) => ({ ...prev, patientTypes: updated }));

    // Remove field-specific errors
    const key = `patientTypes.${index}.${field}`;
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

    setFormData((prev) => ({ ...prev, [id]: val }));

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

  const addPatientType = () => {
    setFormData((prev) => ({
      ...prev,
      patientTypes: [...prev.patientTypes, { ...defaultPatientType }],
    }));
  };

  /* ---------------- VALIDATION ---------------- */
  const validateForm = (): { valid: boolean; errors: ErrorMap } => {
    const e: ErrorMap = {};
    const f = formData;

    if (!f.title.trim()) e.title = t('Title is required');
    if (!f.description.trim()) e.description = t('Description is required');

    if (!f.duration || Number(f.duration) <= 0) {
      e.duration = t('Duration must be greater than 0');
    }

    if (!f.contentType) e.contentType = t('Content type is required');
    if (!f.previewImage) e.previewImage = t('Preview image is required');

    // Link validation
    if (f.link && f.link.trim()) {
      try {
        const url = new URL(f.link.trim());
        if (!['http:', 'https:'].includes(url.protocol)) {
          e.link = t('Link must start with http:// or https://');
        }
      } catch (_) {
        e.link = t('Link must be a valid URL');
      }
    }

    if (f.isPrivate) {
      if (!f.patientId) e.patientId = t('Please select a patient for a private intervention');
    } else {
      f.patientTypes.forEach((pt, idx) => {
        if (!pt.type) e[`patientTypes.${idx}.type`] = t('Patient type is required');
        if (!pt.diagnosis) e[`patientTypes.${idx}.diagnosis`] = t('Diagnosis (or All) is required');
        if (!pt.frequency) e[`patientTypes.${idx}.frequency`] = t('Frequency is required');
      });
    }

    return { valid: Object.keys(e).length === 0, errors: e };
  };

  /* ---------------- HUMANIZE FIELD NAMES ---------------- */
  const humanizeField = (key: string) => {
    if (key.startsWith('patientTypes.')) {
      const [, idx, field] = key.split('.');
      const map: Record<string, string> = {
        type: t('Patient Type'),
        diagnosis: t('Diagnosis'),
        frequency: t('Frequency'),
      };
      return `${t('Patient Type')} #${Number(idx) + 1} – ${map[field] || field}`;
    }

    const map: Record<string, string> = {
      title: t('Title'),
      description: t('Description'),
      duration: t('Duration'),
      contentType: t('Content Type'),
      patientId: t('Patient'),
      previewImage: t('Preview Image'),
      link: t('Link'),
      media_file: t('Uploaded File'),
      img_file: t('Preview Image'),
    };

    return map[key] || key;
  };

  /* ---------------- BACKEND ERROR HANDLER ---------------- */
  const applyBackendErrors = (data: any) => {
    console.log("🔥 applyBackendErrors INPUT:", data);

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

      // Basic fields
      payload.append('title', formData.title);
      payload.append('description', formData.description);
      payload.append('duration', String(formData.duration));
      payload.append('contentType', formData.contentType);
      payload.append('link', formData.link || '');

      // Multi fields
      payload.append('tagList', JSON.stringify(formData.tagList));
      payload.append('benefitFor', JSON.stringify(formData.benefitFor));

      // Private toggle
      payload.append('isPrivate', String(formData.isPrivate));
      if (formData.isPrivate) {
        payload.append('patientId', formData.patientId);
      }

      // Patient types (JSON)
      payload.append('patientTypes', JSON.stringify(formData.patientTypes));

      // Files (MUST MATCH BACKEND)
      if (formData.mediaFile) {
        payload.append('media_file', formData.mediaFile);
      }
      if (formData.previewImage) {
        payload.append('img_file', formData.previewImage);
      }

      const res = await apiClient.post('interventions/add/', payload);

      if (res.status === 201) {
        setSuccess(true);
        setError('');
        setErrors({});
        setShowErrorDetails(false);
        onSuccess();
        return;
      }

      console.log('❗ Non-201 Response:', res.data);
      applyBackendErrors(res.data);

    } catch (err: any) {
      if (axios.isAxiosError(err)) {
        console.log('❗ Caught Axios error:', err.response?.data);
        applyBackendErrors(err.response?.data);
        return;
      }

      console.log('❗ Non-Axios error:', err);
      setError(t('An unexpected error occurred. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleModalClose = () => {
    resetForm();
    handleClose();
  };

  const fe = (key: string) => errors[key];

  /* ---------------- UI ---------------- */
  return (
    <Modal show={show} onHide={handleModalClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>{t('Add New Intervention')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {/* ERROR BANNER */}
        {error && (
          <Alert variant="danger" className="mb-3">
            <div className="d-flex justify-content-between align-items-center">
              <span>{error}</span>
              <Button size="sm" onClick={() => setShowErrorDetails(!showErrorDetails)}>
                {showErrorDetails ? t('Hide details') : t('Show details')}
              </Button>
            </div>

            {showErrorDetails && (
              <div className="mt-2">
                <ul className="mb-0">
                  {Object.entries(errors).map(([field, msg]) => (
                    <li key={field}>
                      <strong>{humanizeField(field)}:</strong> {msg}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Alert>
        )}

        {/* SUCCESS */}
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
                isInvalid={!!fe('media_file')}
              />
              <Form.Control.Feedback type="invalid">{fe('media_file')}</Form.Control.Feedback>
            </Form.Group>

            {/* Preview Image */}
            <Form.Group controlId="previewImage" className="mt-3">
              <Form.Label>{t('UploadaPreviewImage')}</Form.Label>
              <Form.Control
                type="file"
                accept="image/*"
                onChange={handleFileChange('previewImage')}
                isInvalid={!!fe('img_file') || !!fe('previewImage')}
                required
              />
              <Form.Control.Feedback type="invalid">
                {fe('img_file') || fe('previewImage')}
              </Form.Control.Feedback>
            </Form.Group>

            {/* Private toggle */}
            <Form.Group controlId="isPrivate" className="mt-3">
              <Form.Check
                type="checkbox"
                label={t(
                  'Make this a private intervention (only visible to the assigned patient)'
                )}
                checked={formData.isPrivate}
                onChange={handleChange}
              />
            </Form.Group>

            {/* Assign Patient (If private) */}
            {formData.isPrivate && (
              <Form.Group controlId="patientId" className="mt-3">
                <Form.Label>{t('Assign to Patient')}</Form.Label>
                <Form.Control
                  as="select"
                  value={formData.patientId}
                  onChange={handleChange}
                  isInvalid={!!fe('patientId')}
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

            {/* Patient Types */}
            {!formData.isPrivate && (
              <>
                <h5 className="mt-4">{t('PatientTypeandFrequency')}</h5>

                {formData.patientTypes.map((pt, idx) => (
                  <Row key={idx} className="mb-3">
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label>{t('PatientType')}</Form.Label>
                        <Form.Control
                          as="select"
                          value={pt.type}
                          onChange={(e) =>
                            handlePatientTypeChange(idx, 'type', e.target.value)
                          }
                          isInvalid={!!fe(`patientTypes.${idx}.type`)}
                        >
                          <option value="">{t('SelectType')}</option>
                          {specializationKeys.map((spec) => (
                            <option key={spec} value={spec}>
                              {t(spec)}
                            </option>
                          ))}
                        </Form.Control>
                        <Form.Control.Feedback type="invalid">
                          {fe(`patientTypes.${idx}.type`)}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>

                    <Col md={4}>
                      <Form.Group>
                        <Form.Label>{t('Diagnosis')}</Form.Label>
                        <Form.Control
                          as="select"
                          value={pt.diagnosis}
                          onChange={(e) =>
                            handlePatientTypeChange(idx, 'diagnosis', e.target.value)
                          }
                          isInvalid={!!fe(`patientTypes.${idx}.diagnosis`)}
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
                          {fe(`patientTypes.${idx}.diagnosis`)}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>

                    <Col md={4}>
                      <Form.Group>
                        <Form.Label>{t('RecomendationFrequency')}</Form.Label>
                        <Form.Control
                          as="select"
                          value={pt.frequency}
                          onChange={(e) =>
                            handlePatientTypeChange(idx, 'frequency', e.target.value)
                          }
                          isInvalid={!!fe(`patientTypes.${idx}.frequency`)}
                        >
                          <option value="">{t('SelectFrequency')}</option>
                          {config.RecomendationInfo.frequency.map((f: string) => (
                            <option key={f} value={f}>
                              {t(f)}
                            </option>
                          ))}
                        </Form.Control>
                        <Form.Control.Feedback type="invalid">
                          {fe(`patientTypes.${idx}.frequency`)}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                  </Row>
                ))}

                <Button variant="link" onClick={addPatientType}>
                  <FaPlus /> {t('AddAnotherPatientType')}
                </Button>
              </>
            )}
          </fieldset>

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
