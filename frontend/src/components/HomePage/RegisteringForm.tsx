import React, { useState } from 'react';
import { Button, Modal, Spinner } from 'react-bootstrap';
import Select from 'react-select';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import apiClient from '../../api/client';
import config from '../../config/config.json';
import ErrorAlert from '../common/ErrorAlert';

interface FormData {
  [key: string]: string | string[];
}

interface RegisterFormProps {
  show: boolean;
  handleRegShow: () => void;
}

const FormRegister: React.FC<RegisterFormProps> = ({ show, handleRegShow }) => {
  const { t } = useTranslation();
  const formSteps = config.TherapistForm;
  const specialityDiagnosisMap: Record<string, string[]> = config.patientInfo.functionPat;

  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    repeatPassword: '',
    userType: '',
    firstName: '',
    lastName: '',
    phone: '',
    specialisation: [],
    clinic: [],
    researcherInfo: '',
    adminInfo: '',
  });

  const [step, setStep] = useState<number>(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [registered, setRegistered] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      repeatPassword: '',
      userType: '',
      firstName: '',
      lastName: '',
      phone: '',
      specialisation: [],
      clinic: [],
      researcherInfo: '',
      adminInfo: '',
    });
    setStep(0);
    setErrors({});
    setRegistered(false);
    setError(null);
    setShowPassword(false);
    setShowRepeatPassword(false);
  };

  const handleCloseForm = () => {
    resetForm();
    handleRegShow();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => ({ ...prev, [id]: '' }));

    // Adjust fields based on user type
    if (id === 'userType') {
      if (value === 'Therapist') {
        setFormData((prev) => ({
          ...prev,
          userType: value,
          specialisation: [],
          clinic: [],
        }));
      } else if (value === 'Researcher') {
        setFormData((prev) => ({ ...prev, userType: value, researcherInfo: '' }));
      } else if (value === 'admin') {
        setFormData((prev) => ({ ...prev, userType: value, adminInfo: '' }));
      }
    }
  };

  const handleMultiSelectChange = (
    selectedOptions: { value: string; label: string }[] | null,
    fieldName: string
  ) => {
    const selectedValues = selectedOptions ? selectedOptions.map((opt) => opt.value) : [];
    setFormData((prev) => ({ ...prev, [fieldName]: selectedValues }));
    setErrors((prev) => ({ ...prev, [fieldName]: '' }));
  };

  const togglePassword = (which: 'main' | 'repeat') => {
    if (which === 'main') setShowPassword((prev) => !prev);
    else setShowRepeatPassword((prev) => !prev);
  };

  const validateStep = () => {
    const newErrors: Record<string, string> = {};
    const fields = formSteps[step]?.fields || [];

    fields.forEach((field) => {
      const val = formData[field.name];
      if (field.required && (!val || (Array.isArray(val) && val.length === 0))) {
        newErrors[field.name] = t('This field is required.');
      }
    });

    if (formData.phone && !/^\d{8,15}$/.test(formData.phone as string)) {
      newErrors.phone = t('Invalid phone number. Enter 8-15 digits only.');
    }

    if (formData.email && fields.some((f) => f.name === 'email')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email as string)) {
        newErrors.email = t('Invalid email format.');
      }
    }

    if (formData.password && fields.some((f) => f.name === 'password')) {
      const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
      if (!pwdRegex.test(formData.password as string)) {
        newErrors.password = t(
          'Password must include 8+ characters, an uppercase, lowercase, number and special character.'
        );
      }
    }

    if (
      fields.some((f) => f.name === 'password') &&
      formData.password !== formData.repeatPassword
    ) {
      newErrors.repeatPassword = t('Passwords do not match.');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => validateStep() && step < formSteps.length - 1 && setStep(step + 1);
  const prevStep = () => step > 0 && setStep(step - 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep()) return;

    try {
      setLoading(true);
      const response = await apiClient.post('/auth/register/', formData);
      if (response.status === 200 || response.status === 201) {
        setRegistered(true);
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || t('An unexpected error occurred.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={handleCloseForm} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>{t('Register')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <form onSubmit={handleSubmit}>
          {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
          {registered && (
            <div className="alert alert-success">
              {t(
                'You have been registered. Account info will be emailed after approval.'
              )}
            </div>
          )}

          <h4>{t(formSteps[step]?.title)}</h4>

          {formSteps[step]?.fields.map((field) => (
            <div key={field.name} className="mb-3">
              <label htmlFor={field.name} className="form-label">
                {t(field.label)}
              </label>

              {field.type === 'multi-select' ? (
                <Select
                  id={field.name}
                  isMulti
                  value={(formData[field.name] as string[]).map((val) => ({
                    value: val,
                    label: t(val),
                  }))}
                  options={
                    field.name === 'diagnosis' && formData.function.length > 0
                      ? formData.function.flatMap(
                          (spec) =>
                            specialityDiagnosisMap[spec]?.map((diag) => ({
                              value: diag,
                              label: t(diag),
                            })) || []
                        )
                      : field.options?.map((opt) => ({ value: opt, label: t(opt) }))
                  }
                  onChange={(options) => handleMultiSelectChange(options, field.name)}
                />
              ) : field.type === 'dropdown' ? (
                <select
                  id={field.name}
                  className={`form-control ${errors[field.name] ? 'is-invalid' : ''}`}
                  value={formData[field.name] as string}
                  onChange={handleChange}
                >
                  <option value="">{t('Select')} {t(field.label)}</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>
                      {t(opt)}
                    </option>
                  ))}
                </select>
              ) : field.type === 'password' ? (
                <div className="position-relative">
                  <input
                    type={field.name === 'password' ? (showPassword ? 'text' : 'password') : showRepeatPassword ? 'text' : 'password'}
                    className={`form-control ${errors[field.name] ? 'is-invalid' : ''}`}
                    id={field.name}
                    value={formData[field.name] as string}
                    onChange={handleChange}
                  />
                  <span
                    className="position-absolute end-0 top-50 translate-middle-y me-3"
                    role="button"
                    onClick={() => togglePassword(field.name === 'password' ? 'main' : 'repeat')}
                  >
                    {field.name === 'password'
                      ? showPassword
                        ? <FaEye />
                        : <FaEyeSlash />
                      : showRepeatPassword
                        ? <FaEye />
                        : <FaEyeSlash />}
                  </span>
                </div>
              ) : (
                <input
                  type={field.type}
                  className={`form-control ${errors[field.name] ? 'is-invalid' : ''}`}
                  id={field.name}
                  value={formData[field.name] as string}
                  onChange={handleChange}
                />
              )}

              {errors[field.name] && <div className="text-danger mt-1">{errors[field.name]}</div>}
            </div>
          ))}

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
              <Button type="submit" variant="success" disabled={loading}>
                {loading ? <Spinner size="sm" /> : t('Submit')}
              </Button>
            )}
          </div>
        </form>
      </Modal.Body>
    </Modal>
  );
};

export default FormRegister;
