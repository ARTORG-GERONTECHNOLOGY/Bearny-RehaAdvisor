import React, { useState } from 'react';
import { Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import Select from 'react-select';
import apiClient from '../../api/client';
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

const PatientQuestionaire: React.FC<PatientPopupProps> = ({ patient_id, show, handleClose }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [error, setError] = useState<string>('');

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

  const handleSave = async () => {
    try {
      await apiClient.post(`/users/${patient_id}/initial-questionaire/`, {
        ...formData,
        patient_id,
      });
      handleClose();
    } catch (err: any) {
      console.error('Error saving questionnaire:', err);
      setError(t('Failed to submit questionnaire'));
    }
  };

  const renderField = (field: any) => {
    const fieldValue = formData[field.be_name];
    const commonProps = {
      name: field.be_name,
      id: field.be_name,
      value: fieldValue || '',
      onChange: handleChange,
      required: field.required,
      'aria-label': t(field.label),
    };

    if (field.type === 'multi-select') {
      const options = field.options?.map((opt: string) => ({ value: opt, label: t(opt) })) || [];
      return (
        <Select
          id={field.be_name}
          isMulti
          options={options}
          placeholder={t('Select options')}
          value={(fieldValue || []).map((val: string) => ({
            value: val,
            label: t(val),
          }))}
          onChange={(selected) => handleMultiSelectChange(selected, field.be_name)}
        />
      );
    }

    if (field.type === 'dropdown') {
      const options = field.options || [];
      return (
        <Form.Select {...commonProps}>
          <option value="">{t('Select an option')}</option>
          {options.map((opt: string) => (
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

    return <Form.Control type={field.type} placeholder={t(field.placeholder || '')} {...commonProps} />;
  };

  if (!patient_id) {
    return (
      <div className="text-center my-4">
        <Spinner animation="border" role="status" />
        <p className="mt-3">{t('Loading')}...</p>
      </div>
    );
  }

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>{t('Initial Questionnaire')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <ErrorAlert message={error} onClose={() => setError('')} />}
        {config.PatientInitialQuestionaire.map((section, idx) => (
          <div key={idx} className="mb-4">
            <h5 className="mb-3">{t(section.title)}</h5>
            {section.fields
              .filter((field) => !['password', 'repeatPassword'].includes(field.type))
              .map((field, fieldIdx) => (
                <Row key={field.be_name || `${field.label}-${fieldIdx}`} className="mb-3">
                  <Form.Group as={Col}>
                    <Form.Label>{t(field.label)}</Form.Label>
                    {renderField(field)}
                  </Form.Group>
                </Row>
              ))}
          </div>
        ))}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="success" onClick={handleSave}>
          {t('Submit')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PatientQuestionaire;
