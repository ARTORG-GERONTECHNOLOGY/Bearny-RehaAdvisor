// src/components/HomePage/RegisteringForm.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Modal, Spinner } from 'react-bootstrap';
import Select from 'react-select';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import apiClient from '../../api/client';
import config from '../../config/config.json';

interface FormDataShape {
  [key: string]: any; // string | string[]
}

interface RegisterFormProps {
  show: boolean;
  handleRegShow: () => void; // toggles modal open/close
}

type Option = { value: string; label: string };

const FormRegister: React.FC<RegisterFormProps> = ({ show, handleRegShow }) => {
  const { t } = useTranslation();

  // Config-driven steps & maps
  const formSteps = (config as any).TherapistForm;
  const specialityDiagnosisMap: Record<string, string[]> =
    (config as any).patientInfo?.functionPat || {};

  const therapistInfo = (config as any).therapistInfo || {};
  const therapistSpecializations: string[] = therapistInfo.specializations || [];
  const therapistClinics: string[] = Object.keys(therapistInfo.clinic_projects || {});
  const allProjects: string[] = therapistInfo.projects || [];
  const clinicProjectsMap: Record<string, string[]> = therapistInfo.clinic_projects || {};

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
    projects: [], // ✅ NEW
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

  const [serverDetail, setServerDetail] = useState<{ status?: number; message?: string } | null>(
    null
  );
  const [showDetails, setShowDetails] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  /** Password policy and live validation */
  const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

  /** ---------- sanitizers / validators ---------- */
  const cleanSpaces = (s: string) =>
    String(s ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  const cleanName = (s: string) => cleanSpaces(s);
  const cleanEmail = (s: string) =>
    String(s ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
  const cleanPhone = (s: string) =>
    String(s ?? '')
      .replace(/[\s\-().]/g, '')
      .trim();

  const isValidEmailStrict = (emailRaw: string) => {
    const email = cleanEmail(emailRaw);
    if (!email || email.length > 254) return false;
    if (email.includes('..')) return false;

    const at = email.indexOf('@');
    if (at <= 0 || at !== email.lastIndexOf('@')) return false;

    const local = email.slice(0, at);
    const domain = email.slice(at + 1);

    if (!/^[a-z0-9][a-z0-9._%+-]*$/i.test(local)) return false;
    if (local.endsWith('.')) return false;

    if (domain.length < 3) return false;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return false;

    const labels = domain.split('.');
    if (labels.some((l) => !l.length)) return false;
    if (labels.some((l) => l.startsWith('-') || l.endsWith('-'))) return false;

    return true;
  };

  const isValidHumanName = (nameRaw: string) => {
    const name = cleanName(nameRaw);
    if (!name) return false;
    if (name.length < 2) return false;
    const re = /^[\p{L}\p{M}]+(?:[ '\-][\p{L}\p{M}]+)*$/u;
    return re.test(name);
  };

  const liveValidatePassword = (pwd: string, rep: string) => {
    setErrors((prev) => {
      const next = { ...prev };

      if (pwd.length > 0 && !pwdRegex.test(pwd)) {
        next.password = t(
          'Password must include 8+ characters, an uppercase, lowercase, number and special character.'
        );
      } else {
        delete next.password;
      }

      if (rep.length > 0 && rep !== pwd) {
        next.repeatPassword = t('Passwords do not match.');
      } else {
        delete next.repeatPassword;
      }

      return next;
    });
  };

  const resetForm = useCallback(() => {
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
      projects: [], // ✅ NEW
      researcherInfo: '',
      adminInfo: '',
      function: [],
      diagnosis: [],
    });
    setStep(0);
    setErrors({});
    setFormError(null);
    setSuccessMsg(null);
    setServerDetail(null);
    setShowDetails(false);
    setShowPassword(false);
    setShowRepeatPassword(false);
    setLoading(false);
  }, []);

  const confirmClose = useCallback(() => {
    const hasAny = Object.entries(formData).some(([k, v]) => {
      if (k === 'repeatPassword') return false;
      if (Array.isArray(v)) return v.length > 0;
      return !!String(v ?? '').trim();
    });

    if (successMsg) {
      resetForm();
      handleRegShow();
      return;
    }

    if (loading) {
      if (!window.confirm(t('A request is in progress. Do you want to close?'))) return;
      setLoading(false);
    } else if (hasAny) {
      if (!window.confirm(t('Are you sure you want to close? Unsaved data will be lost.'))) return;
    }

    resetForm();
    handleRegShow();
  }, [formData, handleRegShow, loading, resetForm, successMsg, t]);

  const handleCloseForm = useCallback(() => {
    confirmClose();
  }, [confirmClose]);

  useEffect(() => {
    if (!show) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        confirmClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [show, confirmClose]);

  // ✅ NEW: derive allowed projects from selected clinics
  const allowedProjectsForSelectedClinics = useMemo(() => {
    const clinics = Array.isArray(formData.clinic) ? (formData.clinic as string[]) : [];
    if (!clinics.length) return [];

    const set = new Set<string>();
    clinics.forEach((c) => {
      (clinicProjectsMap[c] || []).forEach((p) => set.add(p));
    });

    // keep stable order based on global project list
    return allProjects.filter((p) => set.has(p));
  }, [allProjects, clinicProjectsMap, formData.clinic]);

  // ✅ NEW: whenever clinics change, prune projects that are no longer allowed
  useEffect(() => {
    if (!Array.isArray(formData.projects)) return;

    const allowed = new Set(allowedProjectsForSelectedClinics);
    const next = (formData.projects as string[]).filter((p) => allowed.has(p));

    if (next.length !== (formData.projects as string[]).length) {
      setFormData((prev) => ({ ...prev, projects: next }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedProjectsForSelectedClinics]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id } = e.target;
    let value = e.target.value;

    if (id === 'email') value = cleanEmail(value);
    else if (id === 'phone') value = cleanPhone(value);
    else if (id === 'firstName' || id === 'lastName') value = cleanName(value);
    else value = cleanSpaces(value);

    setFormData((prev) => {
      const updated = { ...prev, [id]: value };

      if (formError) setFormError(null);
      setServerDetail(null);
      setShowDetails(false);

      if (id === 'password' || id === 'repeatPassword') {
        const pwd = id === 'password' ? value : String(updated.password || '');
        const rep = id === 'repeatPassword' ? value : String(updated.repeatPassword || '');
        liveValidatePassword(pwd, rep);
      } else {
        setErrors((prevErr) => ({ ...prevErr, [id]: '' }));
      }

      if (id === 'userType') {
        if (value === 'Therapist') {
          updated.specialisation = [];
          updated.clinic = [];
          updated.projects = []; // ✅ reset dependent field
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
    const selectedValues = selectedOptions ? selectedOptions.map((opt) => opt.value) : [];

    setFormData((prev) => {
      const updated = { ...prev, [fieldName]: selectedValues };

      // ✅ if clinic changes, projects will be auto-pruned by effect above
      // But we can also clear projects when clinic becomes empty
      if (fieldName === 'clinic' && selectedValues.length === 0) {
        updated.projects = [];
      }

      return updated;
    });

    setErrors((prev) => ({ ...prev, [fieldName]: '' }));
    if (formError) setFormError(null);
    setServerDetail(null);
    setShowDetails(false);
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

    if (fields.some((f: any) => f.name === 'phone')) {
      const phone = String(formData.phone || '');
      if (phone && !/^\d{8,15}$/.test(phone)) {
        newErrors.phone = t('Invalid phone number. Enter 8-15 digits only.');
      }
    }

    if (fields.some((f: any) => f.name === 'email')) {
      const email = String(formData.email || '');
      if (email && !isValidEmailStrict(email)) {
        newErrors.email = t('Invalid email address.');
      }
    }

    if (fields.some((f: any) => f.name === 'firstName')) {
      const fn = String(formData.firstName || '');
      if (fn && !isValidHumanName(fn)) {
        newErrors.firstName = t('Please enter a valid first name.');
      }
    }

    if (fields.some((f: any) => f.name === 'lastName')) {
      const ln = String(formData.lastName || '');
      if (ln && !isValidHumanName(ln)) {
        newErrors.lastName = t('Please enter a valid last name.');
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

    // ✅ NEW: projects validation only when field is present in step
    if (fields.some((f: any) => f.name === 'projects')) {
      const clinics = Array.isArray(formData.clinic) ? (formData.clinic as string[]) : [];
      const projects = Array.isArray(formData.projects) ? (formData.projects as string[]) : [];

      if (clinics.length > 0) {
        const allowed = new Set(allowedProjectsForSelectedClinics);
        const invalid = projects.filter((p) => !allowed.has(p));
        if (invalid.length) {
          newErrors.projects = t('Selected projects are not allowed for the selected clinic(s).');
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => validateStep() && step < formSteps.length - 1 && setStep(step + 1);
  const prevStep = () => step > 0 && setStep(step - 1);

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
    setServerDetail(null);
    setShowDetails(false);

    if (!validateStep()) return;

    const cleanedPayload: FormDataShape = {
      ...formData,
      email: cleanEmail(String(formData.email || '')),
      firstName: cleanName(String(formData.firstName || '')),
      lastName: cleanName(String(formData.lastName || '')),
      phone: cleanPhone(String(formData.phone || '')),
      researcherInfo: cleanSpaces(String(formData.researcherInfo || '')),
      adminInfo: cleanSpaces(String(formData.adminInfo || '')),
    };

    try {
      setLoading(true);
      const res = await apiClient.post('/auth/register/', cleanedPayload);

      if (res.status >= 200 && res.status < 300) {
        setErrors({});
        setSuccessMsg(t('You have been registered. Account info will be emailed after approval.'));
      } else {
        const message = extractServerMessage(res.data, t('Registration failed.'));
        setFormError(message);
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const message = extractServerMessage(
        err?.response?.data,
        t('Registration failed. Please try again later.')
      );

      if (status >= 500) {
        setFormError(
          `${t('The server is busy or temporarily unavailable. Please try again.')}\n${t('Error')}: ${status}`
        );
      } else {
        setFormError(message);
      }
      setServerDetail({ status, message });
      setSuccessMsg(null);
    } finally {
      setLoading(false);
    }
  };

  const currentFields = formSteps[step]?.fields || [];

  // ✅ helper: build options for known dynamic fields
  const getOptionsForField = (fieldName: string): Option[] => {
    if (fieldName === 'specialisation')
      return therapistSpecializations.map((s) => ({ value: s, label: t(s) }));
    if (fieldName === 'clinic') return therapistClinics.map((c) => ({ value: c, label: t(c) }));
    if (fieldName === 'projects') {
      const source = allowedProjectsForSelectedClinics.length
        ? allowedProjectsForSelectedClinics
        : allProjects;
      return source.map((p) => ({ value: p, label: p }));
    }
    return [];
  };

  const projectsDisabled =
    Array.isArray(formData.clinic) && (formData.clinic as string[]).length === 0;

  return (
    <Modal
      show={show}
      onHide={handleCloseForm}
      onEscapeKeyDown={(e) => {
        e.preventDefault();
        confirmClose();
      }}
      centered
      size="lg"
      backdrop="static"
      keyboard
    >
      <Modal.Header closeButton>
        <Modal.Title>{t('Register')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {formError && (
          <div className="alert alert-danger">
            <div className="d-flex justify-content-between align-items-center">
              <span style={{ whiteSpace: 'pre-line' }}>{formError}</span>
              <button
                type="button"
                className="btn-close"
                aria-label={t('Close')}
                onClick={() => {
                  setFormError(null);
                  setServerDetail(null);
                  setShowDetails(false);
                }}
              />
            </div>

            {serverDetail && (
              <div className="mt-2">
                <button
                  type="button"
                  className="btn btn-link p-0"
                  onClick={() => setShowDetails((v) => !v)}
                >
                  {t('Additional information')}
                </button>
                {showDetails && (
                  <pre className="small bg-light p-2 border rounded mt-1 mb-0">
                    {t('Status')}: {serverDetail.status ?? '-'}
                    {'\n'}
                    {serverDetail.message}
                  </pre>
                )}
              </div>
            )}
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
          <fieldset disabled={loading || !!successMsg}>
            <h4 className="mb-3">{t(formSteps[step]?.title)}</h4>

            {currentFields.map((field: any) => {
              const isRequired = !!field.required;
              const labelText = (
                <>
                  {t(field.label)} {isRequired && <span className="text-danger">*</span>}
                </>
              );

              const valueArr: string[] = Array.isArray(formData[field.name])
                ? (formData[field.name] as string[])
                : [];

              return (
                <div key={field.name} className="mb-3">
                  <label htmlFor={field.name} className="form-label">
                    {labelText}
                  </label>

                  {field.type === 'multi-select' ? (
                    <>
                      <Select
                        id={field.name}
                        isMulti
                        isDisabled={field.name === 'projects' ? projectsDisabled : false}
                        placeholder={
                          field.name === 'projects' && projectsDisabled
                            ? t('Select clinic(s) first...')
                            : t('Select...')
                        }
                        value={valueArr.map((val) => ({ value: val, label: t(val) }))}
                        options={
                          field.name === 'diagnosis' && (formData.function || []).length > 0
                            ? (formData.function as string[]).flatMap((spec: string) =>
                                (specialityDiagnosisMap[spec] || []).map((diag) => ({
                                  value: diag,
                                  label: t(diag),
                                }))
                              )
                            : field.name === 'specialisation' ||
                                field.name === 'clinic' ||
                                field.name === 'projects'
                              ? getOptionsForField(field.name)
                              : (field.options || []).map((opt: string) => ({
                                  value: opt,
                                  label: t(opt),
                                }))
                        }
                        onChange={(options) => handleMultiSelectChange(options, field.name)}
                      />

                      {field.name === 'projects' && !projectsDisabled && (
                        <div className="text-muted small mt-1">
                          {t('Available projects based on selected clinic(s).')}
                        </div>
                      )}
                    </>
                  ) : field.type === 'dropdown' ? (
                    <select
                      id={field.name}
                      className={`form-control ${errors[field.name] ? 'is-invalid' : ''}`}
                      value={String(formData[field.name] || '')}
                      onChange={handleChange}
                      onBlur={() => {
                        setErrors((prev) => {
                          const next = { ...prev };
                          if (next[field.name]) delete next[field.name];
                          return next;
                        });
                      }}
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
                        className={`form-control ${errors[field.name] ? 'is-invalid' : ''}`}
                        id={field.name}
                        value={String(formData[field.name] || '')}
                        onChange={handleChange}
                        aria-describedby={`${field.name}-help`}
                        autoComplete="new-password"
                      />
                      <span
                        className="position-absolute end-0 top-50 translate-middle-y me-3"
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          togglePassword(field.name === 'password' ? 'main' : 'repeat')
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            togglePassword(field.name === 'password' ? 'main' : 'repeat');
                          }
                        }}
                        aria-label={t('Toggle password visibility')}
                      >
                        {field.name === 'password' ? (
                          showPassword ? (
                            <FaEye />
                          ) : (
                            <FaEyeSlash />
                          )
                        ) : showRepeatPassword ? (
                          <FaEye />
                        ) : (
                          <FaEyeSlash />
                        )}
                      </span>

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
                      className={`form-control ${errors[field.name] ? 'is-invalid' : ''}`}
                      id={field.name}
                      value={String(formData[field.name] || '')}
                      onChange={handleChange}
                      onBlur={() => {
                        setErrors((prev) => {
                          const next = { ...prev };

                          if (field.name === 'email' && formData.email) {
                            if (!isValidEmailStrict(formData.email))
                              next.email = t('Invalid email address.');
                            else delete next.email;
                          }

                          if (
                            (field.name === 'firstName' || field.name === 'lastName') &&
                            formData[field.name]
                          ) {
                            if (!isValidHumanName(String(formData[field.name])))
                              next[field.name] = t('Please enter a valid name (letters only).');
                            else delete next[field.name];
                          }

                          if (field.name === 'phone' && formData.phone) {
                            if (!/^\d{8,15}$/.test(String(formData.phone)))
                              next.phone = t('Invalid phone number. Enter 8-15 digits only.');
                            else delete next.phone;
                          }

                          return next;
                        });
                      }}
                    />
                  )}

                  {field.type !== 'password' && errors[field.name] && (
                    <div className="text-danger mt-1" aria-live="polite">
                      {errors[field.name]}
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>

          <div className="d-flex justify-content-between mt-4">
            {successMsg ? (
              <div className="ms-auto">
                <Button variant="primary" onClick={handleCloseForm}>
                  {t('Close')}
                </Button>
              </div>
            ) : step > 0 ? (
              <>
                <Button variant="secondary" onClick={prevStep} disabled={loading}>
                  {t('Back')}
                </Button>

                {step < formSteps.length - 1 ? (
                  <Button variant="primary" onClick={nextStep} disabled={loading}>
                    {t('Next')}
                  </Button>
                ) : (
                  <Button type="submit" variant="success" disabled={loading}>
                    {loading ? <Spinner size="sm" /> : t('Submit')}
                  </Button>
                )}
              </>
            ) : (
              <>
                <span />
                <Button variant="primary" onClick={nextStep} disabled={loading}>
                  {t('Next')}
                </Button>
              </>
            )}
          </div>
        </form>
      </Modal.Body>
    </Modal>
  );
};

export default FormRegister;
