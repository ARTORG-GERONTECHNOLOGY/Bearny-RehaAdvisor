import React, { useEffect, useState } from 'react';
import { Alert, Button, Col, Container, Form, Row } from 'react-bootstrap';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import authStore from '../stores/authStore';
import { observer } from 'mobx-react-lite';
import { FaPlus } from 'react-icons/fa';
import apiClient from '../api/client';
import config from '../../src/config/config.json';
import axios from 'axios';

const AddRecommendationView: React.FC = observer(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // @ts-ignore
  const diagnoses = config?.patientInfo?.function?.[authStore?.specialisation]?.diagnosis || [];
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    contentType: 'blog', // Default content type
    link: '',
    mediaFile: null,
    patientTypes: [{ type: '', frequency: '', includeOption: null }], // Patient type array
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Check authentication
  useEffect(() => {
    authStore.checkAuthentication();
    if (!['Admin', 'Therapist', 'Researcher'].includes(authStore.userType) && authStore.isAuthenticated) {
      navigate('/unauthorized');
    }
  }, [authStore.userType, navigate]);

  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData(prevState => ({ ...prevState, [id]: value }));
  };

  // Handle file upload for media
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // @ts-ignore
    setFormData({ ...formData, mediaFile: file });
  };

  // Handle patient type and frequency changes
  const handlePatientTypeChange = (index: number, field: string, value: string | boolean) => {
    const updatedPatientTypes = [...formData.patientTypes];
    // @ts-ignore
    updatedPatientTypes[index][field] = value;
    setFormData({ ...formData, patientTypes: updatedPatientTypes });
  };

  // Add new patient type
  const addPatientType = () => {
    setFormData({
      ...formData,
      patientTypes: [...formData.patientTypes, { type: '', frequency: '', includeOption: null }],
    });
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    try {
      const formPayload = new FormData();
      formPayload.append('title', formData.title);
      formPayload.append('description', formData.description);
      formPayload.append('contentType', formData.contentType);

      // Append the correct media or link field based on contentType
      if (formData.link) {
        formPayload.append('link', formData.link);
      } else if (formData.mediaFile) {
        formPayload.append('media_file', formData.mediaFile);
      }

      // Append patient types as a JSON string
      formPayload.append('patientTypes', JSON.stringify(formData.patientTypes));

      // Send the request
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
    <div className="d-flex flex-column vh-100 overflow-auto">
      <Header isLoggedIn={!!authStore.userType} />

      <Container className="flex-grow-1 d-flex justify-content-center align-items-center">
        <div className="main-content p-5" style={{ maxWidth: '600px', width: '100%' }}>
          <h2 className="mb-4 text-center">{t('AddNewRecommendation')}</h2>

          {error && <Alert variant="danger">{error}</Alert>}
          {success && <Alert variant="success">{t("Recommendationsuccessfullyadded")}</Alert>}

          <Form onSubmit={handleSubmit}>
            <Form.Group controlId="title">
              <Form.Label>{t("RecommendationTitle")}</Form.Label>
              <Form.Control
                type="text"
                placeholder={t("Enterrecommendationtitle")}
                value={formData.title}
                // @ts-ignore
                onChange={handleChange}
                required
              />
            </Form.Group>

            <Form.Group controlId="description" className="mt-3">
              <Form.Label>{t("Description")}</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                placeholder={t("Enterdescription")}
                value={formData.description}
                // @ts-ignore
                onChange={handleChange}
                required
              />
            </Form.Group>

            {/* Content Type Selection */}
            <Form.Group controlId="contentType" className="mt-3">
              <Form.Label>{t("ContentType")}</Form.Label>

              <Form.Control as="select" value={formData.contentType}
                // @ts-ignore
                            onChange={handleChange} required>
                <option value="">{t("SelectContentType")}</option>
                {config.RecomendationInfo.types.map((type: any) => (
                  <option key={type} value={type}>
                    {t(type.charAt(0).toUpperCase() + type.slice(1))}
                  </option>
                ))}
              </Form.Control>
            </Form.Group>

            {/* Additional Inputs based on Content Type */}

              <Form.Group controlId="link" className="mt-3">
                <Form.Label>{t("Link")}</Form.Label>
                <Form.Control
                  type="text"
                  placeholder={t("Enterbloglink")}
                  value={formData.link}
                  // @ts-ignore
                  onChange={handleChange}
                />
              </Form.Group>

            {formData.contentType !== 'app' && (
              <Form.Group controlId="mediaFile" className="mt-3">
                <Form.Label>{t("UploadFile")}</Form.Label>
                <Form.Control type="file" accept="image/*,video/*,audio/*,application/pdf" onChange={handleFileChange} />
              </Form.Group>
            )}

            {/* Patient Type and Frequency */}
            <h5 className="mt-4">{t("PatientTypeandFrequency")}</h5>
            {formData.patientTypes.map((patient, index) => (
              <Row key={index} className="align-items-center">
                <Col xs={6}>
                  <Form.Group controlId={`patientType-${index}`}>
                    <Form.Label>{t("PatientType")}</Form.Label>
                    <Form.Control
                      as="select"
                      value={patient.type}
                      onChange={(e) => handlePatientTypeChange(index, 'type', e.target.value)}
                      required
                    >
                      <option value="">{t("SelectType")}</option>
                      {diagnoses.map((type: any) => (
                        <option key={type} value={type}>{t(type)}</option>
                      ))}
                    </Form.Control>
                  </Form.Group>
                </Col>

                <Col xs={6}>
                  <Form.Group controlId={`frequency-${index}`}>
                    <Form.Label>{t("Frequency")}</Form.Label>
                    <Form.Control
                      as="select"
                      value={patient.frequency}
                      onChange={(e) => handlePatientTypeChange(index, 'frequency', e.target.value)}
                      required
                    >
                      <option value="">{t("SelectFrequency")}</option>
                      {config.RecomendationInfo.frequency.map((freq: any) => (
                        <option key={freq} value={freq}>{t(freq)}</option>
                      ))}
                    </Form.Control>
                  </Form.Group>
                </Col>
                <Col xs={12}>
                  <Form.Check
                    inline
                    label={t("CoreExercise")}
                    type="radio"
                    id={`include-${index}`}
                    name={`includeOption-${index}`}
                    checked={patient.includeOption === true}
                    onChange={() => handlePatientTypeChange(index, 'includeOption', true)}
                  />
                  <Form.Check
                    inline
                    label={t("Supportive")}
                    type="radio"
                    id={`exclude-${index}`}
                    name={`includeOption-${index}`}
                    checked={patient.includeOption === false}
                    onChange={() => handlePatientTypeChange(index, 'includeOption', false)}
                  />
                </Col>
              </Row>
            ))}

            <Button variant="link" className="mt-3" onClick={addPatientType}>
              <FaPlus /> {t("AddAnotherPatientType")}
            </Button>
            {!success && (
            <Button variant="primary" type="submit" className="mt-4 w-100">
              {t("Submit")}
            </Button>)}
          </Form>
        </div>
      </Container>

      <Footer />
    </div>
  );
});

export default AddRecommendationView;
