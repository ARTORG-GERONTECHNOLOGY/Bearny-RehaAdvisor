// src/components/TherapistPatientPage/PatientPopup.tsx
/* eslint-disable */
import React, { useEffect, useState } from 'react';
import {
  Button,
  Col,
  Form,
  Modal,
  Row,
  Spinner,
  Tabs,
  Tab,
} from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import Select from 'react-select';
import {
  FaPlus,
  FaMinus,
  FaChartBar,
  FaEdit,
  FaTrash,
  FaCommentDots,
  FaUndo,
  FaDownload,
} from 'react-icons/fa';

import apiClient from '../../api/client';
import authStore from '../../stores/authStore';
import config from '../../config/config.json';
import { PatientType } from '../../types';
import ErrorAlert from '../common/ErrorAlert';

interface PatientPopupProps {
  patient_id: PatientType;
  show: boolean;
  handleClose: () => void;
}

interface SelectOption {
  value: string;
  label: string;
}

/* ---- date helpers ---- */
const toDateInput = (v: any) => {
  if (!v) return '';
  const s = String(v);
  // already yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  // strip timezone shift for date-only inputs
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const toDisplayDate = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(); // e.g. 05.09.2025
};

/* ---- simple FE sanitization ---- */
const sanitize = (v: any): any => {
  if (typeof v === 'string') {
    // remove angle brackets, trim, and limit length
    const cleaned = v.replace(/[<>]/g, '').trim();
    return cleaned.slice(0, 500);
  }
  if (Array.isArray(v)) {
    return v
      .map((item) => (typeof item === 'string' ? sanitize(item) : item))
      .filter((item) => item !== '' && item !== null && item !== undefined);
  }
  return v;
};

// obvious keys we should never send from the FE
const FORBIDDEN_KEYS = [
  'pwdhash',
  'access_word',
  'userId',
  'therapist',
  'role',
  'createdAt',
  'updatedAt',
  'id',
  '_id',
  'last_online',
  'last_online_contact',
];

const PatientPopup: React.FC<PatientPopupProps> = ({
  patient_id,
  show,
  handleClose,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [error, setError] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'characteristics'>(
    'profile'
  );

  const specialityDiagnosisMap: Record<string, string[]> =
    (config as any).patientInfo.functionPat || {};

  useEffect(() => {
    if (
      authStore.isAuthenticated &&
      authStore.userType === 'Therapist' &&
      patient_id
    ) {
      fetchPatientData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient_id]);

  const fetchPatientData = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(
        `users/${patient_id._id}/profile/`
      );
      const fetchedData = response.data || {};
      const normalizedData: Record<string, any> = {};

      // Build defaults based on config sections
      (config as any).PatientForm.forEach((section: any) =>
        section.fields.forEach((field: any) => {
          const key = field.be_name;
          const defaultValue =
            field.type === 'multi-select' ? [] : '';
          normalizedData[key] =
            fetchedData[key] !== undefined
              ? fetchedData[key]
              : defaultValue;
        })
      );

      // Ensure our extra fields exist, map last_online -> last_online_contact
      const withExtras = {
        ...normalizedData,
        ...fetchedData,
        clinic: fetchedData.clinic ?? '',
        last_clinic_visit: fetchedData.last_clinic_visit ?? '',
        last_online_contact: fetchedData.last_online ?? '', // <-- map API field
        level_of_education: fetchedData.level_of_education ?? '',
        professional_status: fetchedData.professional_status ?? '',
        marital_status: fetchedData.marital_status ?? '',
        lifestyle: Array.isArray(fetchedData.lifestyle)
          ? fetchedData.lifestyle
          : [],
        personal_goals: Array.isArray(fetchedData.personal_goals)
          ? fetchedData.personal_goals
          : [],
        social_support: Array.isArray(fetchedData.social_support)
          ? fetchedData.social_support
          : [],
      };

      setFormData(withExtras);
    } catch (err) {
      console.error('Error fetching patient data:', err);
      setError(
        t('Failed to fetch patient data. Please try again later.')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLSelectElement>
      | React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleMultiSelectChange = (
    selectedOptions: readonly SelectOption[] | null,
    fieldName: string
  ) => {
    const selectedValues =
      selectedOptions?.map((option) => option.value) || [];
    setFormData((prev) => ({ ...prev, [fieldName]: selectedValues }));
  };

  const validateInputs = (): boolean => {
    // Email
    if (
      formData.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)
    ) {
      setError(t('Invalid email format.'));
      return false;
    }

    // Phone
    if (
      formData.phone &&
      !/^\+?[0-9]{7,15}$/.test(formData.phone)
    ) {
      setError(t('Invalid phone number format.'));
      return false;
    }

    // Birthdate (common key name; adjust if your config uses something else)
    if (formData.birthdate) {
      const d = new Date(formData.birthdate);
      if (Number.isNaN(d.getTime())) {
        setError(t('Invalid birthdate format.'));
        return false;
      }
      const now = new Date();
      if (d > now) {
        setError(t('Birthdate cannot be in the future.'));
        return false;
      }
    }

    // Some common numeric fields (adapt keys to your config as needed)
    const numericFields = ['height', 'weight', 'bmi'];

    for (const key of numericFields) {
      if (
        formData[key] !== undefined &&
        formData[key] !== null &&
        formData[key] !== ''
      ) {
        if (isNaN(Number(formData[key]))) {
          setError(t('Invalid number entered.'));
          return false;
        }
      }
    }

    // Basic max-length checks for some known text fields
    const maxLengths: Record<string, number> = {
      first_name: 100,
      name: 100,
      clinic: 200,
      level_of_education: 200,
      professional_status: 200,
      marital_status: 200,
      restrictions: 2000,
    };

    for (const [key, maxLen] of Object.entries(maxLengths)) {
      const v = formData[key];
      if (typeof v === 'string' && v.length > maxLen) {
        setError(
          t('Text is too long for field {{field}}', {
            field: t(key),
          })
        );
        return false;
      }
    }

    // Multi-select fields: ensure no empty entries
    for (const key of Object.keys(formData)) {
      if (Array.isArray(formData[key])) {
        const arr = formData[key] as any[];
        if (arr.some((v) => v === '' || v === null || v === undefined)) {
          setError(
            t('Multi-select fields contain invalid or empty entries.')
          );
          return false;
        }
      }
    }

    setError('');
    return true;
  };

  const handleSave = async () => {
    if (!validateInputs()) return;
    try {
      // Remove computed/forbidden fields before sending to API
      const rawPayload: Record<string, any> = { ...formData };
      FORBIDDEN_KEYS.forEach((k) => {
        delete rawPayload[k];
      });

      // Sanitize payload
      const payload: Record<string, any> = {};
      Object.keys(rawPayload).forEach((k) => {
        payload[k] = sanitize(rawPayload[k]);
      });

      await apiClient.put(
        `users/${patient_id._id}/profile/`,
        payload
      );
      setIsEditing(false);
      // refresh to show normalized values after save
      fetchPatientData();
    } catch (err) {
      console.error('Error updating patient data:', err);
      setError(t('Failed to update patient data. Please try again.'));
    }
  };

  const handleDelete = async () => {
    try {
      await apiClient.delete(`users/${patient_id._id}/profile/`);
      fetchPatientData();
    } catch (err) {
      console.error('Error deleting patient:', err);
      setError(t('Failed to delete patient. Please try again.'));
      return;
    }
    handleClose();
  };

  /** Render a config-driven field (Profile tab) */
  const renderField = (field: any) => {
    const key = field.be_name;
    const fieldValue = formData[key];
    const isDisabled = !isEditing || key === 'access_word'; // keep original access_word protection

    if (field.type === 'multi-select') {
      const options =
        key === 'diagnosis' && formData.function?.length
          ? formData.function.flatMap((spec: string) =>
              (specialityDiagnosisMap[spec] || []).map((diag) => ({
                value: diag,
                label: t(diag),
              }))
            )
          : (field.options || []).map((opt: string) => ({
              value: opt,
              label: t(opt),
            }));

      return (
        <Select
          inputId={key}
          isMulti
          isDisabled={isDisabled}
          options={options}
          value={(fieldValue || []).map((val: string) => ({
            value: val,
            label: t(val),
          }))}
          onChange={(selected) =>
            handleMultiSelectChange(selected, key)
          }
          aria-label={t(field.label)}
        />
      );
    }

    if (field.type === 'dropdown') {
      return (
        <Form.Select
          id={key}
          value={fieldValue || ''}
          onChange={handleChange}
          disabled={isDisabled}
          aria-label={t(field.label)}
        >
          <option value="">{t('Select an option')}</option>
          {(field.options || []).map((opt: string) => (
            <option key={opt} value={opt}>
              {t(opt)}
            </option>
          ))}
        </Form.Select>
      );
    }

    if (field.type === 'date') {
      return (
        <Form.Control
          id={key}
          type="date"
          value={toDateInput(fieldValue)}
          onChange={handleChange}
          disabled={isDisabled}
          aria-label={t(field.label)}
        />
      );
    }

    const commonMaxLength =
      field.type === 'text' || !field.type ? 500 : undefined;

    return (
      <Form.Control
        id={key}
        type={field.type}
        value={fieldValue || ''}
        onChange={handleChange}
        disabled={isDisabled}
        aria-label={t(field.label)}
        maxLength={commonMaxLength}
      />
    );
  };

  if (!patient_id || loading) {
    return (
      <div className="text-center my-4">
        <Spinner
          animation="border"
          role="status"
          aria-label={t('Loading')}
        />
        <p className="mt-3">{t('Loading')}...</p>
      </div>
    );
  }

  // Helpers for Characteristics tab (comma-separated editing)
  const arrayToDisplay = (arr: any) =>
    Array.isArray(arr) ? arr.join(', ') : '';
  const handleCommaSeparatedChange = (id: string, value: string) => {
    const list = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setFormData((prev) => ({ ...prev, [id]: list }));
  };

  return (
    <>
      <Modal
        show={show}
        onHide={handleClose}
        centered
        size="lg"
        backdrop="static"
        keyboard={false}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {formData.first_name || ''}{' '}
            {formData.name || t('Patient')}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && (
            <ErrorAlert
              message={error}
              onClose={() => setError('')}
            />
          )}

          <Tabs
            id="patient-details-tabs"
            activeKey={activeTab}
            onSelect={(k) =>
              setActiveTab((k as any) || 'profile')
            }
            className="mb-3"
          >
            {/* ===== Profile ===== */}
            <Tab eventKey="profile" title={t('Profile')}>
              {/* Contacts section */}
              <div className="mb-4">
                <h5 className="mb-3">{t('Contacts')}</h5>
                <Row className="g-3">
                  <Col xs={12} md={6}>
                    <Form.Group controlId="last_online_contact">
                      <Form.Label>
                        {t('Last online visit')}
                      </Form.Label>
                      {/* Always read-only (computed) but visible */}
                      <Form.Control
                        plaintext
                        readOnly
                        value={
                          toDisplayDate(
                            formData.last_online_contact
                          ) || '—'
                        }
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={6}>
                    <Form.Group controlId="last_clinic_visit">
                      <Form.Label>
                        {t('Last clinic visit')}
                      </Form.Label>
                      {isEditing ? (
                        <Form.Control
                          id="last_clinic_visit"
                          type="date"
                          value={toDateInput(
                            formData.last_clinic_visit
                          )}
                          onChange={handleChange}
                        />
                      ) : (
                        <Form.Control
                          plaintext
                          readOnly
                          value={
                            toDisplayDate(
                              formData.last_clinic_visit
                            ) || '—'
                          }
                        />
                      )}
                    </Form.Group>
                  </Col>

                  <Col xs={12}>
                    <Form.Group controlId="clinic">
                      <Form.Label>{t('Clinics')}</Form.Label>
                      <Form.Control
                        id="clinic"
                        type="text"
                        value={formData.clinic || ''}
                        onChange={handleChange}
                        disabled={!isEditing}
                        placeholder={t(
                          'e.g. Inselspital Bern'
                        )}
                        maxLength={200}
                      />
                    </Form.Group>
                  </Col>
                </Row>
              </div>

              {(config as any).PatientForm.map(
                (section: any, idx: number) => (
                  <div key={idx} className="mb-4">
                    <h5 className="mb-3">
                      {t(section.title)}
                    </h5>
                    <Row className="g-3">
                      {section.fields
                        .filter(
                          (f: any) =>
                            ![
                              'password',
                              'repeatPassword',
                            ].includes(f.type)
                        )
                        .map(
                          (
                            field: any,
                            index: number
                          ) => (
                            <Col
                              xs={12}
                              md={6}
                              key={`${section.title}-${field.be_name}-${index}`}
                            >
                              <Form.Group
                                controlId={field.be_name}
                              >
                                <Form.Label>
                                  {t(field.label)}
                                </Form.Label>
                                {renderField(field)}
                              </Form.Group>
                            </Col>
                          )
                        )}
                    </Row>
                  </div>
                )
              )}
            </Tab>

            {/* ===== Characteristics ===== */}
            <Tab
              eventKey="characteristics"
              title={t('Characteristics')}
            >
              <Row className="g-3">
                <Col xs={12} md={6}>
                  <Form.Group controlId="level_of_education">
                    <Form.Label>
                      {t('Level of education')}
                    </Form.Label>
                    <Form.Control
                      id="level_of_education"
                      type="text"
                      value={
                        formData.level_of_education || ''
                      }
                      onChange={handleChange}
                      disabled={!isEditing}
                      maxLength={200}
                    />
                  </Form.Group>
                </Col>

                <Col xs={12} md={6}>
                  <Form.Group controlId="professional_status">
                    <Form.Label>
                      {t('Professional status')}
                    </Form.Label>
                    <Form.Control
                      id="professional_status"
                      type="text"
                      value={
                        formData.professional_status || ''
                      }
                      onChange={handleChange}
                      disabled={!isEditing}
                      maxLength={200}
                    />
                  </Form.Group>
                </Col>

                <Col xs={12} md={6}>
                  <Form.Group controlId="marital_status">
                    <Form.Label>
                      {t('Marital status')}
                    </Form.Label>
                    <Form.Control
                      id="marital_status"
                      type="text"
                      value={
                        formData.marital_status || ''
                      }
                      onChange={handleChange}
                      disabled={!isEditing}
                      maxLength={200}
                    />
                  </Form.Group>
                </Col>

                <Col xs={12} md={6}>
                  <Form.Group controlId="lifestyle">
                    <Form.Label>
                      {t(
                        'Lifestyle (comma separated)'
                      )}
                    </Form.Label>
                    <Form.Control
                      id="lifestyle"
                      type="text"
                      value={arrayToDisplay(
                        formData.lifestyle
                      )}
                      onChange={(e) =>
                        handleCommaSeparatedChange(
                          'lifestyle',
                          e.target.value
                        )
                      }
                      disabled={!isEditing}
                      placeholder={t(
                        'e.g. Non-smoker, Active, Vegetarian'
                      )}
                      maxLength={1000}
                    />
                  </Form.Group>
                </Col>

                <Col xs={12} md={6}>
                  <Form.Group controlId="personal_goals">
                    <Form.Label>
                      {t(
                        'Personal goals (comma separated)'
                      )}
                    </Form.Label>
                    <Form.Control
                      id="personal_goals"
                      type="text"
                      value={arrayToDisplay(
                        formData.personal_goals
                      )}
                      onChange={(e) =>
                        handleCommaSeparatedChange(
                          'personal_goals',
                          e.target.value
                        )
                      }
                      disabled={!isEditing}
                      placeholder={t(
                        'e.g. Walk 30 min daily, Return to work'
                      )}
                      maxLength={1000}
                    />
                  </Form.Group>
                </Col>

                <Col xs={12} md={6}>
                  <Form.Group controlId="social_support">
                    <Form.Label>
                      {t(
                        'Social support (comma separated)'
                      )}
                    </Form.Label>
                    <Form.Control
                      id="social_support"
                      type="text"
                      value={arrayToDisplay(
                        formData.social_support
                      )}
                      onChange={(e) =>
                        handleCommaSeparatedChange(
                          'social_support',
                          e.target.value
                        )
                      }
                      disabled={!isEditing}
                      placeholder={t(
                        'e.g. Family, Friends, Community group'
                      )}
                      maxLength={1000}
                    />
                  </Form.Group>
                </Col>

                <Col xs={12}>
                  <Form.Group controlId="restrictions">
                    <Form.Label>
                      {t('Restrictions')}
                    </Form.Label>
                    <Form.Control
                      id="restrictions"
                      as="textarea"
                      rows={3}
                      value={formData.restrictions || ''}
                      onChange={handleChange}
                      disabled={!isEditing}
                      maxLength={2000}
                    />
                  </Form.Group>
                </Col>
              </Row>
            </Tab>
          </Tabs>
        </Modal.Body>

        <Modal.Footer>
          {isEditing ? (
            <>
              <Button
                variant="secondary"
                onClick={() => setIsEditing(false)}
              >
                <FaUndo className="me-2" />
                {t('Cancel')}
              </Button>
              <Button
                variant="success"
                onClick={handleSave}
              >
                <FaDownload className="me-2" />
                {t('SaveChanges')}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="warning"
                onClick={() => setIsEditing(true)}
              >
                <FaEdit className="me-2" />
                {t('Edit')}
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  setShowConfirmDelete(true)
                }
                aria-label={t('DeletePatient')}
              >
                <FaTrash className="me-2" />
                {t('DeletePatient')}
              </Button>
            </>
          )}
        </Modal.Footer>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        show={showConfirmDelete}
        onHide={() => setShowConfirmDelete(false)}
        centered
        aria-labelledby="delete-confirmation-title"
      >
        <Modal.Header closeButton>
          <Modal.Title id="delete-confirmation-title">
            {t('ConfirmDeletion')}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>{t('DeleteConfirPAt')}</p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowConfirmDelete(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
          >
            {t('Delete')}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default PatientPopup;
