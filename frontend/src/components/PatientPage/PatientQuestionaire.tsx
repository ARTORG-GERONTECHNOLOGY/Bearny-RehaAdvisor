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

const CONTROL_HEIGHT = 44;
const TEXTAREA_MIN_HEIGHT = 120;

const PatientQuestionaire: React.FC<PatientPopupProps> = ({ patient_id, show, handleClose }) => {
  const { t } = useTranslation();

  const [formData, setFormData] = useState<Record<string, any>>({});
  const [error, setError] = useState<string>('');

  // NEW: field-level backend errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [nonFieldErrors, setNonFieldErrors] = useState<string[]>([]);
  const [details, setDetails] = useState<string | null>(null);

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

    setFieldErrors((prev) => ({ ...prev, [id]: [] })); // clear field error
    setFormData({ ...formData, [id]: value });
  };

  const handleMultiSelectChange = (
    selectedOptions: readonly SelectOption[] | null,
    fieldName: string
  ) => {
    setFieldErrors((prev) => ({ ...prev, [fieldName]: [] }));
    const selectedValues = selectedOptions?.map((o) => o.value) || [];
    setFormData((prev) => ({ ...prev, [fieldName]: selectedValues }));
  };

  const handleSave = async () => {
    setError('');
    setFieldErrors({});
    setNonFieldErrors([]);
    setDetails(null);

    try {
      const res = await apiClient.post(`/users/${patient_id}/initial-questionaire/`, formData);

      if (res.data?.success) {
        handleClose();
        return;
      }

      // Backend responded with error (success=false)
      setError(res.data.message || t('Failed to submit questionnaire.'));
      setFieldErrors(res.data.field_errors || {});
      setNonFieldErrors(res.data.non_field_errors || []);
      setDetails(res.data.details || null);

    } catch (err: any) {
      const backend = err?.response?.data;

      setError(
        backend?.message ||
          backend?.error ||
          err?.message ||
          t('An unexpected error occurred.')
      );

      setFieldErrors(backend?.field_errors || {});
      setNonFieldErrors(backend?.non_field_errors || []);
      setDetails(backend?.details || null);
    }
  };

  const renderField = (field: any) => {
    const fieldValue = formData[field.be_name] || "";
    const errors = fieldErrors[field.be_name];

    const commonProps = {
      name: field.be_name,
      id: field.be_name,
      value: fieldValue,
      onChange: handleChange,
      required: field.required,
      'aria-label': t(field.label),
      className: errors?.length ? "is-invalid" : ""
    };

    if (field.type === 'multi-select') {
      const options =
        field.options?.map((opt: string) => ({ value: opt, label: t(opt) })) || [];

      return (
        <>
          <Select
            id={field.be_name}
            isMulti
            options={options}
            placeholder={t('Select options')}
            value={(fieldValue || []).map((val: string) => ({ value: val, label: t(val) }))}
            onChange={(selected) => handleMultiSelectChange(selected, field.be_name)}
            styles={selectStyles as any}
            menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
            className={errors?.length ? "is-invalid" : ""}
          />
          {errors?.length > 0 && (
            <div className="invalid-feedback d-block">{errors.join(' ')}</div>
          )}
        </>
      );
    }

    if (field.type === 'dropdown') {
      return (
        <>
          <Form.Select {...commonProps} style={{ height: CONTROL_HEIGHT }}>
            <option value="">{t('Select an option')}</option>
            {field.options?.map((opt: string) => (
              <option key={opt} value={opt}>
                {t(opt)}
              </option>
            ))}
          </Form.Select>
          {errors?.length > 0 && (
            <div className="invalid-feedback d-block">{errors.join(' ')}</div>
          )}
        </>
      );
    }

    if (field.type === 'date') {
      return (
        <>
          <Form.Control
            type="date"
            {...commonProps}
            style={{ height: CONTROL_HEIGHT }}
          />
          {errors?.length > 0 && (
            <div className="invalid-feedback d-block">{errors.join(' ')}</div>
          )}
        </>
      );
    }

    if (field.type === 'textarea' || field.type === 'text-long') {
      return (
        <>
          <Form.Control
            as="textarea"
            placeholder={t(field.placeholder || '')}
            {...commonProps}
            style={{ minHeight: TEXTAREA_MIN_HEIGHT, resize: 'vertical' }}
          />
          {errors?.length > 0 && (
            <div className="invalid-feedback d-block">{errors.join(' ')}</div>
          )}
        </>
      );
    }

    return (
      <>
        <Form.Control
          type={field.type || 'text'}
          placeholder={t(field.placeholder || '')}
          {...commonProps}
          style={{ height: CONTROL_HEIGHT }}
        />
        {errors?.length > 0 && (
          <div className="invalid-feedback d-block">{errors.join(' ')}</div>
        )}
      </>
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
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static" keyboard={false} dialogClassName="pq-modal">
      <Modal.Header closeButton>
        <Modal.Title>{t('Initial Questionnaire')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {/* TOP ERROR BANNER */}
        {error && (
          <ErrorAlert message={error} onClose={() => setError('')}>
            {nonFieldErrors.length > 0 && (
              <ul className="mt-2 mb-0">
                {nonFieldErrors.map((e, idx) => (
                  <li key={idx}>{e}</li>
                ))}
              </ul>
            )}

            {details && (
              <pre className="bg-light p-2 mt-2 small border rounded">
                {details}
              </pre>
            )}
          </ErrorAlert>
        )}

        <div className="pq-container mx-auto">
          {config.PatientInitialQuestionaire.map((section, idx) => (
            <div key={idx} className="pq-section mb-4">
              <h5 className="mb-3">{t(section.title)}</h5>

              {section.fields
                .filter((f: any) => !['password', 'repeatPassword'].includes(f.type))
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

      <style>{`
        .pq-modal .modal-body {
          max-height: 70vh;
          overflow: auto;
        }
        .pq-container { max-width: 720px; }
        .pq-section {
          padding: 12px 14px;
          border-radius: 10px;
          background: #fafafa;
          border: 1px solid #eee;
        }
        .pq-label { font-weight: 600; }
      `}</style>
    </Modal>
  );
};

export default PatientQuestionaire;
