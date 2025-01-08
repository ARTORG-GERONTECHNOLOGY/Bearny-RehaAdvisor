import React, { useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import makeAnimated from 'react-select/animated';
import Select from 'react-select';
import { Icon } from 'react-icons-kit';
import { eyeOff } from 'react-icons-kit/feather/eyeOff';
import { eye } from 'react-icons-kit/feather/eye';
import { validateCurrentStep } from '../../utils/validation';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
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
  show: boolean;
  handleRegShow: () => void;
  pageType: 'regular' | 'patient';
}
const FormRegister: React.FC<RegisterFormProps> = ({ show, handleRegShow, pageType }) => {

  const {t} = useTranslation();
// Based on the pageType, fetch the relevant object from the translations
  const userTypes = Object.keys(t('RegisteringTypes', { returnObjects: true }))
  // State for storing the form data
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    repeatPassword: '',
    userType: '',
    firstName: '',
    lastName: '',
    phone: '',
  });

  const [icon, setIcon] = useState(eyeOff);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [registered, setRegistered] = useState(false);
  const [iconRepeat, setIconRepeat] = useState(eyeOff);
  const [showPasswordRepeat, setShowPasswordRepeat] = useState(false);

  const handleToggle = () => {
    if (!showPassword){
      setIcon(eye);
      setShowPassword(true)
    } else {
      setIcon(eyeOff)
      setShowPassword(false)
    }
  }
  const handleToggleRepeat = () => {
    if (!showPasswordRepeat){
      setIconRepeat(eye);
      setShowPasswordRepeat(true)
    } else {
      setIconRepeat(eyeOff)
      setShowPasswordRepeat(false)
    }
  }
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
      setRegistered(false);
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
    setIcon(eyeOff);
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

  const handleCloseAlert = () => {
    setRegistered(false); // Hide the alert
    handleModalClose();  // Close the modal
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { newErrors, validity } = validateCurrentStep(formData, step);
    // @ts-ignore
    setErrors(newErrors)
    if (validity) {
      try {
        // Send form data to the server via POST request
        console.log(formData);
        const response = await apiClient.post('/auth/register/', formData);

        // Check the response for success
        if (response.data && response.status === 201) {
          console.log('Filtered Data for Submission:', formData);
          // Set registered state to true
          setRegistered(true);
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
      const { newErrors, validity} = validateCurrentStep(formData, step)
      // @ts-ignore
      setErrors(newErrors)
      setValid(validity)
      console.log(validity)
      if (validity) {
          setStep(step + 1); // Move to the next step when "Next" is clicked
          setPasswordError('');
          setErrors({ email: '', lastName: '', password: '', repeatPassword: '', firstName: '', phone: '' })
          if (formData.repeatPassword !== formData.password) {
            setPasswordError('\n Passwords do not match.');
          }
      }
    }
    else{
      setErrors({ email: '', lastName: '', password: '', repeatPassword: '', firstName: 'Fill the empty inputs.', phone: ''})
    }


  }


  return (
          <Modal show={show} onHide={handleModalClose}>
            <Modal.Header closeButton>
              <Modal.Title>Register</Modal.Title>
            </Modal.Header>
            <Modal.Body>
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
                    {/* Email Field */}
                    <div className="mb-3">
                      <label htmlFor="email" className="form-label">Email</label>
                      <input
                        type="email"
                        autoComplete="email"
                        className="form-control"
                        id="email"
                        placeholder="Enter your email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                      />
                      <div className="invalid-feedback">
                        Please provide a username.
                      </div>
                    </div>

                    {/*Phone Field */}
                    <div className="mb-3">
                      <label htmlFor="phone" className="form-label">Phone</label>
                      <input
                        type="string"
                        className="form-control"
                        id="phone"
                        placeholder="Enter your phone number"
                        value={formData.phone}
                        onChange={handleChange}
                        required
                      />
                    </div>

                    {/* Password Field */}
                    <div className="mb-3 position-relative">
                      <label htmlFor="password" className="form-label">Password</label>

                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        className="form-control"
                        id="password"
                        placeholder="Enter your password"
                        value={formData.password}
                        onChange={handleChange}
                        required
                      />

                      {/* Eye Icon */}
                      <span
                        className="position-absolute end-0 top-50 translate-middle-y me-3"
                        style={{ cursor: 'pointer' }}
                        onClick={handleToggle}
                      >
                          <Icon icon={icon} size={25} />
                        </span>

                      <small className="text-danger">{passwordError}</small>
                    </div>

                    {/* Repeat Password Field */}
                    <div className="mb-3 position-relative">
                      <label htmlFor="repeatPassword" className="form-label">Repeat Password</label>
                      <input
                        type={showPasswordRepeat ? 'text' : 'password'}
                        autoComplete="new-password"
                        className="form-control"
                        id="repeatPassword"
                        placeholder="Repeat your password"
                        value={formData.repeatPassword}
                        onChange={handleChange}
                        required
                      />
                      <span className="position-absolute end-0 top-50 translate-middle-y me-3" onClick={handleToggleRepeat}>
                  <Icon icon={iconRepeat} size={25} />
              </span>
                    </div>

                    {/* Dynamically generate options from array */}
                    <div className="mb-3">
                      <label htmlFor="userType" className="form-label">User Type</label>
                      <select
                        className="form-select"
                        id="userType"
                        value={formData.userType}
                        onChange={handleChange}
                        required
                      >
                        <option value="">Select User Type</option>
                        {config.Users.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    {/* Next Button */}
                    {formData.userType !== '' && <div className="d-grid">
                      <Button
                        type="button"
                        className="btn btn-primary"
                        onClick={checkPartialForm}
                      >
                        <img className="ms-2" src={"src/assets/Icons/arrow-left.svg"} alt="Next" />
                      </Button>

                    </div>}

                  </>
                )}


                {/* Step 2: Additional Fields Based on User Type */}
                {step === 2 && (
                  <>

                    {formData.userType === 'Therapist' && (
                      <div className="mb-3">
                        <label htmlFor="specialisation" className="form-label">Specialisation</label>
                        <Select
                          closeMenuOnSelect={true}
                          components={animatedComponents}
                          // @ts-ignore
                          options={config.therapistInfo.specializations.map((spec) => ({
                              label: spec,
                              value: spec
                            }))}
                          value={formData.specialisation || ''}
                          id="clinic"
                          onChange={(selectedOptions) => {
                            setFormData({
                              ...formData,
                              specialisation: selectedOptions as string // This is where we set the selected options
                            });
                          }}
                          required={true}
                        />
                      </div>
                    )}

                    {(formData.userType === 'Therapist' || formData.userType === 'Researcher') && (
                      <div className="mb-3">
                        <label htmlFor="clinic" className="form-label">{t("clinic")}</label>
                        <Select
                          closeMenuOnSelect={false}
                          components={animatedComponents}
                          isMulti
                          // @ts-ignore
                          options={config.therapistInfo.clinics.map((clinic) => ({
                            label: clinic,
                            value: clinic
                          }))}
                          value={formData.clinic || []}
                          id="clinic"
                          onChange={(selectedOptions) => {
                            setFormData({
                              ...formData,
                              clinic: selectedOptions as string[]
                            });
                          }}
                          required={true}
                        />
                      </div>
                    )}


                    {formData.userType === 'Researcher' && (
                      <div className="mb-3">
                        <label htmlFor="researcherInfo" className="form-label">Researcher Info</label>
                        <input
                          type="text"
                          className="form-control"
                          id="researcherInfo"
                          placeholder="Enter researcher-specific information"
                          value={formData.researcherInfo as string || ''}
                          onChange={handleChange}
                          required
                        />
                      </div>
                    )}

                    {formData.userType === 'admin' && (
                      <div className="mb-3">
                        <label htmlFor="adminInfo" className="form-label">Admin Info</label>
                        <input
                          type="text"
                          className="form-control"
                          id="adminInfo"
                          placeholder="Enter admin-specific information"
                          value={formData.adminInfo as string || ''}
                          onChange={handleChange}
                          required
                        />
                      </div>
                    )}

                    {/* Submit Button */}
                    {(formData.userType === 'Therapist' || formData.userType === 'Researcher') && (
                      <div className="d-grid">
                        <Button
                          type="submit"
                          className="btn btn-success"
                          hidden={registered}
                        >
                          <img className="ms-2" src={"src/assets/Icons/arrow-left.svg"} alt="Submit" />
                        </Button>
                      </div>
                    )}


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
                {registered && <div className="alert alert-success">
                  <div>You have been Registered. Your account information has been sent to the given email.</div>
                  <button type="button" className="btn-close" aria-label="Close" onClick={handleCloseAlert}></button>
                </div>}

              </form>
            </Modal.Body>
          </Modal>
  );
};

export default FormRegister;
