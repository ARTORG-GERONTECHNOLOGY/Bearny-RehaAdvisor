// src/components/HomePage/RegisterPatient.tsx
import React, { useEffect, useMemo, useState } from 'react';
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

type BackendErrorPayload = {
  success?: boolean;
  message?: string;
  error?: string;
  detail?: string;
  field_errors?: Record<string, string[]>;
  non_field_errors?: string[];
  details?: string;
};

const initialFormData = (therapist: string): FormData => ({
  email: '',
  password: '',
  repeatPassword: '',
  initialQuestionnaireEnabled: false,
  userType: 'Patient',
  patient_code: '',
  therapist,
  firstName: '',
  lastName: '',
  age: '', // birth date (YYYY-MM-DD)
  sex: '',
  clinic: '',
  project: '',
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

  const [therapistClinics, setTherapistClinics] = useState<string[]>([]);
  const [therapistProjects, setTherapistProjects] = useState<string[]>([]);

  useEffect(() => {
    if (!therapist) return;
    apiClient
      .get(`/users/${therapist}/profile/`)
      .then((res) => {
        setTherapistClinics(res.data?.clinics || []);
        setTherapistProjects(res.data?.projects || []);
      })
      .catch(() => {});
  }, [therapist]);

  // field-level client validation (per step)
  const [errors, setErrors] = useState<Record<string, string>>({});

  // server errors (banner + field mapping)
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiFieldErrors, setApiFieldErrors] = useState<Record<string, string>>({});

  const [registered, setRegistered] = useState(false);
  const [patientId, setPatientId] = useState<string | null>(null);

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

  const clearServerErrors = () => {
    setApiError(null);
    setApiFieldErrors({});
  };

  const prettifyServerErrors = (payload: BackendErrorPayload | any) => {
    const msg =
      payload?.message ||
      payload?.error ||
      payload?.detail ||
      (typeof payload === 'string' ? payload : '') ||
      '';

    const fieldErrs: Record<string, string> = {};
    if (payload?.field_errors && typeof payload.field_errors === 'object') {
      Object.entries(payload.field_errors).forEach(([k, arr]) => {
        const val = Array.isArray(arr) ? arr.join(' ') : String(arr);
        fieldErrs[k] = val;
      });
    }

    const nonField = Array.isArray(payload?.non_field_errors)
      ? payload.non_field_errors.join(' ')
      : '';
    const details = payload?.details ? String(payload.details) : '';

    // Build a human readable banner message (no JSON)
    const parts = [msg, nonField, details].filter(Boolean);
    const banner = parts.join(' ');

    return { banner: banner || t('An unexpected error occurred. Please try again.'), fieldErrs };
  };

  // ---- handlers ----
  const clinicProjectsMap: Record<string, string[]> =
    (config as any).therapistInfo?.clinic_projects || {};

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    // When clinic changes, reset project
    if (id === 'clinic') {
      setFormData((prev) => ({ ...prev, clinic: value, project: '' }));
    } else {
      setFormData((prev) => ({ ...prev, [id]: value }));
    }

    // clear client + server error for this field on change
    setErrors((prev) => ({ ...prev, [id]: '' }));
    setApiFieldErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    // clear banner if user edits
    setApiError(null);

    if (id === 'age') validateAge(value);
  };

  const handleMultiSelectChange = (
    selectedOptions: { value: string; label: string }[] | null,
    fieldName: string
  ) => {
    const selectedValues = selectedOptions?.map((option) => option.value) || [];
    setFormData((prev) => ({ ...prev, [fieldName]: selectedValues }));

    // clear client + server error for this field
    setErrors((prev) => ({ ...prev, [fieldName]: '' }));
    setApiFieldErrors((prev) => {
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });

    setApiError(null);
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
    clearServerErrors();
    if (validateStep() && step < formSteps.length - 1) {
      setStep((prev) => prev + 1);
    }
  };

  const prevStep = () => {
    clearServerErrors();
    if (step > 0) setStep((prev) => prev - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearServerErrors();

    if (!validateStep()) return;

    try {
      const response = await apiClient.post('/auth/register/', formData);
      if ([200, 201].includes(response.status)) {
        setRegistered(true);
        setPatientId(response.data?.id || null);
      }
    } catch (error: any) {
      const payload: BackendErrorPayload | any = error?.response?.data;
      const { banner, fieldErrs } = prettifyServerErrors(payload || error?.message || error);

      // show banner message
      setApiError(banner);

      // map backend field errors to fields (inline)
      if (Object.keys(fieldErrs).length > 0) {
        setApiFieldErrors(fieldErrs);

        // optional: also set client errors so bootstrap highlights fields consistently
        setErrors((prev) => ({ ...prev, ...fieldErrs }));
      }
    }
  };

  const currentFields: any[] = formSteps[step]?.fields || [];

  // For consistent inline error rendering, prefer client errors, then backend errors
  const mergedFieldError = useMemo(() => {
    const merged: Record<string, string> = { ...apiFieldErrors, ...errors };
    return merged;
  }, [apiFieldErrors, errors]);

  return (
    <Form onSubmit={handleSubmit}>
      <div className="d-flex justify-content-between align-items-end mb-2">
        <h4 className="mb-0">{t(formSteps[step]?.title)}</h4>
        <small className="text-muted">
          <span className="text-danger">*</span> {t('required')}
        </small>
      </div>

      {/* Server-side error banner (human readable, not JSON) */}
      {apiError && (
        <div className="alert alert-danger" role="alert" aria-live="assertive">
          {apiError}
        </div>
      )}

      {currentFields.map((field) => {
        const isMulti = field.type === 'multi-select';
        const isDropdown = field.type === 'dropdown';
        const required = !!field.required;

        // Force birth date to use a date picker
        const inputType = field.name === 'age' ? 'date' : field.type;

        const fieldErrMsg = mergedFieldError[field.name];
        const invalid = !!fieldErrMsg;

        // Resolve dynamic options for clinic and project fields
        let fieldOptions: string[] = field.options || [];
        if (field.name === 'clinic') {
          fieldOptions = therapistClinics;
        } else if (field.name === 'project') {
          const allowedByClinic = clinicProjectsMap[formData.clinic as string] || [];
          fieldOptions = therapistProjects.filter((p) => allowedByClinic.includes(p));
        }

        return (
          <Form.Group controlId={field.name} className="mb-3" key={field.name}>
            <Form.Label className="d-flex align-items-center gap-1">
              <span>
                {t(field.label)}
                {required && (
                  <>
                    <span className="text-danger" aria-hidden="true">
                      {' '}
                      *
                    </span>
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
                aria-invalid={invalid}
                options={
                  field.name === 'diagnosis' &&
                  Array.isArray(formData.function) &&
                  (formData.function as string[]).length > 0
                    ? (formData.function as string[]).flatMap((spec: string) =>
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
                isInvalid={invalid}
                required={required}
                aria-required={required}
                aria-invalid={invalid}
              >
                <option value="">
                  {t('Select')} {t(field.label)}
                </option>
                {fieldOptions.map((option: string) => (
                  <option key={option} value={option}>
                    {t(option)}
                  </option>
                ))}
              </Form.Control>
            ) : field.type === 'checkbox' ? (
              <Form.Check
                type="checkbox"
                id={field.name}
                label=""
                checked={!!formData[field.name]}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, [field.name]: e.target.checked }))
                }
              />
            ) : (
              <Form.Control
                type={inputType}
                value={String(formData[field.name] ?? '')}
                onChange={handleChange}
                isInvalid={invalid}
                required={required}
                aria-required={required}
                aria-invalid={invalid}
                placeholder={field.name === 'age' ? 'YYYY-MM-DD' : undefined}
                onBlur={
                  field.name === 'age' ? (e) => validateAge(e.currentTarget.value) : undefined
                }
              />
            )}

            {fieldErrMsg && <Form.Text className="text-danger">{fieldErrMsg}</Form.Text>}
          </Form.Group>
        );
      })}

      {registered ? (
        <div className="alert alert-success mt-4">
          <p>
            {t(
              'The patient has been registered. Account information has been sent to the given email.'
            )}
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
