import React, { useState } from 'react';
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

const AddInterventionPopup: React.FC<AddInterventionPopupProps> = ({
  show,
  handleClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    duration: 0,
    contentType: 'Article',
    link: '',
    benefitFor: [],
    tagList: [],
    mediaFile: null,
    previewImage: null,
    patientTypes: [{ type: '', frequency: '', includeOption: null, diagnosis: '' }],
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Fetch diagnoses based on selected specialization

  const getDiagnosesForSpecialization = (specialization) => {
    return config?.patientInfo?.function?.[specialization]?.diagnosis || [];
  };

  // Handle changes in the patient type and update diagnosis options

  const handlePatientTypeChange = (index, field, value) => {
    const updatedPatientTypes = [...formData.patientTypes];

    updatedPatientTypes[index][field] = value;

    // Update diagnoses options when specialization changes
    if (field === 'type') {
      updatedPatientTypes[index].diagnosesOptions = getDiagnosesForSpecialization(value);
      updatedPatientTypes[index].diagnosis = ''; // Reset diagnosis selection
    }

    setFormData((prev) => ({ ...prev, patientTypes: updatedPatientTypes }));
  };

  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    setFormData((prev) => ({ ...prev, mediaFile: file }));
  };

  // Handle file upload
  const handleImgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    setFormData((prev) => ({ ...prev, previewImage: file }));
  };

  const handleMultiChange = (field, selectedOptions) => {
    setFormData({
      ...formData,
      [field]: selectedOptions.map((option) => option.value),
    });
  };

  const addPatientType = () => {
    setFormData((prev) => ({
      ...prev,
      patientTypes: [
        ...prev.patientTypes,
        { type: '', frequency: '', includeOption: null, diagnosis: '' },
      ],
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    try {
      const formPayload = new FormData();
      formPayload.append('title', formData.title);
      formPayload.append('description', formData.description);
      formPayload.append('contentType', formData.contentType);
      formPayload.append('img_file', formData.previewImage);

      formPayload.append('duration', formData.duration);

      formPayload.append('benefitFor', formData.benefitFor);

      formPayload.append('tagList', formData.tagList);

      if (formData.link) {
        formPayload.append('link', formData.link);
      } else if (formData.mediaFile) {
        formPayload.append('media_file', formData.mediaFile);
      }

      formPayload.append('patientTypes', JSON.stringify(formData.patientTypes));

      const response = await apiClient.post('interventions/add/', formPayload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.status === 201) {
        setSuccess(true);
        setFormData({
          title: '',
          description: '',
          duration: 0,
          contentType: 'blog',
          benefitFor: [],
          link: '',
          tagList: [],
          mediaFile: null,
          previewImage: null,
          patientTypes: [{ type: '', frequency: '', includeOption: null, diagnosis: '' }],
        });
        onSuccess(); // Callback for parent component
        setSuccess(false);
        setError('');
      }
      else {
        if (axios.isAxiosError(error) && error.response) {
          setError(error.response.data.error || t('Error adding recommendation'));
        } else {
          setError(t('An unexpected error occurred'));
        }
      }
    } 
   
    
    
    catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        setError(error.response.data.error || t('Error adding recommendation'));
      } else {
        setError(t('An unexpected error occurred'));
      }
    }
  };

  const handleModalClose = () => {
    setFormData({
      title: '',
      description: '',
      duration: 0,
      contentType: 'Article',
      link: '',
      benefitFor: [],
      tagList: [],
      mediaFile: null,
      previewImage: null,
      patientTypes: [{ type: '', frequency: '', includeOption: null, diagnosis: '' }],
    });
    setError('');
    setSuccess(false);
    handleClose();  // original parent close
  };
  

  return (
    <Modal show={show} onHide={handleModalClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>{t('Add New Intervention')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{t('Interventionsuccessfullyadded')}</Alert>}

        <Form onSubmit={handleSubmit}>
          <Form.Group controlId="title">
            <Form.Label>{t('InterventionTitle')}</Form.Label>
            <Form.Control
              type="text"
              placeholder={t('Enterrecommendationtitle')}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </Form.Group>

          <Form.Group controlId="description" className="mt-3">
            <Form.Label>{t('Description')}</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              placeholder={t('Enterdescription')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
          </Form.Group>

          <Form.Group controlId="duration">
            <Form.Label>{t('RecomendationDuration(min)')}</Form.Label>
            <InfoBubble
              tooltip={t(
                'Putthedurationofthethattheinterventionshouldlasthereaproximatelyinminutes'
              )}
            />
            <Form.Control
              type="number"
              placeholder={t('Enterrecommendationduartioninminutes')}
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
              required
            />
          </Form.Group>

          <Form.Group controlId="tagList" className="mt-3">
            <Form.Label>{t('TagList')}</Form.Label>
            <InfoBubble tooltip={t('Selectmultipletagstocategorizetherecommendation')} />
            <Select
              isMulti
              options={config.RecomendationInfo.tags.map((type) => ({
                value: type,
                label: t(type.charAt(0).toUpperCase() + type.slice(1)),
              }))}
              value={formData.tagList.map((value) => ({
                value,
                label: value.charAt(0).toUpperCase() + value.slice(1),
              }))}
              onChange={(selectedOptions) => handleMultiChange('tagList', selectedOptions)}
            />
          </Form.Group>

          <Form.Group controlId="benefitFor" className="mt-3">
            <Form.Label>{t('BenefitFor')}</Form.Label>
            <Select
              isMulti
              options={config.RecomendationInfo.benefits.map((type) => ({
                value: type,
                label: t(type.charAt(0).toUpperCase() + type.slice(1)),
              }))}
              value={formData.benefitFor.map((value) => ({
                value,
                label: value.charAt(0).toUpperCase() + value.slice(1),
              }))}
              onChange={(selectedOptions) => handleMultiChange('benefitFor', selectedOptions)}
            />
          </Form.Group>

          <Form.Group controlId="contentType" className="mt-3">
            <Form.Label>{t('ContentType')}</Form.Label>
            <Form.Control
              as="select"
              value={formData.contentType}
              onChange={(e) => setFormData({ ...formData, contentType: e.target.value })}
              required
            >
              <option value="">{t('SelectContentType')}</option>
              {config.RecomendationInfo.types.map((type) => (
                <option key={type} value={type}>
                  {t(type.charAt(0).toUpperCase() + type.slice(1))}
                </option>
              ))}
            </Form.Control>
          </Form.Group>

          <Form.Group controlId="link" className="mt-3">
            <Form.Label>{t('Link(Optional)')}</Form.Label>
            <Form.Control
              type="text"
              placeholder={t('Enterlink')}
              value={formData.link}
              onChange={handleChange}
            />
          </Form.Group>

          <Form.Group controlId="mediaFile" className="mt-3">
            <Form.Label>{t('UploadFile(Optional)')}</Form.Label>
            <Form.Control
              type="file"
              accept="image/*,video/*,audio/*,application/pdf"
              onChange={handleFileChange}
            />
          </Form.Group>

          <Form.Group controlId="previewImage" className="mt-3">
            <Form.Label>{t('UploadaPreviewImage')}</Form.Label>
            <Form.Control type="file" accept="image/*" onChange={handleImgChange} />
          </Form.Group>

          <h5 className="mt-4">{t('PatientTypeandFrequency')}</h5>
          {formData.patientTypes.map((patient, index) => (
            <Row key={index} className="align-items-center">
              <Col xs={4}>
                <Form.Group controlId={patientType-${index}}>
                  <Form.Label>{t('PatientType')}</Form.Label>
                  <Form.Control
                    as="select"
                    value={patient.type}
                    onChange={(e) => handlePatientTypeChange(index, 'type', e.target.value)}
                    required
                  >
                    <option value="">{t('SelectType')}</option>
                    {Object.keys(config.patientInfo.function).map((specialization) => (
                      <option key={specialization} value={specialization}>
                        {t(specialization)}
                      </option>
                    ))}
                  </Form.Control>
                </Form.Group>
              </Col>
              <Col xs={4}>
                <Form.Group controlId={diagnoses-${index}}>
                  <Form.Label>{t('Diagnosis')}</Form.Label>
                  <Form.Control
                    as="select"
                    value={patient.diagnosis}
                    onChange={(e) => handlePatientTypeChange(index, 'diagnosis', e.target.value)}
                    required
                  >
                    <option value="">{t('SelectDiagnosis')}</option>
                    {(patient.diagnosesOptions || []).map((diag) => (
                      <option key={diag} value={diag}>
                        {t(diag)}
                      </option>
                    ))}
                    <option key="All" value="All">
                      {t('All')}
                    </option>
                  </Form.Control>
                </Form.Group>
              </Col>
              <Col xs={4}>
                <Form.Group controlId={frequency-${index}}>
                  <Form.Label>{t('RecomendationFrequency')}</Form.Label>
                  <Form.Control
                    as="select"
                    value={patient.frequency}
                    onChange={(e) => handlePatientTypeChange(index, 'frequency', e.target.value)}
                    required
                  >
                    <option value="">{t('SelectFrequency')}</option>
                    {config.RecomendationInfo.frequency.map((freq) => (
                      <option key={freq} value={freq}>
                        {t(freq)}
                      </option>
                    ))}
                  </Form.Control>
                </Form.Group>
              </Col>
            </Row>
          ))}

          <Button variant="link" className="mt-3" onClick={addPatientType}>
            <FaPlus /> {t('AddAnotherPatientType')}
          </Button>

          {success ? (
  <Alert variant="success" className="mt-4 text-center">
    {t('Intervention successfully added')}
  </Alert>
) : (
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