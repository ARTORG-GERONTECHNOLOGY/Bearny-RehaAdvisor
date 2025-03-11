import React, { useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import Select from 'react-select';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import apiClient from '../../api/client';
import config from '../../config/config.json';

interface FormData {
  email: string;
  password: string;
  repeatPassword: string;
  userType: string;
  firstName: string;
  lastName: string;
  phone: string;
  specialisation?: string[];
  clinic?: string[];
  researcherInfo?: string;
  adminInfo?: string;
  [key: string]: string | string[];
}

interface RegisterFormProps {
  show: boolean;
  handleRegShow: () => void;
  pageType: 'regular' | 'patient';
}

const FormRegister: React.FC<RegisterFormProps> = ({ show, handleRegShow, pageType }) => {
  const { t } = useTranslation();

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
  const [showPasswordRepeat, setShowPasswordRepeat] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null); //  Stores API Errors

  const specialityDiagnosisMap: Record<string, string[]> = config.patientInfo.functionPat;


  const handleCloseForm = () => {
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
    setApiError(null);
    setShowPassword(false);
    setShowPasswordRepeat(false);
  
    handleRegShow(); // ✅ Toggles the modal visibility
  };
  

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };
  
  const toggleRepeatPasswordVisibility = () => {
    setShowPasswordRepeat(!showPasswordRepeat);
  };

  const formSteps = config.TherapistForm;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => ({ ...prev, [id]: '' }));

    // **Ensure form fields exist when switching userType**
    if (id === "userType") {
      const newFormData = { ...formData, userType: value };

      if (value === "Therapist") {
        newFormData.specialisation = newFormData.specialisation || [];
        newFormData.clinic = newFormData.clinic || [];
      } else if (value === "Researcher") {
        newFormData.researcherInfo = newFormData.researcherInfo || "";
      } else if (value === "admin") {
        newFormData.adminInfo = newFormData.adminInfo || "";
      }

      setFormData(newFormData);
    }
  };

  const handleMultiSelectChange = (selectedOptions: any, fieldName: string) => {
    const selectedValues = selectedOptions ? selectedOptions.map((option: any) => option.value) : [];
    setFormData({ ...formData, [fieldName]: selectedValues });
    setErrors({ ...errors, [fieldName]: '' });
  };

  const validateStep = () => {
    let newErrors: Record<string, string> = {};
    const currentStep = formSteps[step];

    currentStep.fields.forEach((field) => {
        // @ts-ignore
      if (field.required && (!formData[field.name] || formData[field.name]?.length === 0)) {
        newErrors[field.name] = `${field.label} is required.`;
      }
    });

    // **Phone Number Validation** (Only Numbers, Minimum 8-15 Digits)
    if (formData.phone && !/^\d{8,15}$/.test(formData.phone as string)) {
      newErrors.phone = t("Invalid phone number. Enter 8-15 digits only.");
    }

    if (formData.email && currentStep.fields.some(f => f.name === "email")) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email as string)) {
        newErrors.email = t("Invalid email format.");
      }
    }

    // **Password Validation** (At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character)
    if (formData.password) {
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
      if (!passwordRegex.test(formData.password as string)) {
        newErrors.password =
          t("Password must have at least 8 characters, 1 uppercase, 1 lowercase, 1 number, and 1 special character.");
      }
    }

    if (currentStep.fields.some(f => f.name === "password") && formData.password !== formData.repeatPassword) {
      newErrors.repeatPassword = t("Passwords do not match.");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep() && step < formSteps.length - 1) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null); // 🔹 Clear previous API errors
    if (validateStep()) {
      try {
        const response = await apiClient.post('/auth/register/', formData);
        if (response.data && response.status == 200 || response.status == 201) {
          setRegistered(true)
        }
      } catch (error) {
        console.error('Registration error: ', error);
       // 🔹 Check if error has a response and extract the error message
        if (error.response) {
          setApiError(error.response.data?.error ||t("An error occurred. Please try again."));
        } else {
          setApiError(t("An unexpected error occurred. Please try again."));
        }
      }
    }
  };

  return (
    <Modal show={show} onHide={handleCloseForm} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>Register</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <form onSubmit={handleSubmit}>
          <h3>{formSteps[step].title}</h3>

          {formSteps[step]?.fields.map((field) => (
                    <div key={field.name} className="mb-3">
                      <label htmlFor={field.name} className="form-label">{t(field.label)}</label>
          
                      {field.type === "multi-select" ? (
                        <Select
                          id={field.name}
                          isMulti
                            // @ts-ignore
                          options={field.name === "diagnosis" && formData.function.length > 0
                              // @ts-ignore
                            ? formData.function.flatMap(speciality => specialityDiagnosisMap[speciality]?.map(diag => ({ value: diag, label: diag })) || [])
                            : field.options?.map(option => ({ value: option, label: t(option) }))
                          }
                          value={(formData[field.name] as string[]).map(value => ({ value, label: t(value) }))}
                          onChange={(selectedOptions) => handleMultiSelectChange(selectedOptions, field.name)}
                        />
                      ) : field.type === "dropdown" ? (
                        <select id={field.name} className={`form-control ${errors[field.name] ? "is-invalid" : ""}`} value={formData[field.name] as string || ""} onChange={handleChange}>
                          <option value="">Select {field.label}</option>
                          {field.options?.map((option) => (<option key={option} value={option}>{t(option)}</option>))}
                        </select>
                      ) : field.type === "password" ? (
                        <div className="position-relative">
                          <input
                            type={field.name === "password" ? (showPassword ? "text" : "password") : (showPasswordRepeat ? "text" : "password")}
                            className={`form-control ${errors[field.name] ? "is-invalid" : ""}`}
                            id={field.name}
                            value={formData[field.name] as string || ""}
                            onChange={handleChange}
                          />
                          <span
                            className="position-absolute end-0 top-50 translate-middle-y me-3"
                            style={{ cursor: "pointer" }}
                            onClick={field.name === "password" ? togglePasswordVisibility : toggleRepeatPasswordVisibility}
                          >
                           {field.name === "password" ? (
                                showPassword ? <FaEye size={25} onClick={togglePasswordVisibility} /> 
                                            : <FaEyeSlash size={25} onClick={togglePasswordVisibility} />
                              ) : (
                                showPasswordRepeat ? <FaEye size={25} onClick={toggleRepeatPasswordVisibility} /> 
                                                  : <FaEyeSlash size={25} onClick={toggleRepeatPasswordVisibility} />
                              )}

                          </span>
                          {errors[field.name] && <div className="text-danger mt-1">{errors[field.name]}</div>}
                        </div>
                      )  : (
                        <input type={field.type} className={`form-control ${errors[field.name] ? "is-invalid" : ""}`} id={field.name} value={formData[field.name] as string || ""} onChange={handleChange} />
                      )}
          
                      {errors[field.name] && <div className="text-danger mt-1">{errors[field.name]}</div>}
                    </div>
                  ))}

                   {/* 🔹 Display API Error Alert */}
      {apiError && <div className="alert alert-danger">{apiError}</div>}
      {registered && <div className="alert alert-success">
                  <div>{t("You have been Registered. Your account information will be sent to the given email, when your account has been approved.")}</div>
                </div>}


          <div className="d-flex justify-content-between mt-4">
            {step > 0 && !registered && <Button variant="secondary" onClick={prevStep}>Back</Button>}
            {step < formSteps.length - 1 && !registered && <Button variant="primary" onClick={nextStep}>{t("Next")}</Button>}
            {step === formSteps.length - 1 && !registered && <Button type="submit" variant="success">{t("Submit")}</Button>}
          </div>
        </form>
      </Modal.Body>
    </Modal>
  );
};

export default FormRegister;
