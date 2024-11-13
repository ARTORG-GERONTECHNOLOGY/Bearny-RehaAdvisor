import React, { useState } from 'react';
import { Button } from 'react-bootstrap';
import makeAnimated from 'react-select/animated';
import Select from 'react-select';
import { validateCurrentStep } from '../../utils/validation';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Link } from 'react-router-dom';
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
  [key: string]: string | number | string[] | boolean ; // For any additional dynamic fields
}
interface RegisterFormProps {
  pageType: 'regular' | 'patient';
  therapist: string;
}
const FormRegisterPatient: React.FC<RegisterFormProps> = ({ pageType, therapist }) => {

  const {t} = useTranslation();

  // State for storing the form data
  const [formData, setFormData] = useState<FormData>({
    therapist: therapist,
    email: '',
    password: '',
    repeatPassword: '',
    userType: 'Patient',
    firstName: '',
    lastName: '',
    phone: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [registered, setRegistered] = useState(false);
  const [patientId, setPatientId] = useState(null);
  const [diagnoses, setDiagnoses] = useState([]);

  // Handle multiple function selections
  const handleFunctionChange = (selectedOptions: any) => {
    const selectedFunctions = selectedOptions ? selectedOptions.map((option: any) => option.value) : [];
    setFormData({ ...formData, function: selectedOptions as string[], diagnosis: [] });
    // Gather all relevant diagnoses based on selected functions

    const allDiagnoses = selectedFunctions.flatMap((func: string) =>
      // @ts-ignore
      config.patientInfo.function[func]?.diagnosis || [],
    );
    setDiagnoses(allDiagnoses);
  };

  // Handle multiple diagnosis selections
  const handleDiagnosisChange = (selectedOptions: any) => {
    setFormData((prevData) => ({
      ...prevData,
      diagnosis: selectedOptions as string[],
    }));
  };


  const [errors, setErrors] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    repeatPassword: '',
    phone: '',
  });

  // State to manage if "Next" was clicked and render additional fields
  const [step, setStep] = useState(1);
  const [valid, setValid] = useState(false);

  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData({ ...formData, [id]: value });
  };
  const animatedComponents = makeAnimated();

  // Handle the "Back" button click
  const handleBack = () => {
      setStep(step - 1); // Move to the next step when "Next" is clicked
  };

  const handleModalClose = () => {
    if (pageType === 'regular'){
      // @ts-ignore
      handleRegShow();  // This will hide the modal (assuming it toggles the `show` state)
    }
    setStep(1);       // This will reset the step to 1
    // Reset the form data
    setFormData({
      email: '',
      password: '',
      repeatPassword: '',
      userType: '',
      firstName: '',
      lastName: '',
      phone: '',
    });

    setShowPassword(false);
    setPasswordError('');
    setErrors({
      email: '',
      password: '',
      repeatPassword: '',
      firstName: '',
      lastName: '',
      phone: '',
    })
    setRegistered(false)
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const {validity, newErrors} = validateCurrentStep(formData, step);
    // @ts-ignore
    setErrors(newErrors)
    setValid(validity)
    if (validity) {
      try {
        // Send form data to the server via POST request
        const response = await apiClient.post('/register/', formData);

        // Check the response for success
        if (response.data && response.status >= 200) {
          console.log('Filtered Data for Submission:', formData);
          // Set registered state to true
          setRegistered(true);

          // Handle redirection after successful registration (e.g., navigate to another page)
          setPatientId(response.data['id'])
        }
      } catch (error) {
        // Handle error response
        if (axios.isAxiosError(error) && error.response) {
          console.error('Registration error: ', error.response.data);
        } else {
          console.error('An unexpected error occurred: ', error);
        }
      }
    }
  };

  const checkPartialForm = () => {

    // @ts-ignore
    if(Object.keys(formData).length >= config.userInfo.formLength[formData.userType][step - 1]){
      const {validity, newErrors} = validateCurrentStep(formData, step);
      // @ts-ignore
      setErrors(newErrors)
      setValid(validity)
      if (validity) {
          setStep(step + 1); // Move to the next step when "Next" is clicked
          setPasswordError('');
          setErrors({ email: '', lastName: '', password: '', repeatPassword: '', firstName: '' , phone: '' });
          if (formData.repeatPassword !== formData.password) {
            setPasswordError('\n Passwords do not match.');
          }
      }
    }
    else{
      setErrors({ email: '', lastName: '', password: '', repeatPassword: '', firstName: 'Fill the empty inputs.', phone: '' });
    }


  }



  return (<div>
    <form onSubmit={handleSubmit}>
      {/* Step 1: Email, Password, Repeat Password */}
      {step === 1 && (
        <>
          {/* first name Field */}
          <div className="mb-3">
            <label htmlFor="firstName" className="form-label">First Name</label>
            <input
              type="text"
              className="form-control"
              id="firstName"
              placeholder="Enter your first name"
              value={formData.firstName}
              onChange={handleChange}
              required
            />
          </div>
          {/* last name Field */}
          <div className="mb-3">
            <label htmlFor="lastName" className="form-label">Last Name</label>
            <input
              type="text"
              className="form-control"
              id="lastName"
              placeholder="Enter your last name"
              value={formData.lastName}
              onChange={handleChange}
              required
            />
          </div>
          {/*Phone Field */}
          <div className="mb-3">
            <label htmlFor="phone" className="form-label">Phone (Optional)</label>
            <input
              type="string"
              className="form-control"
              id="phone"
              placeholder="Enter your phone number"
              value={formData.phone}
              onChange={handleChange}
            />
          </div>
          {/* Email Field */}
          <div className="mb-3">
            <label htmlFor="email" className="form-label">Email (Optional)</label>
            <input
              type="email"
              className="form-control"
              id="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange}
            />
            <div className="invalid-feedback">
              Please provide a username.
            </div>
          </div>

          {/* Password Field */}
          <div className="mb-3">
            <label htmlFor="password" className="form-label">Access Word</label>
            <input
              type='text'
              className="form-control"
              id="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          {/* Repeat Password Field */}
          <div className="mb-3">
            <label htmlFor="repeatPassword" className="form-label">Repeat Access Word</label>
            <input
              type='text'
              className="form-control"
              id="repeatPassword"
              placeholder="Repeat your password"
              value={formData.repeatPassword}
              onChange={handleChange}
              required
            />
          </div>

          {/* Next Button */}
          {formData.userType !== '' && <div className="d-grid">
            <Button
              type="button"
              className="btn btn-primary"
              onClick={checkPartialForm}
            >
              <img className="ms-2" src="Arrow right.svg" alt="Next" />
            </Button>

          </div>}

        </>
      )}


      {/* Step 2: Additional Fields Based on User Type */}
      {step === 2 && (
        <>
          <div className="mb-3">
            <label htmlFor="age" className="form-label">Birth Date</label>
            <input
              type="date"
              className="form-control"
              id="age"
              value={formData.age as string || ''}
              onChange={handleChange}
              required
            />
          </div>


          <div className="mb-3">
            <label htmlFor="sex" className="form-label">Sex</label>
            <Select
              closeMenuOnSelect={true}
              components={animatedComponents}
              // @ts-ignore
              options={config.patientInfo.sex.map((spec) => ({
                label: spec,
                value: spec,
              }))}
              value={formData.sex}
              id="sex"
              onChange={(selectedOptions) => {
                setFormData({
                  ...formData,
                  sex: selectedOptions as string,// This is where we set the selected options
                });
              }}
              required={true}
            />
          </div>

          <div className="mb-3">
            <label htmlFor="function" className="form-label">Speciality</label>
            <Select
              isMulti
              closeMenuOnSelect={false}
              components={animatedComponents}
              // @ts-ignore
              options={Object.keys(config.patientInfo.function).map((spec) => ({
                label: spec,
                value: spec,
              }))}
              // @ts-ignore
              value={formData.function}
              onChange={handleFunctionChange}
            />
          </div>

          <div className="mb-3">
            <label htmlFor="diagnosis" className="form-label">Diagnosis</label>
            <Select
              isMulti
              closeMenuOnSelect={false}
              components={animatedComponents}
              // @ts-ignore
              options={diagnoses.map((diag) => ({ label: diag, value: diag }))}
              value={formData.diagnosis}
              onChange={handleDiagnosisChange}
            />
          </div>


          {/* Next Button */}
          <div className="d-grid">
            <Button
              type="button"
              className="btn btn-primary"
              onClick={checkPartialForm}
            >
              <img className="ms-2" src="Arrow right.svg" alt="Next" />
            </Button>
          </div>

          {/* Back Button */}
          <div className="d-grid">
            <Button
              type="button"
              className="btn btn-primary"
              onClick={handleBack}
              hidden={registered}
            >
              <img className="ms-2" src="Arrow left.svg" alt="Back" />
            </Button>
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <div className="mb-3">
            <label htmlFor="professionalStatus" className="form-label">Professional Status</label>
            <Select
              closeMenuOnSelect={true}
              components={animatedComponents}
              // @ts-ignore
              options={config.patientInfo.professional_status.map((spec) => ({
                label: spec,
                value: spec,
                  }))}
                value={formData.professionalStatus}
                id="professionalStatus"
                onChange={(selectedOptions) => {
                  setFormData({
                    ...formData,
                    professionalStatus: selectedOptions as string,// This is where we set the selected options
                  })
                }}
                required={true}
              />
            </div>


            <div className="mb-3">
              <label htmlFor="levelOfEducation" className="form-label">Level of Education</label>
              <Select
                closeMenuOnSelect={true}
                components={animatedComponents}
                // @ts-ignore
                options={config.patientInfo.level_of_education.map((spec) => ({
                    label: spec,
                    value: spec
                  }))}
                value={formData.levelOfEducation}
                id="levelOfEducation"
                onChange={(selectedOptions) => {
                  setFormData({
                    ...formData,
                    levelOfEducation: selectedOptions as string, // This is where we set the selected options
                  })
                }}
                required={true}
              />
            </div>


            <div className="mb-3">
              <label htmlFor="civilStatus" className="form-label">Civil Status</label>
              <Select
                closeMenuOnSelect={true}
                components={animatedComponents}
                // @ts-ignore
                options={config.patientInfo.marital_status.map((spec) => ({
                  label: spec,
                  value: spec
                }))}
                value={formData.civilStatus}
                id="civilStatus"
                onChange={(selectedOptions) => {
                  setFormData({
                    ...formData,
                    civilStatus: selectedOptions as string, // This is where we set the selected options
                  })
                }}
                required={true}
              />
            </div>

          {/* Next Button */}
          <div className="d-grid">
            <Button
              type="button"
              className="btn btn-primary"
              onClick={checkPartialForm}
            >
              <img className="ms-2" src="Arrow right.svg" alt="Next" />
            </Button>
          </div>
          {/* Back Button */}
          <div className="d-grid">
            <Button
              type="button"
              className="btn btn-primary"
              onClick={handleBack}
            >
              <img className="ms-2" src="Arrow left.svg" alt="Back" />
            </Button>
          </div>
        </>
      )}
      {step === 4 && (
        <>

            <div className="mb-3">
              <label htmlFor="lifestyle" className="form-label">lifestyle</label>
              <Select
                closeMenuOnSelect={false}
                components={animatedComponents}
                isMulti
                // @ts-ignore
                options={config.patientInfo.lifestyle.map((spec) => ({
                  label: spec,
                  value: spec
                }))}
                value={formData.lifestyle}
                id="lifestyle"
                onChange={(selectedOptions) => {
                  setFormData({
                    ...formData,
                    lifestyle: selectedOptions as string[],// This is where we set the selected options
                  })
                }}
                required={true}
              />
            </div>


          <div className="mb-3">
            <label htmlFor="lifeGoals" className="form-label">Life Goals</label>
            <Select
              closeMenuOnSelect={false}
              components={animatedComponents}
              isMulti
              // @ts-ignore
              options={config.patientInfo.personal_goals.map((spec) => ({
                label: spec,
                value: spec
              }))}
              value={formData.lifeGoals}
              id="lifeGoals"
              onChange={(selectedOptions) => {
                setFormData({
                  ...formData,
                  lifeGoals: selectedOptions as string[],// This is where we set the selected options
                })
              }}
              required={true}
            />
          </div>


            <div className="mb-3">
              <label htmlFor="medicationIntake" className="form-label">Medication intake</label>
              <input
                type="text"
                className="form-control"
                id="medicationIntake"
                placeholder="Enter patient-specific information"
                value={formData.medicationIntake as string || ''}
                onChange={handleChange}
                required
              />
            </div>



            <div className="mb-3">
              <label htmlFor="socialSupport" className="form-label">Social Support</label>
              <input
                type="text"
                className="form-control"
                id="socialSupport"
                placeholder="Enter patient-specific information"
                value={formData.socialSupport as string || ''}
                onChange={handleChange}
                required
              />
            </div>


            <div className="mb-3">
              <label htmlFor="duration" className="form-label">Intervention Duration</label>
              <input
                type="number"
                className="form-control"
                id="duration"
                placeholder="Enter Rehabilitation duration in days."
                value={formData.duration as number || 0}
                onChange={handleChange}
                required
              />
            </div>


          <div className="d-grid">
            <Button
              hidden={registered}
              type="submit"
              className="btn btn-success"
            >
              Submit
            </Button>
          </div>
          {/* Back Button */}
          <div className="d-grid">
            <Button
              type="button"
              className="btn btn-primary"
              onClick={handleBack}
              hidden={registered}
            >
              <img className="ms-2" src="Arrow left.svg" alt="Back" />
            </Button>
          </div>
        </>
      )}
      {Object.values(errors).some(value => value !== '') && <div className="alert alert-danger">
        {Object.values(errors).map((error) => (
          <div>{error}</div>
        ))}
      </div>
      }
      {registered && (
        <div className="alert alert-success">
          <div>The patient has been registered. Account information has been sent to the given email.</div>
          <div><strong>Patient ID:</strong> {patientId}</div>
          <div><strong>Access Word:</strong> {formData.password}</div>
          <div>
            <Link to="/patient_home">Click here to log in</Link>
          </div>
        </div>
      )}
    </form>
    </div>
)

};

export default FormRegisterPatient;
