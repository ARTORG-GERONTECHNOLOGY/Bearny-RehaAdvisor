import React, { useEffect, useState } from 'react';
import {
  Button,
  Col,
  Form,
  Modal,
  Row,
  Spinner,
  Alert,
} from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import Select from 'react-select';
import apiClient from '../../api/client';
import authStore from '../../stores/authStore';
import config from '../../config/config.json';
import { PatientType } from '../../types/index';
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

const PatientPopup: React.FC<PatientPopupProps> = ({ patient_id, show, handleClose }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [error, setError] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const specialityDiagnosisMap: Record<string, string[]> = config.patientInfo.functionPat;

  useEffect(() => {
    if (authStore.isAuthenticated && authStore.userType === 'Therapist' && patient_id) {
      fetchPatientData();
    }
  }, [patient_id]);

  const fetchPatientData = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`users/${patient_id._id}/profile/`);
      const fetchedData = response.data || {};
      const normalizedData: Record<string, any> = {};

      config.PatientForm.forEach((section) =>
        section.fields.forEach((field) => {
          const key = field.be_name;
          const defaultValue = field.type === 'multi-select' ? [] : '';
          normalizedData[key] = fetchedData[key] !== undefined ? fetchedData[key] : defaultValue;
        })
      );

      setFormData({ ...normalizedData, ...fetchedData });
    } catch (err) {
      console.error('Error fetching patient data:', err);
      setError(t('Failed to fetch patient data. Please try again later.'));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleMultiSelectChange = (
    selectedOptions: readonly SelectOption[] | null,
    fieldName: string
  ) => {
    const selectedValues = selectedOptions?.map((option) => option.value) || [];
    setFormData((prev) => ({ ...prev, [fieldName]: selectedValues }));
  };

  const validateInputs = (): boolean => {
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError(t('Invalid email format.'));
      return false;
    }
    if (formData.phone && !/^\+?[0-9]{7,15}$/.test(formData.phone)) {
      setError(t('Invalid phone number format.'));
      return false;
    }
    setError('');
    return true;
  };

  const handleSave = async () => {
    if (!validateInputs()) return;
    try {
      await apiClient.put(`users/${patient_id._id}/profile/`, formData);
      setIsEditing(false);
    } catch (err) {
      console.error('Error updating patient data:', err);
      setError(t('Failed to update patient data. Please try again.'));
    }
  };

  const handleDelete = async () => {
    try {
      await apiClient.delete(`users/${patient_id._id}/profile/`);
      handleClose();
    } catch (err) {
      console.error('Error deleting patient:', err);
      setError(t('Failed to delete patient. Please try again.'));
    }
  };

  const renderField = (field: any) => {
    const fieldValue = formData[field.be_name];
    const isDisabled = !isEditing || field.be_name === 'access_word';
    const fieldId = `field-${field.be_name}`;

    if (field.type === 'multi-select') {
      const options =
        field.be_name === 'diagnosis' && formData.function?.length
          ? formData.function.flatMap(
              (spec: string) =>
                specialityDiagnosisMap[spec]?.map((diag) => ({
                  value: diag,
                  label: t(diag),
                })) || []
            )
          : field.options?.map((opt: string) => ({
              value: opt,
              label: t(opt),
            })) || [];

      return (
        <Select
          inputId={fieldId}
          isMulti
          isDisabled={isDisabled}
          options={options}
          value={(fieldValue || []).map((val: string) => ({
            value: val,
            label: t(val),
          }))}
          onChange={(selected) => handleMultiSelectChange(selected, field.be_name)}
          aria-label={t(field.label)}
        />
      );
    }

    if (field.type === 'dropdown') {
      return (
        <Form.Select
          id={fieldId}
          value={fieldValue || ''}
          onChange={handleChange}
          disabled={isDisabled}
          aria-label={t(field.label)}
        >
          <option value="">{t('Select an option')}</option>
          {field.options.map((opt: string) => (
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
          id={fieldId}
          type="date"
          value={fieldValue ? new Date(fieldValue).toISOString().split('T')[0] : ''}
          onChange={handleChange}
          disabled={isDisabled}
          aria-label={t(field.label)}
        />
      );
    }

    return (
      <Form.Control
        id={fieldId}
        type={field.type}
        value={fieldValue || ''}
        onChange={handleChange}
        disabled={isDisabled}
        aria-label={t(field.label)}
      />
    );
  };

  if (!patient_id || loading) {
    return (
      <div className="text-center my-4">
        <Spinner animation="border" role="status" aria-label={t('Loading')} />
        <p className="mt-3">{t('Loading')}...</p>
      </div>
    );
  }

  return (
    <>
      <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static" keyboard={false}>
        <Modal.Header closeButton>
          <Modal.Title>{formData.name || t('Patient')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <ErrorAlert message={error} onClose={() => setError('')} />}
          {config.PatientForm.map((section, idx) => (
            <div key={idx} className="mb-4">
              <h5 className="mb-3">{t(section.title)}</h5>
              <Row className="g-3">
                {section.fields
                  .filter((f) => !['password', 'repeatPassword'].includes(f.type))
                  .map((field, index) => (
                    <Col xs={12} md={6} key={index}>
                      <Form.Group controlId={`field-${field.be_name}`}>
                        <Form.Label>{t(field.label)}</Form.Label>
                        {renderField(field)}
                      </Form.Group>
                    </Col>
                  ))}
              </Row>
            </div>
          ))}
        </Modal.Body>
        <Modal.Footer>
          {isEditing ? (
            <>
              <Button variant="secondary" onClick={() => setIsEditing(false)}>
                {t('Cancel')}
              </Button>
              <Button variant="success" onClick={handleSave}>
                {t('SaveChanges')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="warning" onClick={() => setIsEditing(true)}>
                {t('Edit')}
              </Button>
              <Button
                variant="danger"
                onClick={() => setShowConfirmDelete(true)}
                aria-label={t('DeletePatient')}
              >
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
          <Modal.Title id="delete-confirmation-title">{t('ConfirmDeletion')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>{t('DeleteConfirPAt')}</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowConfirmDelete(false)}>
            {t('Cancel')}
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            {t('Delete')}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default PatientPopup;
