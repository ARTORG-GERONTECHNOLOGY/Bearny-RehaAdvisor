import React, { useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import Select from 'react-select';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import config from '../../config/config.json';
import { useTranslation } from 'react-i18next';
import InfoBubble from '../common/InfoBubble';

interface FormData {
  [key: string]: string | number | string[] | boolean;
}

interface RegisterFormProps {
  therapist: string;
}

const initialFormData = (therapist: string): FormData => ({
  email: '',
  password: '',
  repeatPassword: '',
  userType: 'Patient',
  therapist,
  firstName: '',
  lastName: '',
  age: '',
  sex: '',
  function: [],
  diagnosis: [],
  lifestyle: [],
  lifeGoals: [],
  phone: '',
  medicationIntake: '',
  professionalStatus: '',
  levelOfEducation: '',
  civilStatus: '',
  socialSupport: [],
  rehaEndDate: '',
  careGiver: '',
});

const FormRegisterPatient: React.FC<RegisterFormProps> = ({ therapist }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<FormData>(initialFormData(therapist));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [registered, setRegistered] = useState(false);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const formSteps = config.PatientForm;
  const specialityDiagnosisMap: Record<string, string[]> = config.patientInfo.functionPat;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => ({ ...prev, [id]: '' }));
  };

  const handleMultiSelectChange = (
    selectedOptions: { value: string; label: string }[] | null,
    fieldName: string
  ) => {
    const selectedValues = selectedOptions?.map((option) => option.value) || [];
    setFormData((prev) => ({ ...prev, [fieldName]: selectedValues }));
    setErrors((prev) => ({ ...prev, [fieldName]: '' }));
  };

  const validateStep = (): boolean => {
    const newErrors: Record<string, string> = {};
    const currentStep = formSteps[step];

    currentStep.fields.forEach((field) => {
      const value = formData[field.name];
      const isEmpty =
        !value || (Array.isArray(value) && value.length === 0) || value === undefined;

      if (field.required && isEmpty) {
        newErrors[field.name] = `${t(field.label)} ${t('is required.')}`;
      }
    });

    if (formData.phone && !/^\d{8,15}$/.test(formData.phone as string)) {
      newErrors.phone = t('Invalid phone number. Enter 8-15 digits only.');
    }

    if (
      formData.email &&
      currentStep.fields.some((f) => f.name === 'email') &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email as string)
    ) {
      newErrors.email = t('Invalid email format.');
    }

    if (
      currentStep.fields.some((f) => f.name === 'password') &&
      formData.password !== formData.repeatPassword
    ) {
      newErrors.repeatPassword = t('Passwords do not match.');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep() && step < formSteps.length - 1) {
      setStep((prev) => prev + 1);
    }
  };

  const prevStep = () => {
    if (step > 0) setStep((prev) => prev - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (validateStep()) {
      try {
        const response = await apiClient.post('/auth/register/', formData);
        if ([200, 201].includes(response.status)) {
          setRegistered(true);
          setPatientId(response.data.id);
        }
      } catch (error: any) {
        const message =
          error.response?.data?.error || t('An unexpected error occurred. Please try again.');
        setApiError(message);
      }
    }
  };

  return (
    <Form onSubmit={handleSubmit}>
      <h4 className="mb-4">{t(formSteps[step]?.title)}</h4>

      {formSteps[step]?.fields.map((field) => (
        <Form.Group controlId={field.name} className="mb-3" key={field.name}>
          <Form.Label>
            {t(field.label)}
            {field.tooltip && <InfoBubble tooltip={t(field.tooltip)} />}
          </Form.Label>

          {field.type === 'multi-select' ? (
            <Select
              isMulti
              id={field.name}
              options={
                field.name === 'diagnosis' && Array.isArray(formData.function) && formData.function.length > 0
                  ? formData.function.flatMap(
                      (spec) =>
                        specialityDiagnosisMap[spec]?.map((diag) => ({
                          value: diag,
                          label: t(diag),
                        })) || []
                    )
                  : field.options?.map((option) => ({ value: option, label: t(option) })) || []
              }
              value={(formData[field.name] as string[]).map((v) => ({ value: v, label: t(v) }))}
              onChange={(options) => handleMultiSelectChange(options, field.name)}
            />
          ) : field.type === 'dropdown' ? (
            <Form.Control
              as="select"
              value={(formData[field.name] as string) || ''}
              onChange={handleChange}
              isInvalid={!!errors[field.name]}
            >
              <option value="">{t('Select')} {t(field.label)}</option>
              {field.options?.map((option) => (
                <option key={option} value={option}>
                  {t(option)}
                </option>
              ))}
            </Form.Control>
          ) : (
            <Form.Control
              type={field.type}
              value={(formData[field.name] as string) || ''}
              onChange={handleChange}
              isInvalid={!!errors[field.name]}
            />
          )}

          {errors[field.name] && (
            <Form.Text className="text-danger">{errors[field.name]}</Form.Text>
          )}
        </Form.Group>
      ))}

      {apiError && <div className="alert alert-danger">{apiError}</div>}

      {registered ? (
        <div className="alert alert-success mt-4">
          <p>{t('The patient has been registered. Account information has been sent to the given email.')}</p>
          <p><strong>{t('Patient ID:')}</strong> {patientId}</p>
          <p><strong>{t('Access Word:')}</strong> {formData.password}</p>
          <Link to="/">{t('Click here to log in')}</Link>
        </div>
      ) : (
        <div className="d-flex justify-content-between mt-4">
          {step > 0 && <Button variant="secondary" onClick={prevStep}>{t('Back')}</Button>}
          {step < formSteps.length - 1 && <Button variant="primary" onClick={nextStep}>{t('Next')}</Button>}
          {step === formSteps.length - 1 && <Button type="submit" variant="success">{t('Submit')}</Button>}
        </div>
      )}
    </Form>
  );
};

export default FormRegisterPatient;
