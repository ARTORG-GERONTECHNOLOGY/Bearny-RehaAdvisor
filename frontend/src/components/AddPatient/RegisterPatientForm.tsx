// src/components/HomePage/RegisterPatient.tsx
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
  patient_code: '',
  therapist,
  firstName: '',
  lastName: '',
  age: '',                 // birth date (YYYY-MM-DD)
  sex: '',
  function: [],
  diagnosis: [],
  lifestyle: [],
  lifeGoals: [],
  phone: '',
  restrictions: '',
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

  const formSteps = (config as any).PatientForm;
  const specialityDiagnosisMap: Record<string, string[]> = (config as any).patientInfo.functionPat;

  // ---- helpers ----
  const isValidDate = (s: string) => {
    const d = new Date(s);
    return !Number.isNaN(d.getTime());
  };

  const calcAgeYears = (dobStr: string) => {
    const dob = new Date(dobStr);
    const today = new Date();
    let years = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) years -= 1;
    return years;
  };

  const validateAge = (value: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (!value) {
        delete next.age;
        return next;
      }
      if (!isValidDate(value)) {
        next.age = t('Enter a valid birth date (YYYY-MM-DD).');
        return next;
      }
      const dob = new Date(value);
      const today = new Date();
      if (dob > today) {
        next.age = t('Birth date cannot be in the future.');
        return next;
      }
      const years = calcAgeYears(value);
      if (years < 0 || years > 120) {
        next.age = t('Enter a realistic birth date (0–120 years).');
        return next;
      }
      delete next.age;
      return next;
    });
  };

  // ---- handlers ----
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => ({ ...prev, [id]: '' }));
    if (id === 'age') validateAge(value);
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

    currentStep.fields.forEach((field: any) => {
      const value = formData[field.name] as any;
      const isEmpty =
        value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
      if (field.required && isEmpty) {
        newErrors[field.name] = `${t(field.label)} ${t('is required.')}`;
      }
    });

    if (formData.phone && !/^\d{8,15}$/.test(formData.phone as string)) {
      newErrors.phone = t('Invalid phone number. Enter 8-15 digits only.');
    }

    if (
      formData.email &&
      currentStep.fields.some((f: any) => f.name === 'email') &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email as string)
    ) {
      newErrors.email = t('Invalid email format.');
    }

    if (currentStep.fields.some((f: any) => f.name === 'password')) {
      if (formData.password !== formData.repeatPassword) {
        newErrors.repeatPassword = t('Passwords do not match.');
      }
    }

    if (currentStep.fields.some((f: any) => f.name === 'age')) {
      const val = String(formData.age || '');
      if (val) {
        if (!isValidDate(val)) {
          newErrors.age = t('Enter a valid birth date (YYYY-MM-DD).');
        } else if (new Date(val) > new Date()) {
          newErrors.age = t('Birth date cannot be in the future.');
        } else {
          const years = calcAgeYears(val);
          if (years < 0 || years > 120) {
            newErrors.age = t('Enter a realistic birth date (0–120 years).');
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep() && step < formSteps.length - 1) {
      setStep((prev) => prev + 1);
      setApiError(null);
    }
  };

  const prevStep = () => {
    if (step > 0) setStep((prev) => prev - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    if (!validateStep()) return;

    try {
      const response = await apiClient.post('/auth/register/', formData);
      if ([200, 201].includes(response.status)) {
        setRegistered(true);
        setPatientId(response.data?.id || null);
      }
    } catch (error: any) {
      const backendMsg =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        error?.message ||
        error;
      setApiError(backendMsg || t('An unexpected error occurred. Please try again.'));
    }
  };

  const currentFields: any[] = formSteps[step]?.fields || [];

  return (
    <Form onSubmit={handleSubmit}>
      <div className="d-flex justify-content-between align-items-end mb-2">
        <h4 className="mb-0">{t(formSteps[step]?.title)}</h4>
        <small className="text-muted">
          <span className="text-danger">*</span> {t('required')}
        </small>
      </div>

      {/* Server-side error banner */}
      {apiError && <div className="alert alert-danger">{apiError}</div>}

      {currentFields.map((field) => {
        const isMulti = field.type === 'multi-select';
        const isDropdown = field.type === 'dropdown';
        const required = !!field.required;

        // Force birth date to use a date picker
        const inputType = field.name === 'age' ? 'date' : field.type;

        return (
          <Form.Group controlId={field.name} className="mb-3" key={field.name}>
            <Form.Label className="d-flex align-items-center gap-1">
              <span>
                {t(field.label)}
                {required && (
                  <>
                    <span className="text-danger" aria-hidden="true"> *</span>
                    <span className="visually-hidden"> {t('required')}</span>
                  </>
                )}
              </span>
              {field.tooltip && <InfoBubble tooltip={t(field.tooltip)} />}
            </Form.Label>

            {isMulti ? (
              <Select
                inputId={field.name}
                isMulti
                aria-required={required}
                aria-invalid={!!errors[field.name]}
                options={
                  field.name === 'diagnosis' &&
                  Array.isArray(formData.function) &&
                  (formData.function as string[]).length > 0
                    ? (formData.function as string[]).flatMap(
                        (spec: string) =>
                          (specialityDiagnosisMap[spec] || []).map((diag) => ({
                            value: diag,
                            label: t(diag),
                          }))
                      )
                    : (field.options || []).map((option: string) => ({
                        value: option,
                        label: t(option),
                      }))
                }
                value={((formData[field.name] as string[]) || []).map((v) => ({
                  value: v,
                  label: t(v),
                }))}
                onChange={(options) => handleMultiSelectChange(options, field.name)}
              />
            ) : isDropdown ? (
              <Form.Control
                as="select"
                value={String(formData[field.name] || '')}
                onChange={handleChange}
                isInvalid={!!errors[field.name]}
                required={required}
                aria-required={required}
                aria-invalid={!!errors[field.name]}
              >
                <option value="">{t('Select')} {t(field.label)}</option>
                {(field.options || []).map((option: string) => (
                  <option key={option} value={option}>
                    {t(option)}
                  </option>
                ))}
              </Form.Control>
            ) : (
              <Form.Control
                type={inputType}
                value={String(formData[field.name] ?? '')}
                onChange={handleChange}
                isInvalid={!!errors[field.name]}
                required={required}
                aria-required={required}
                aria-invalid={!!errors[field.name]}
                placeholder={field.name === 'age' ? 'YYYY-MM-DD' : undefined}
                onBlur={field.name === 'age' ? (e) => validateAge(e.currentTarget.value) : undefined}
              />
            )}

            {errors[field.name] && (
              <Form.Text className="text-danger">{errors[field.name]}</Form.Text>
            )}
          </Form.Group>
        );
      })}

      {registered ? (
        <div className="alert alert-success mt-4">
          <p>
            {t('The patient has been registered. Account information has been sent to the given email.')}
          </p>
          {patientId && (
            <p>
              <strong>{t('Patient ID:')}</strong> {patientId}
            </p>
          )}
          <Link to="/">{t('Click here to log in')}</Link>
        </div>
      ) : (
        <div className="d-flex justify-content-between mt-4">
          {step > 0 && (
            <Button variant="secondary" onClick={prevStep}>
              {t('Back')}
            </Button>
          )}
          {step < formSteps.length - 1 ? (
            <Button variant="primary" onClick={nextStep}>
              {t('Next')}
            </Button>
          ) : (
            <Button type="submit" variant="success">
              {t('Submit')}
            </Button>
          )}
        </div>
      )}
    </Form>
  );
};

export default FormRegisterPatient;
