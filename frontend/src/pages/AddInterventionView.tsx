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
import interventionsConfig from '../config/interventions.json';
import axios from 'axios';
import PatientTypeSection from '../components/AddIntervention/PatientTypeSection';
import InterventionFormFileInputs from '../components/AddIntervention/InterventionFormFileInputs';

const VALID_FORMAT_CODES = new Set(['vid', 'img', 'pdf', 'web', 'aud', 'app', 'br', 'gfx']);

/** Validate the {number}_{format} part of the ID (language is separate). */
function validateExternalId(id: string): string {
  if (!id) return '';
  const parts = id.toLowerCase().split('_');
  if (parts.length < 2) return 'Expected format: {number}_{format} e.g. 3500_web';
  const num = parts.slice(0, -1).join('_');
  const fmt = parts[parts.length - 1];
  if (!/^\d{4,5}$/.test(num)) return 'Prefix must be 4 digits (original) or 5 digits (self-made).';
  if (!VALID_FORMAT_CODES.has(fmt))
    return `Unknown format code "${fmt}". Valid: ${[...VALID_FORMAT_CODES].sort().join(', ')} (vid=video, img/gfx=image, pdf/br=document, web=website, aud=audio, app=app).`;
  return '';
}

const AIMS: string[] = (interventionsConfig as any)?.interventionsTaxonomy?.aims ?? [];

const defaultForm = {
  title: '',
  description: '',
  contentType: 'blog',
  duration: 30,
  externalId: '',
  language: '',
  aim: '',
  link: '',
  primaryDiagnosis: [] as string[],
  mediaFile: null,
  patientTypes: [{ type: '', frequency: '', includeOption: null }],
};

const LANGUAGES = [
  { value: 'de', label: 'DE — Deutsch' },
  { value: 'fr', label: 'FR — Français' },
  { value: 'it', label: 'IT — Italiano' },
  { value: 'pt', label: 'PT — Português' },
  { value: 'nl', label: 'NL — Nederlands' },
  { value: 'en', label: 'EN — English' },
];

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

  const handlePrimaryDiagnosisChange = (value: string) => {
    setFormData((prev) => {
      const current = prev.primaryDiagnosis;
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, primaryDiagnosis: next };
    });
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
      // client-side external_id validation
      if (formData.externalId) {
        const idErr = validateExternalId(formData.externalId);
        if (idErr) {
          setError(idErr);
          setIsSubmitting(false);
          return;
        }
      }

      const payload = new FormData();
      payload.append('title', formData.title);
      payload.append('description', formData.description);
      payload.append('contentType', formData.contentType);
      payload.append('duration', String(formData.duration));
      if (formData.externalId) payload.append('external_id', formData.externalId.toLowerCase());
      if (formData.language) payload.append('language', formData.language);
      if (formData.link) payload.append('link', formData.link);
      if (formData.mediaFile) payload.append('media_file', formData.mediaFile);
      payload.append('patientTypes', JSON.stringify(formData.patientTypes));
      payload.append(
        'taxonomy',
        JSON.stringify({
          ...(formData.primaryDiagnosis.length
            ? { primary_diagnosis: formData.primaryDiagnosis }
            : {}),
          ...(formData.aim ? { aim: formData.aim } : {}),
        })
      );

      const res = await apiClient.post('interventions/add', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.status === 200) {
        setSuccess(true);
        setFormData({
          ...defaultForm,
          mediaFile: null,
          primaryDiagnosis: [],
          externalId: '',
          duration: 30,
          aim: '',
        });
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const data = err.response.data;
        const msg = data.message || data.error || t('Erroraddingintervention');
        const fieldMsgs = data.field_errors
          ? Object.entries(data.field_errors)
              .map(([k, v]: [string, any]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`)
              .join('\n')
          : '';
        setError(fieldMsgs ? `${msg}\n${fieldMsgs}` : msg);
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

            <Form.Group controlId="duration" className="mt-3">
              <Form.Label>
                {t('Duration')} ({t('minutes')})
              </Form.Label>
              <Form.Control
                type="number"
                min={1}
                value={formData.duration}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    duration: Math.max(1, parseInt(e.target.value) || 1),
                  }))
                }
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

            <Form.Group controlId="externalId" className="mt-3">
              <Form.Label>{t('ID')}</Form.Label>
              <Form.Control
                type="text"
                placeholder="3500_web"
                value={formData.externalId}
                onChange={handleChange}
                isInvalid={!!formData.externalId && !!validateExternalId(formData.externalId)}
              />
              <Form.Text className="text-muted">
                {t('ID format')}
                {': '}
                <code>3500_web</code> {t('(original)')} / <code>30500_vid</code> {t('(self-made)')}
                {' — '}
                <code>vid, img, gfx, pdf, br, web, aud, app</code>
              </Form.Text>
              {formData.externalId && (
                <Form.Control.Feedback type="invalid">
                  {validateExternalId(formData.externalId)}
                </Form.Control.Feedback>
              )}
            </Form.Group>

            <Form.Group controlId="language" className="mt-3">
              <Form.Label>{t('Language')}</Form.Label>
              <Form.Select id="language" value={formData.language} onChange={handleChange}>
                <option value="">{t('SelectType')}</option>
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            {AIMS.length > 0 && (
              <Form.Group controlId="aim" className="mt-3">
                <Form.Label>{t('Aim')}</Form.Label>
                <Form.Select id="aim" value={formData.aim} onChange={handleChange}>
                  <option value="">{t('SelectAim')}</option>
                  {AIMS.map((a) => (
                    <option key={a} value={a}>
                      {t(a)}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            )}

            {diagnoses.length > 0 && (
              <Form.Group className="mt-3">
                <Form.Label>{t('Diagnosis')}</Form.Label>
                <div className="border rounded p-2" style={{ maxHeight: 160, overflowY: 'auto' }}>
                  {diagnoses.map((d: string) => (
                    <Form.Check
                      key={d}
                      id={`pd-${d}`}
                      label={t(d)}
                      checked={formData.primaryDiagnosis.includes(d)}
                      onChange={() => handlePrimaryDiagnosisChange(d)}
                    />
                  ))}
                </div>
                <Form.Text className="text-muted">{t('SelectDiagnosis')}</Form.Text>
              </Form.Group>
            )}

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
