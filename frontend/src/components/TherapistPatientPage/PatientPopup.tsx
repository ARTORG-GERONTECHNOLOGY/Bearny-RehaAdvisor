import React, { useEffect, useState } from 'react';
import { Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
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
  const [error, setError] = useState<string>('');
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
    } catch (error) {
      console.error('Error fetching patient data:', error);
      setError(t('Failed to fetch patient data. Please try again later.'));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { id, value } = e.target;
    setFormData({ ...formData, [id]: value });
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
      await apiClient.put(`users/${localStorage.getItem('selectedPatient')}/profile/`, formData);
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating patient data:', error);
    }
  };

  const handleDelete = async () => {
    try {
      await apiClient.delete(`users/${localStorage.getItem('selectedPatient')}/profile/`);
      handleClose();
    } catch (error) {
      console.error('Error deleting patient data:', error);
    }
  };

  const renderField = (field: any) => {
    const fieldValue = formData[field.be_name];
    const isDisabled = !isEditing || field.be_name === 'access_word';
    const commonProps = {
      name: field.be_name,
      id: field.be_name,
      value: fieldValue || '',
      onChange: handleChange,
      disabled: isDisabled,
      required: field.required,
    };

    if (field.type === 'multi-select') {
      const options =
        field.be_name === 'diagnosis' && formData.function?.length
          ? formData.function.flatMap(
              (speciality: string) =>
                specialityDiagnosisMap[speciality]?.map((diag) => ({
                  value: diag,
                  label: t(diag),
                })) || []
            )
          : field.options?.map((opt: string) => ({ value: opt, label: t(opt) }));

      return (
        <Select
          id={field.be_name}
          isMulti
          options={options}
          value={(fieldValue || []).map((val: string) => ({ value: val, label: t(val) }))}
          onChange={(selectedOptions) => handleMultiSelectChange(selectedOptions, field.be_name)}
        />
      );
    }

    if (field.type === 'dropdown') {
      return (
        <Form.Select {...commonProps}>
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
          type="date"
          {...commonProps}
          value={fieldValue ? new Date(fieldValue).toISOString().split('T')[0] : ''}
        />
      );
    }

    return <Form.Control type={field.type} {...commonProps} />;
  };

  if (!patient_id || loading) {
    return (
      <div className="text-center my-4">
        <Spinner animation="border" role="status" />
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
          {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
          {config.PatientForm.map((section, idx) => (
            <div key={idx}>
              <h5 className="mb-3">{t(section.title)}</h5>
              <Row>
                {section.fields
                  .filter((field) => field.type !== 'password' && field.type !== 'repeatPassword')
                  .map((field, fieldIdx) => (
                    <Col md={6} key={fieldIdx}>
                      <Form.Group className="mb-2">
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
              <Button variant="danger" onClick={() => setShowConfirmDelete(true)}>
                {t('DeletePatient')}
              </Button>
            </>
          )}
        </Modal.Footer>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal show={showConfirmDelete} onHide={() => setShowConfirmDelete(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('ConfirmDeletion')}</Modal.Title>
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
