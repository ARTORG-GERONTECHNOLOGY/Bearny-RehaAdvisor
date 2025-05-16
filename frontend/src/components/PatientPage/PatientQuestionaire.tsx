import React, { useEffect, useState } from 'react';
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
      const payload = {
        ...formData,
        patient_id: patient_id, // support both object or string ID
      };
  
      await apiClient.post(`/users/${patient_id}/initial-questionaire/`, formData);

    } catch (error) {
      console.error('Error updating patient data:', error);
    }
    handleClose();
  };
  

  
  const renderField = (field: any) => {
    const fieldValue = formData[field.be_name];
    const commonProps = {
      name: field.be_name,
      id: field.be_name,
      value: fieldValue || '',
      onChange: handleChange,
      required: field.required,
    };

    if (field.type === 'multi-select') {
      const options = field.options?.map((opt: string) => ({ value: opt, label: t(opt) }));

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

  if (!patient_id) {
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
          <Modal.Title>{t('Initial Questionaire')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
        {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
          {config.PatientInitialQuestionaire.map((section, idx) => (
            <div key={idx}>
              <h5 className="mb-3">{t(section.title)}</h5>
              
                {section.fields
                  .filter((field) => field.type !== 'password' && field.type !== 'repeatPassword')
                  .map((field, fieldIdx) => (
                    <Row>
                      <Form.Group className="mb-2">
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
    </>
  );
};

export default PatientQuestionaire;
