import React, { useState } from 'react';
import { Button } from 'react-bootstrap';
import Select from 'react-select';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import config from '../../config/config.json';
import { useTranslation } from 'react-i18next';

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
      if (
        field.required &&
        (!formData[field.name] ||
          (Array.isArray(formData[field.name]) && (formData[field.name] as string[]).length === 0))
      ) {
        newErrors[field.name] = `${t(field.label)} ${t('is required.')}`;
      }
    });

    if (formData.phone && !/^\d{8,15}$/.test(formData.phone as string)) {
      newErrors.phone = t('Invalid phone number. Enter 8-15 digits only.');
    }

    if (formData.email && currentStep.fields.some((f) => f.name === 'email')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email as string)) {
        newErrors.email = t('Invalid email format.');
      }
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
        if (response.status === 200 || response.status === 201) {
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
    <form onSubmit={handleSubmit}>
      <h3>{t(formSteps[step]?.title)}</h3>

      {formSteps[step]?.fields.map((field) => (
        <div key={field.name} className="mb-3">
          <label htmlFor={field.name} className="form-label">
            {t(field.label)}
          </label>

          {field.type === 'multi-select' ? (
            <Select
              id={field.name}
              isMulti
              options={
                field.name === 'diagnosis' &&
                Array.isArray(formData.function) &&
                formData.function.length > 0
                  ? Array.isArray(formData.function)
                    ? formData.function.flatMap(
                        (spec) =>
                          specialityDiagnosisMap[spec]?.map((diag) => ({
                            value: diag,
                            label: t(diag),
                          })) || []
                      )
                    : []
                  : field.options?.map((option) => ({ value: option, label: t(option) }))
              }
              value={(formData[field.name] as string[]).map((value) => ({ value, label: value }))}
              onChange={(selectedOptions) =>
                handleMultiSelectChange([...selectedOptions], field.name)
              }
            />
          ) : field.type === 'dropdown' ? (
            <select
              id={field.name}
              className={`form-control ${errors[field.name] ? 'is-invalid' : ''}`}
              value={(formData[field.name] as string) || ''}
              onChange={handleChange}
            >
              <option value="">
                {t('Select')} {t(field.label)}
              </option>
              {field.options?.map((option) => (
                <option key={option} value={option}>
                  {t(option)}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.type}
              id={field.name}
              className={`form-control ${errors[field.name] ? 'is-invalid' : ''}`}
              value={(formData[field.name] as string) || ''}
              onChange={handleChange}
            />
          )}

          {errors[field.name] && <div className="text-danger mt-1">{errors[field.name]}</div>}
        </div>
      ))}

      {apiError && <div className="alert alert-danger">{apiError}</div>}
      {registered && (
        <div className="alert alert-success">
          <p>
            {t(
              'The patient has been registered. Account information has been sent to the given email.'
            )}
          </p>
          <p>
            <strong>{t('Patient ID:')}</strong> {patientId}
          </p>
          <p>
            <strong>{t('Access Word:')}</strong> {formData.password}
          </p>
          <Link to="/patient_home">{t('Click here to log in')}</Link>
        </div>
      )}

      <div className="d-flex justify-content-between mt-4">
        {step > 0 && !registered && (
          <Button variant="secondary" onClick={prevStep}>
            {t('Back')}
          </Button>
        )}
        {step < formSteps.length - 1 && !registered && (
          <Button variant="primary" onClick={nextStep}>
            {t('Next')}
          </Button>
        )}
        {step === formSteps.length - 1 && !registered && (
          <Button type="submit" variant="success">
            {t('Submit')}
          </Button>
        )}
      </div>
    </form>
  );
};

export default FormRegisterPatient;
