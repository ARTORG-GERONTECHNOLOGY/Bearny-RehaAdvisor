// src/components/HomePage/RegisteringForm.tsx
import React, { useState } from 'react';
import { Button, Modal, Spinner } from 'react-bootstrap';
import Select from 'react-select';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import apiClient from '../../api/client';
import config from '../../config/config.json';
import ErrorAlert from '../common/ErrorAlert';

interface FormDataShape {
  [key: string]: any; // string | string[]
}

interface RegisterFormProps {
  show: boolean;
  handleRegShow: () => void;
}

const FormRegister: React.FC<RegisterFormProps> = ({ show, handleRegShow }) => {
  const { t } = useTranslation();

  // Expecting these to exist in your config (kept as any to avoid over-typing)
  const formSteps = (config as any).TherapistForm;
  const specialityDiagnosisMap: Record<string, string[]> =
    (config as any).patientInfo?.functionPat || {};

  const [formData, setFormData] = useState<FormDataShape>({
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
    function: [],
    diagnosis: [],
  });

  const [step, setStep] = useState<number>(0);

  // Field-level client-side errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Top banners
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
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
      function: [],
      diagnosis: [],
    });
    setStep(0);
    setErrors({});
    setFormError(null);
    setSuccessMsg(null);
    setShowPassword(false);
    setShowRepeatPassword(false);
  };

  const handleCloseForm = () => {
    resetForm();
    handleRegShow();
  };

  /** Password policy and live validation */
  const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

  const liveValidatePassword = (pwd: string, rep: string) => {
    setErrors((prev) => {
      const next = { ...prev };

      // Show complexity error ONLY after user started typing
      if (pwd.length > 0 && !pwdRegex.test(pwd)) {
        next.password = t(
          'Password must include 8+ characters, an uppercase, lowercase, number and special character.'
        );
      } else {
        delete next.password;
      }

      // Show mismatch error ONLY after user started typing the repeat field
      if (rep.length > 0 && rep !== pwd) {
        next.repeatPassword = t('Passwords do not match.');
      } else {
        delete next.repeatPassword;
      }

      return next;
    });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { id, value } = e.target;

    setFormData((prev) => {
      const updated = { ...prev, [id]: value };

      // Clear top-level error when user edits anything
      if (formError) setFormError(null);

      // Live validate as user types passwords
      if (id === 'password' || id === 'repeatPassword') {
        const pwd = id === 'password' ? value : String(updated.password || '');
        const rep =
          id === 'repeatPassword'
            ? value
            : String(updated.repeatPassword || '');
        liveValidatePassword(pwd, rep);
      } else {
        // Clear field-specific error when user edits non-password fields
        setErrors((prevErr) => ({ ...prevErr, [id]: '' }));
      }

      // Adjust dependent fields based on user type
      if (id === 'userType') {
        if (value === 'Therapist') {
          updated.specialisation = [];
          updated.clinic = [];
        } else if (value === 'Researcher') {
          updated.researcherInfo = '';
        } else if (value === 'admin') {
          updated.adminInfo = '';
        }
      }

      return updated;
    });
  };

  const handleMultiSelectChange = (
    selectedOptions: readonly { value: string; label: string }[] | null,
    fieldName: string
  ) => {
    const selectedValues = selectedOptions
      ? selectedOptions.map((opt) => opt.value)
      : [];
    setFormData((prev) => ({ ...prev, [fieldName]: selectedValues }));
    setErrors((prev) => ({ ...prev, [fieldName]: '' }));
    if (formError) setFormError(null);
  };

  const togglePassword = (which: 'main' | 'repeat') => {
    if (which === 'main') setShowPassword((prev) => !prev);
    else setShowRepeatPassword((prev) => !prev);
  };

  /** Client-side step validation */
  const validateStep = () => {
    const newErrors: Record<string, string> = {};
    const fields = formSteps[step]?.fields || [];

    fields.forEach((field: any) => {
      const val = formData[field.name];
      if (field.required && (!val || (Array.isArray(val) && val.length === 0))) {
        newErrors[field.name] = t('This field is required.');
      }
    });

    if (formData.phone && !/^\d{8,15}$/.test(String(formData.phone))) {
      newErrors.phone = t('Invalid phone number. Enter 8-15 digits only.');
    }

    if (formData.email && fields.some((f: any) => f.name === 'email')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(formData.email))) {
        newErrors.email = t('Invalid email format.');
      }
    }

    if (fields.some((f: any) => f.name === 'password')) {
      const pwd = String(formData.password || '');
      if (!pwdRegex.test(pwd)) {
        newErrors.password = t(
          'Password must include 8+ characters, an uppercase, lowercase, number and special character.'
        );
      }
      if (String(formData.repeatPassword || '') !== pwd) {
        newErrors.repeatPassword = t('Passwords do not match.');
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () =>
    validateStep() && step < formSteps.length - 1 && setStep(step + 1);
  const prevStep = () => step > 0 && setStep(step - 1);

  /** Extract a single message string from arbitrary server payload */
  const extractServerMessage = (data: any, fallback: string) => {
    if (typeof data === 'string') return data;

    if (data && typeof data === 'object') {
      if (typeof data.error === 'string') return data.error;
      if (typeof data.message === 'string') return data.message;
      if (typeof data.detail === 'string') return data.detail;
      if (Array.isArray(data.non_field_errors) && data.non_field_errors.length) {
        return String(data.non_field_errors[0]);
      }
      for (const v of Object.values(data)) {
        if (typeof v === 'string') return v;
        if (Array.isArray(v) && v.length) return String(v[0]);
      }
    }
    return fallback;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);

    if (!validateStep()) return;

    try {
      setLoading(true);
      const { data: response } = await apiClient.post('/auth/register/', formData);

      if (response.status === 200 || response.status === 201) {
        setSuccessMsg(
          t('You have been registered. Account info will be emailed after approval.')
        );
        setErrors({});
      }
    } catch (err: any) {
     
        // For non-400 errors, keep a safe generic message
        
        setFormError(t(t(err) || t('Registration failed. Please try again later.')));
        setSuccessMsg(null);

    } finally {
      setLoading(false);
    }
  };

  const currentFields = formSteps[step]?.fields || [];

  return (
    <Modal
      show={show}
      onHide={handleCloseForm}
      centered
      size="lg"
      backdrop="static"
      keyboard={false}
    >
      <Modal.Header closeButton>
        <Modal.Title>{t('Register')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {/* Top banners */}
        {formError && (
          <div className="alert alert-danger d-flex justify-content-between align-items-center">
            <span>{formError}</span>
            <button
              type="button"
              className="btn-close"
              aria-label={t('Close')}
              onClick={() => setFormError(null)}
            />
          </div>
        )}

        {successMsg && (
          <div className="alert alert-success d-flex justify-content-between align-items-center">
            <span>{successMsg}</span>
            <button
              type="button"
              className="btn-close"
              aria-label={t('Close')}
              onClick={() => setSuccessMsg(null)}
            />
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <h4 className="mb-3">{t(formSteps[step]?.title)}</h4>

          {currentFields.map((field: any) => {
            const isRequired = !!field.required;
            const labelText = (
              <>
                {t(field.label)}{' '}
                {isRequired && <span className="text-danger">*</span>}
              </>
            );

            return (
              <div key={field.name} className="mb-3">
                <label htmlFor={field.name} className="form-label">
                  {labelText}
                </label>

                {field.type === 'multi-select' ? (
                  <Select
                    id={field.name}
                    isMulti
                    value={(formData[field.name] as string[]).map((val: string) => ({
                      value: val,
                      label: t(val),
                    }))}
                    options={
                      field.name === 'diagnosis' &&
                      (formData.function || []).length > 0
                        ? (formData.function as string[]).flatMap((spec: string) =>
                            (specialityDiagnosisMap[spec] || []).map((diag) => ({
                              value: diag,
                              label: t(diag),
                            }))
                          )
                        : (field.options || []).map((opt: string) => ({
                            value: opt,
                            label: t(opt),
                          }))
                    }
                    onChange={(options) =>
                      handleMultiSelectChange(options, field.name)
                    }
                  />
                ) : field.type === 'dropdown' ? (
                  <select
                    id={field.name}
                    className={`form-control ${
                      errors[field.name] ? 'is-invalid' : ''
                    }`}
                    value={String(formData[field.name] || '')}
                    onChange={handleChange}
                  >
                    <option value="">
                      {t('Select')} {t(field.label)}
                    </option>
                    {(field.options || []).map((opt: string) => (
                      <option key={opt} value={opt}>
                        {t(opt)}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'password' ? (
                  <div className="position-relative">
                    <input
                      type={
                        field.name === 'password'
                          ? showPassword
                            ? 'text'
                            : 'password'
                          : showRepeatPassword
                          ? 'text'
                          : 'password'
                      }
                      className={`form-control ${
                        errors[field.name] ? 'is-invalid' : ''
                      }`}
                      id={field.name}
                      value={String(formData[field.name] || '')}
                      onChange={handleChange}
                      aria-describedby={`${field.name}-help`}
                      autoComplete={
                        field.name === 'password' ? 'new-password' : 'new-password'
                      }
                    />
                    <span
                      className="position-absolute end-0 top-50 translate-middle-y me-3"
                      role="button"
                      onClick={() =>
                        togglePassword(field.name === 'password' ? 'main' : 'repeat')
                      }
                      aria-label={t('Toggle password visibility')}
                    >
                      {field.name === 'password' ? (
                        showPassword ? <FaEye /> : <FaEyeSlash />
                      ) : showRepeatPassword ? (
                        <FaEye />
                      ) : (
                        <FaEyeSlash />
                      )}
                    </span>

                    {/* Show the same validation text immediately while typing */}
                    {errors[field.name] && (
                      <div
                        id={`${field.name}-help`}
                        className="mt-1 small text-danger"
                        aria-live="polite"
                      >
                        {errors[field.name]}
                      </div>
                    )}
                  </div>
                ) : (
                  <input
                    type={field.type}
                    className={`form-control ${
                      errors[field.name] ? 'is-invalid' : ''
                    }`}
                    id={field.name}
                    value={String(formData[field.name] || '')}
                    onChange={handleChange}
                  />
                )}

                {/* Non-password field errors */}
                {field.type !== 'password' && errors[field.name] && (
                  <div className="text-danger mt-1" aria-live="polite">
                    {errors[field.name]}
                  </div>
                )}
              </div>
            );
          })}

          <div className="d-flex justify-content-between mt-4">
            {step > 0 && (
              <Button
                variant="secondary"
                onClick={prevStep}
                disabled={!!successMsg || loading}
              >
                {t('Back')}
              </Button>
            )}
            {step < formSteps.length - 1 ? (
              <Button
                variant="primary"
                onClick={nextStep}
                disabled={!!successMsg || loading}
              >
                {t('Next')}
              </Button>
            ) : (
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
