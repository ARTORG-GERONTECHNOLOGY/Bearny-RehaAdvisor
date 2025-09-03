// src/components/patient/PatientQuestionaire.tsx
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

const CONTROL_HEIGHT = 44;     // px — standard control height
const TEXTAREA_MIN_HEIGHT = 120; // px — consistent textarea height

const PatientQuestionaire: React.FC<PatientPopupProps> = ({ patient_id, show, handleClose }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [error, setError] = useState<string>('');

  // React-Select styles to standardize control height + make menu appear above modal clipping
  const selectStyles = {
    control: (base: any, state: any) => ({
      ...base,
      minHeight: CONTROL_HEIGHT,
      height: CONTROL_HEIGHT,
      boxShadow: state.isFocused ? '0 0 0 0.2rem rgba(13,110,253,.25)' : base.boxShadow,
      borderColor: state.isFocused ? '#86b7fe' : base.borderColor,
    }),
    valueContainer: (base: any) => ({
      ...base,
      height: CONTROL_HEIGHT,
      padding: '0 8px',
      display: 'flex',
      alignItems: 'center',
    }),
    input: (base: any) => ({
      ...base,
      margin: 0,
      padding: 0,
    }),
    indicatorsContainer: (base: any) => ({
      ...base,
      height: CONTROL_HEIGHT,
    }),
    menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
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
      const options =
        field.options?.map((opt: string) => ({ value: opt, label: t(opt) })) || [];
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
          styles={selectStyles as any}
          menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
        />
      );
    }

    if (field.type === 'dropdown') {
      const options = field.options || [];
      return (
        <Form.Select
          {...commonProps}
          style={{ height: CONTROL_HEIGHT }}
        >
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
          style={{ height: CONTROL_HEIGHT }}
        />
      );
    }

    if (field.type === 'textarea' || field.type === 'text-long') {
      return (
        <Form.Control
          as="textarea"
          placeholder={t(field.placeholder || '')}
          {...commonProps}
          style={{ minHeight: TEXTAREA_MIN_HEIGHT, resize: 'vertical' }}
        />
      );
    }

    // Default: text / number / email / etc.
    return (
      <Form.Control
        type={field.type || 'text'}
        placeholder={t(field.placeholder || '')}
        {...commonProps}
        style={{ height: CONTROL_HEIGHT }}
      />
    );
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
    <Modal
      show={show}
      onHide={handleClose}
      centered
      size="lg"
      backdrop="static"
      keyboard={false}
      dialogClassName="pq-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>{t('Initial Questionnaire')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {error && <ErrorAlert message={error} onClose={() => setError('')} />}

        <div className="pq-container mx-auto">
          {config.PatientInitialQuestionaire.map((section, idx) => (
            <div key={idx} className="pq-section mb-4">
              <h5 className="mb-3">{t(section.title)}</h5>
              {section.fields
                .filter((field: any) => !['password', 'repeatPassword'].includes(field.type))
                .map((field: any, fieldIdx: number) => (
                  <Row key={field.be_name || `${field.label}-${fieldIdx}`} className="pq-field mb-3">
                    <Form.Group as={Col}>
                      <Form.Label className="pq-label">{t(field.label)}</Form.Label>
                      {renderField(field)}
                      {field.help && (
                        <Form.Text className="text-muted">{t(field.help)}</Form.Text>
                      )}
                    </Form.Group>
                  </Row>
                ))}
            </div>
          ))}
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="success" onClick={handleSave}>
          {t('Submit')}
        </Button>
      </Modal.Footer>

      {/* Inline styles keep everything self-contained */}
      <style>{`
        .pq-modal .modal-body {
          max-height: 70vh;
          overflow: auto;
        }

        .pq-container {
          max-width: 720px; /* comfortable reading width */
        }

        .pq-section {
          padding: 12px 14px;
          border-radius: 10px;
          background: #fafafa;
          border: 1px solid #eee;
        }

        .pq-field + .pq-field {
          margin-top: 12px;
        }

        .pq-label {
          font-weight: 600;
        }
      `}</style>
    </Modal>
  );
};

export default PatientQuestionaire;
