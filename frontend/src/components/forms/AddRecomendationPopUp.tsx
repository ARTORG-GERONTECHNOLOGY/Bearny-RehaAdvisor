import React, { useState } from 'react';
import { Alert, Button, Col, Form, Modal, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaPlus } from 'react-icons/fa';
import apiClient from '../../api/client';
import config from '../../config/config.json';
import axios from 'axios';
import authStore from '../../stores/authStore';

interface AddRecommendationPopupProps {
  show: boolean;
  handleClose: () => void;
  onSuccess: () => void;
}

const AddRecommendationPopup: React.FC<AddRecommendationPopupProps> = ({ show, handleClose, onSuccess }) => {
  const { t } = useTranslation();
  // @ts-ignore
  const diagnoses = config?.patientInfo?.function?.[authStore?.specialisation]?.diagnosis || [];
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    contentType: 'blog',
    link: '',
    mediaFile: null,
    patientTypes: [{ type: '', frequency: '', includeOption: null }],
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // @ts-ignore
    setFormData((prev) => ({ ...prev, mediaFile: file }));
  };

  // Handle patient type and frequency changes
  const handlePatientTypeChange = (index: number, field: string, value: string | boolean) => {
    const updatedPatientTypes = [...formData.patientTypes];
    // @ts-ignore
    updatedPatientTypes[index][field] = value;
    setFormData((prev) => ({ ...prev, patientTypes: updatedPatientTypes }));
  };

  const addPatientType = () => {
    setFormData((prev) => ({
      ...prev,
      patientTypes: [...prev.patientTypes, { type: '', frequency: '', includeOption: null }],
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

      if (formData.link) {
        formPayload.append('link', formData.link);
      } else if (formData.mediaFile) {
        formPayload.append('media_file', formData.mediaFile);
      }

      formPayload.append('patientTypes', JSON.stringify(formData.patientTypes));

      const response = await apiClient.post('recommendations/add', formPayload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.status === 200) {
        setSuccess(true);
        setFormData({
          title: '',
          description: '',
          contentType: 'blog',
          link: '',
          mediaFile: null,
          patientTypes: [{ type: '', frequency: '', includeOption: null }],
        });
        onSuccess(); // Callback for parent component
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        setError(error.response.data.error || 'Error adding recommendation');
      } else {
        setError('An unexpected error occurred');
      }
    }
  };


  return (
    <Modal show={show} onHide={handleClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{t('Add New Recommendation')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{t('Recommendation successfully added')}</Alert>}

        <Form onSubmit={handleSubmit}>
          <Form.Group controlId="title">
            <Form.Label>{t('Recommendation Title')}</Form.Label>
            <Form.Control
              type="text"
              placeholder={t('Enter recommendation title')}
              value={formData.title}
              // @ts-ignore
              onChange={handleChange}
              required
            />
          </Form.Group>

          <Form.Group controlId="description" className="mt-3">
            <Form.Label>{t('Description')}</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              placeholder={t('Enter description')}
              value={formData.description}
              // @ts-ignore
              onChange={handleChange}
              required
            />
          </Form.Group>

          <Form.Group controlId="contentType" className="mt-3">
            <Form.Label>{t('Content Type')}</Form.Label>
            <Form.Control
              as="select"
              value={formData.contentType}
              // @ts-ignore
              onChange={handleChange}
              required
            >
              <option value="">{t('Select Content Type')}</option>
              {config.RecomendationInfo.types.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </Form.Control>
          </Form.Group>

          <Form.Group controlId="link" className="mt-3">
            <Form.Label>{t('Link')}</Form.Label>
            <Form.Control
              type="text"
              placeholder={t('Enter link')}
              value={formData.link}
              // @ts-ignore
              onChange={handleChange}
            />
          </Form.Group>

          <Form.Group controlId="mediaFile" className="mt-3">
            <Form.Label>{t('Upload File')}</Form.Label>
            <Form.Control
              type="file"
              accept="image/*,video/*,audio/*,application/pdf"
              onChange={handleFileChange}
            />
          </Form.Group>

          <h5 className="mt-4">{t('Patient Type and Frequency')}</h5>
          {formData.patientTypes.map((patient, index) => (
            <Row key={index} className="align-items-center">
              <Col xs={6}>
                <Form.Group controlId={`patientType-${index}`}>
                  <Form.Label>{t('Patient Type')}</Form.Label>
                  <Form.Control
                    as="select"
                    value={patient.type}
                    onChange={(e) => handlePatientTypeChange(index, 'type', e.target.value)}
                    required
                  >
                    <option value="">{t('Select Type')}</option>
                    {diagnoses.map((type: string) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Form.Control>
                </Form.Group>
              </Col>
              <Col xs={6}>
                <Form.Group controlId={`frequency-${index}`}>
                  <Form.Label>{t('Frequency')}</Form.Label>
                  <Form.Control
                    as="select"
                    value={patient.frequency}
                    onChange={(e) => handlePatientTypeChange(index, 'frequency', e.target.value)}
                    required
                  >
                    <option value="">{t('Select Frequency')}</option>
                    {config.RecomendationInfo.frequency.map((freq) => (
                      <option key={freq} value={freq}>
                        {freq}
                      </option>
                    ))}
                  </Form.Control>
                </Form.Group>
              </Col>
            </Row>
          ))}

          <Button variant="link" className="mt-3" onClick={addPatientType}>
            <FaPlus /> {t('Add Another Patient Type')}
          </Button>

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

export default AddRecommendationPopup;
