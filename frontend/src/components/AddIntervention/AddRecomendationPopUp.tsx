import React, { useState, useEffect, useMemo } from 'react';
import { Alert, Button, Col, Form, Modal, Row } from 'react-bootstrap';
import { FaPlus } from 'react-icons/fa';
import apiClient from '../../api/client';
import config from '../../config/config.json';
import axios from 'axios';
import Select from 'react-select';
import InfoBubble from '../common/InfoBubble';
import { t } from 'i18next';

// ------------------ Types & Defaults ------------------
interface AddInterventionPopupProps {
  show: boolean;
  handleClose: () => void;
  onSuccess: () => void;
}

const defaultPatientType = {
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
  benefitFor: [],
  isPrivate: false,
  tagList: [],
  mediaFile: null,
  previewImage: null,
  patientId: '',
  patientTypes: [defaultPatientType],
};

// ------------------ Component ------------------
const AddInterventionPopup: React.FC<AddInterventionPopupProps> = ({
  show,
  handleClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState(defaultFormData);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [therapistPatients, setTherapistPatients] = useState<{ id: string; name: string }[]>([]);

  // ------------------ Derived Options ------------------
  const tagOptions = useMemo(
    () =>
      config.RecomendationInfo.tags.map((tag) => ({
        value: tag,
        label: t(tag.charAt(0).toUpperCase() + tag.slice(1)),
      })),
    [t]
  );

  const benefitOptions = useMemo(
    () =>
      config.RecomendationInfo.benefits.map((benefit) => ({
        value: benefit,
        label: t(benefit.charAt(0).toUpperCase() + benefit.slice(1)),
      })),
    [t]
  );

  const specializationKeys = Object.keys(config.patientInfo.function);

  const getDiagnosesForSpecialization = (specialization: string) => {
    return config?.patientInfo?.function?.[specialization]?.diagnosis || [];
  };

  // ------------------ Fetch Patients (for Private) ------------------
  useEffect(() => {
    const fetchTherapistPatients = async () => {
      try {
        const therapistId = localStorage.getItem('id');
        const { data } = await apiClient.get(`/therapists/${therapistId}/patients/`);
        const patientOptions = data.map((p) => ({
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

  // ------------------ Handlers ------------------
  const resetForm = () => {
    setFormData(defaultFormData);
    setError('');
    setSuccess(false);
  };

  const handlePatientTypeChange = (index: number, field: string, value: string | boolean) => {
    const updated = [...formData.patientTypes];
    updated[index][field] = value;

    if (field === 'type') {
      updated[index].diagnosesOptions = getDiagnosesForSpecialization(value as string);
      updated[index].diagnosis = '';
    }

    setFormData((prev) => ({ ...prev, patientTypes: updated }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleFileChange = (field: 'mediaFile' | 'previewImage') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData((prev) => ({ ...prev, [field]: file }));
    }
  };

  const handleMultiChange = (field: keyof typeof formData, selectedOptions: any[]) => {
    setFormData((prev) => ({
      ...prev,
      [field]: selectedOptions.map((opt) => opt.value),
    }));
  };

  const addPatientType = () => {
    setFormData((prev) => ({
      ...prev,
      patientTypes: [...prev.patientTypes, { ...defaultPatientType }],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    try {
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
        setSuccess(true);
        resetForm();
        onSuccess();
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.error || t('Error adding recommendation'));
      } else {
        setError(t('An unexpected error occurred'));
      }
    }
  };

  const handleModalClose = () => {
    resetForm();
    handleClose();
  };

  // ------------------ Render ------------------
  return (
    <Modal show={show} onHide={handleModalClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>{t('Add New Intervention')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{t('Interventionsuccessfullyadded')}</Alert>}

        <Form onSubmit={handleSubmit}>
          {/* Title */}
          <Form.Group controlId="title">
            <Form.Label>{t('InterventionTitle')}</Form.Label>
            <Form.Control
              type="text"
              placeholder={t('Enterrecommendationtitle')}
              value={formData.title}
              onChange={handleChange}
              required
            />
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
              required
            />
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
              required
            />
          </Form.Group>

          {/* Tags */}
          <Form.Group controlId="tagList" className="mt-3">
            <Form.Label>{t('TagList')}</Form.Label>
            <InfoBubble tooltip={t('Selectmultipletagstocategorizetherecommendation')} />
            <Select isMulti options={tagOptions} value={tagOptions.filter((opt) => formData.tagList.includes(opt.value))} onChange={(opts) => handleMultiChange('tagList', opts)} />
          </Form.Group>

          {/* Benefit For */}
          <Form.Group controlId="benefitFor" className="mt-3">
            <Form.Label>{t('BenefitFor')}</Form.Label>
            <Select isMulti options={benefitOptions} value={benefitOptions.filter((opt) => formData.benefitFor.includes(opt.value))} onChange={(opts) => handleMultiChange('benefitFor', opts)} />
          </Form.Group>

          {/* Content Type */}
          <Form.Group controlId="contentType" className="mt-3">
            <Form.Label>{t('ContentType')}</Form.Label>
            <Form.Control as="select" value={formData.contentType} onChange={handleChange} required>
              <option value="">{t('SelectContentType')}</option>
              {config.RecomendationInfo.types.map((type) => (
                <option key={type} value={type}>
                  {t(type.charAt(0).toUpperCase() + type.slice(1))}
                </option>
              ))}
            </Form.Control>
          </Form.Group>

          {/* Link */}
          <Form.Group controlId="link" className="mt-3">
            <Form.Label>{t('Link(Optional)')}</Form.Label>
            <Form.Control type="text" placeholder={t('Enterlink')} value={formData.link} onChange={handleChange} />
          </Form.Group>

          {/* Media File */}
          <Form.Group controlId="mediaFile" className="mt-3">
            <Form.Label>{t('UploadFile(Optional)')}</Form.Label>
            <Form.Control type="file" accept="image/*,video/*,audio/*,application/pdf" onChange={handleFileChange('mediaFile')} />
          </Form.Group>

          {/* Preview Image */}
          <Form.Group controlId="previewImage" className="mt-3">
            <Form.Label>{t('UploadaPreviewImage')}</Form.Label>
            <Form.Control type="file" accept="image/*" onChange={handleFileChange('previewImage')} />
          </Form.Group>

          {/* Is Private */}
          <Form.Group controlId="isPrivate" className="mt-3">
            <Form.Check type="checkbox" label={t('Make this a private intervention (only visible to the assigned patient)')} checked={formData.isPrivate} onChange={(e) => setFormData((prev) => ({ ...prev, isPrivate: e.target.checked }))} />
            <small className="text-muted">{t('Private interventions can include patient videos and will not be accessible or assignable to others.')}</small>
          </Form.Group>

          {/* Assign Patient (if private) */}
          {formData.isPrivate && (
            <Form.Group controlId="patientId" className="mt-3">
              <Form.Label>{t('Assign to Patient')}</Form.Label>
              <Form.Control as="select" value={formData.patientId} onChange={handleChange} required>
                <option value="">{t('Select a patient')}</option>
                {therapistPatients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Form.Control>
            </Form.Group>
          )}

          {/* Patient Type Assignments (only if not private) */}
          {!formData.isPrivate && (
            <>
              <h5 className="mt-4">{t('PatientTypeandFrequency')}</h5>
              {formData.patientTypes.map((pt, idx) => (
                <Row key={idx} className="mb-3">
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>{t('PatientType')}</Form.Label>
                      <Form.Control as="select" value={pt.type} onChange={(e) => handlePatientTypeChange(idx, 'type', e.target.value)}>
                        <option value="">{t('SelectType')}</option>
                        {specializationKeys.map((spec) => (
                          <option key={spec} value={spec}>{t(spec)}</option>
                        ))}
                      </Form.Control>
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>{t('Diagnosis')}</Form.Label>
                      <Form.Control as="select" value={pt.diagnosis} onChange={(e) => handlePatientTypeChange(idx, 'diagnosis', e.target.value)}>
                        <option value="">{t('SelectDiagnosis')}</option>
                        {(pt.diagnosesOptions || []).map((d) => (
                          <option key={d} value={d}>{t(d)}</option>
                        ))}
                        <option value="All">{t('All')}</option>
                      </Form.Control>
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>{t('RecomendationFrequency')}</Form.Label>
                      <Form.Control as="select" value={pt.frequency} onChange={(e) => handlePatientTypeChange(idx, 'frequency', e.target.value)}>
                        <option value="">{t('SelectFrequency')}</option>
                        {config.RecomendationInfo.frequency.map((f) => (
                          <option key={f} value={f}>{t(f)}</option>
                        ))}
                      </Form.Control>
                    </Form.Group>
                  </Col>
                </Row>
              ))}
              <Button variant="link" onClick={addPatientType}><FaPlus /> {t('AddAnotherPatientType')}</Button>
            </>
          )}

          {/* Submit */}
          {!success && (
            <Button variant="primary" type="submit" className="mt-4 w-100">
              {t('Submit')}
            </Button>
          )}
        </Form>
      </Modal.Body>
    </Modal>
  );
};

export default AddInterventionPopup;
