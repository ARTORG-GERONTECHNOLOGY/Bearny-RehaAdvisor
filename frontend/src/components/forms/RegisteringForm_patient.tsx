import React, { useState } from 'react';
import { Button } from 'react-bootstrap';
import Select from 'react-select';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import config from '../../config/config.json';
import { t } from 'i18next';

interface FormData {
  email: string;
  password: string;
  repeatPassword: string;
  userType: string;
  firstName: string;
  lastName: string;
  age: string;
  sex: string;
  function: string[];
  diagnosis: string[];
  lifestyle: string[];
  [key: string]: string | number | string[] | boolean;
}
interface RegisterFormProps {
  pageType: 'regular' | 'patient';
  therapist: string;
}

const FormRegisterPatient: React.FC<RegisterFormProps> = ({ pageType, therapist }) => {

  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    repeatPassword: '',
    userType: 'Patient',
    therapist: therapist,
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
    socialSupport: '',
    rehaEndDate: '',
    careGiver: ''

  });

  const [step, setStep] = useState<number>(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [registered, setRegistered] = useState(false);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null); //  Stores API Errors

  // Extract Specialities & Diagnoses from JSON Config
  const specialityDiagnosisMap: Record<string, string[]> = config.patientInfo.functionPat;

  // 🔹 Form Steps Configuration
  const formSteps = config.PatientForm;

  // ** Prevent Undefined `formSteps[step]`**
  if (step >= formSteps.length) {
    setStep(0); // Reset step to a valid index
  }

  // 🔹 Handle Input Changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData({ ...formData, [id]: value });
    setErrors({ ...errors, [id]: '' });
  };

  // 🔹 Handle Multi-Select Changes
  const handleMultiSelectChange = (selectedOptions: any, fieldName: string) => {
    const selectedValues = selectedOptions ? selectedOptions.map((option: any) => option.value) : [];
    setFormData({ ...formData, [fieldName]: selectedValues });
    setErrors({ ...errors, [fieldName]: '' });

    if (fieldName === "function") {
      setFormData({ ...formData, function: selectedValues, diagnosis: [] });
    }
  };

  // 🔹 Validate Current Step
  const validateStep = () => {
    let newErrors: Record<string, string> = {};
    const currentStep = formSteps[step];

    currentStep.fields.forEach((field) => {
        // @ts-ignore
      if (field.required && (!formData[field.name] || formData[field.name]?.length === 0)) {
        newErrors[field.name] = `${field.label} is required.`;
      }
    });

    // **Phone Number Validation** (Only if it's not empty)
      // @ts-ignore
    if (formData.phone && formData.phone.trim() !== "") {
      if (!/^\d{8,15}$/.test(formData.phone as string)) {
        newErrors.phone = t("Invalid phone number. Enter 8-15 digits only.");
      }
    }

    if (formData.email && currentStep.fields.some(f => f.name === "email")) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email as string)) {
        newErrors.email = t("Invalid email format.");
      }
    }

    if (currentStep.fields.some(f => f.name === "password") && formData.password !== formData.repeatPassword) {
      newErrors.repeatPassword = t("Passwords do not match.");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 🔹 Proceed to Next Step (Prevents Out-of-Bounds)
  const nextStep = () => {
    if (validateStep() && step < formSteps.length - 1) {
      setStep(step + 1);
    }
  };

  // 🔹 Go Back to Previous Step (Prevents Negative Index)
  const prevStep = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  // 🔹 Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null); // 🔹 Clear previous API errors
    if (validateStep()) {
      try {
        const response = await apiClient.post('/auth/register/', formData);
        if (response.data && response.status == 200 || response.status == 201) {
          setRegistered(true);
          setPatientId(response.data.id);
        }
      } catch (error) {
        console.error('Registration error: ', error);
       // 🔹 Check if error has a response and extract the error message
        if (error.response) {
          setApiError(error.response.data?.error || t("An error occurred. Please try again."));
        } else {
          setApiError(t("An unexpected error occurred. Please try again."));
        }
      }
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <h3>{t(formSteps[step]?.title)}</h3> {/* ✅ Fix: Ensure step exists */}

        {formSteps[step]?.fields.map((field) => (
          <div key={field.name} className="mb-3">
            <label htmlFor={field.name} className="form-label">{t(field.label)}</label>

            {field.type === "multi-select" ? (
              <Select
                id={field.name}
                isMulti
                options={field.name === "diagnosis" && formData.function.length > 0
                  ? formData.function.flatMap(speciality => specialityDiagnosisMap[speciality]?.map(diag => ({ value: diag, label: t(diag) })) || [])
                  : field.options?.map(option => ({ value: option, label: t(option) }))
                }
                value={(formData[field.name] as string[]).map(value => ({ value, label: value }))}
                onChange={(selectedOptions) => handleMultiSelectChange(selectedOptions, field.name)}
              />
            ) : field.type === "dropdown" ? (
              <select id={field.name} className={`form-control ${errors[field.name] ? "is-invalid" : ""}`} value={formData[field.name] as string || ""} onChange={handleChange}>
                <option value="">{t("Select")} {t(field.label)}</option>
                {field.options?.map((option) => (<option key={option} value={option}>{t(option)}</option>))}
              </select>
            ) : (
              <input type={field.type} className={`form-control ${errors[field.name] ? "is-invalid" : ""}`} id={field.name} value={formData[field.name] as string || ""} onChange={handleChange} />
            )}

            {errors[field.name] && <div className="text-danger mt-1">{errors[field.name]}</div>}
          </div>
        ))}
        {/* 🔹 Display API Error Alert */}
      {apiError && <div className="alert alert-danger">{apiError}</div>}
      {registered && (
        <div className="alert alert-success">
          <div> {t("The patient has been registered. Account information has been sent to the given email.")}</div>
          <div><strong>{t("Patient ID:")}</strong> {patientId}</div>
          <div><strong>{t("Access Word:")}</strong> {formData.password}</div>
          <div>
            <Link to="/patient_home">{t("Click here to log in")}</Link>
          </div>
        </div>
      )}


        <div className="d-flex justify-content-between mt-4">
          {step > 0 && !registered && <Button variant="secondary" onClick={prevStep}>{t("Back")}</Button>}
          {step < formSteps.length - 1 && !registered && <Button variant="primary" onClick={nextStep}>{t("Next")}</Button>}
          {step === formSteps.length - 1 && !registered && <Button type="submit" variant="success">{t("Submit")}</Button>}
        </div>
      </form>
    </div>
  );
};

export default FormRegisterPatient;
