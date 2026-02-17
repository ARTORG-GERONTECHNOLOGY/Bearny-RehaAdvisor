import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Container, Form } from 'react-bootstrap';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import authStore from '../stores/authStore';
import { observer } from 'mobx-react-lite';
import { FaPlus } from 'react-icons/fa';
import apiClient from '../api/client';
import config from '../config/config.json';
import axios from 'axios';
import PatientTypeSection from '../components/AddIntervention/PatientTypeSection';
import InterventionFormFileInputs from '../components/AddIntervention/InterventionFormFileInputs';

const defaultForm = {
  title: '',
  description: '',
  contentType: 'blog',
  link: '',
  mediaFile: null,
  patientTypes: [{ type: '', frequency: '', includeOption: null }],
};

const AddInterventionView: React.FC = observer(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<typeof defaultForm>(defaultForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);

  const diagnoses = config?.patientInfo?.function?.[authStore.specialisations]?.diagnosis || [];

  useEffect(() => {
    authStore.checkAuthentication();
    if (
      !['Admin', 'Therapist', 'Researcher'].includes(authStore.userType) &&
      authStore.isAuthenticated
    ) {
      navigate('/unauthorized');
    }
  }, [navigate]);

  useEffect(() => {
    if (error || success) {
      setTimeout(() => {
        alertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [error, success]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleFileChange = (file: File | null) => {
    setFormData((prev) => ({ ...prev, mediaFile: file }));
  };

  const handlePatientTypeChange = (index: number, field: string, value: string | boolean) => {
    setFormData((prev) => {
      const updated = [...prev.patientTypes];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, patientTypes: updated };
    });
  };

  const addPatientType = () => {
    setFormData((prev) => ({
      ...prev,
      patientTypes: [...prev.patientTypes, { type: '', frequency: '', includeOption: null }],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsSubmitting(true);

    try {
      const payload = new FormData();
      payload.append('title', formData.title);
      payload.append('description', formData.description);
      payload.append('contentType', formData.contentType);
      if (formData.link) payload.append('link', formData.link);
      if (formData.mediaFile) payload.append('media_file', formData.mediaFile);
      payload.append('patientTypes', JSON.stringify(formData.patientTypes));

      const res = await apiClient.post('interventions/add', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.status === 200) {
        setSuccess(true);
        setFormData({ ...defaultForm, mediaFile: null });
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.error || t('Erroraddingintervention'));
      } else {
        setError(t('Unexpectederror'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="d-flex flex-column vh-100 overflow-auto">
      <Header isLoggedIn={!!authStore.userType} />

      <Container className="flex-grow-1 d-flex justify-content-center align-items-center">
        <div className="main-content p-5" style={{ maxWidth: 650, width: '100%' }}>
          <h2 className="mb-4 text-center">{t('AddNewIntervention')}</h2>

          <div ref={alertRef}>
            {error && <Alert variant="danger">{error}</Alert>}
            {success && <Alert variant="success">{t('Interventionsuccessfullyadded')}</Alert>}
          </div>

          <Form onSubmit={handleSubmit}>
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

            <Form.Group controlId="contentType" className="mt-3">
              <Form.Label>{t('ContentType')}</Form.Label>
              <Form.Control
                as="select"
                value={formData.contentType}
                onChange={handleChange}
                required
              >
                <option value="">{t('SelectContentType')}</option>
                {config.RecomendationInfo.types.map((type: string) => (
                  <option key={type} value={type}>
                    {t(type)}
                  </option>
                ))}
              </Form.Control>
            </Form.Group>

            <Form.Group controlId="link" className="mt-3">
              <Form.Label>{t('Link')}</Form.Label>
              <Form.Control
                type="url"
                placeholder={t('Enterbloglink')}
                value={formData.link}
                onChange={handleChange}
              />
            </Form.Group>

            <InterventionFormFileInputs
              show={formData.contentType !== 'app'}
              onFileChange={handleFileChange}
              key={formData.mediaFile ? formData.mediaFile.name : 'fileinput'}
            />

            <h5 className="mt-4">{t('PatientTypeandFrequency')}</h5>

            <PatientTypeSection
              types={formData.patientTypes}
              diagnoses={diagnoses}
              onChange={handlePatientTypeChange}
            />

            <Button
              variant="link"
              className="mt-3"
              onClick={addPatientType}
              aria-label="Add another patient type"
            >
              <FaPlus /> {t('AddAnotherPatientType')}
            </Button>

            {!success && (
              <Button type="submit" className="mt-4 w-100" disabled={isSubmitting}>
                {isSubmitting ? t('Submitting...') : t('Submit')}
              </Button>
            )}
          </Form>
        </div>
      </Container>

      <Footer />
    </div>
  );
});

export default AddInterventionView;
export { AddInterventionView };
