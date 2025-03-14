import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import authStore from '../../stores/authStore';
import apiClient from '../../api/client';
import handleApiError from '../../utils/errorHandler';
import { AxiosError } from 'axios';
import InputField from '../forms/input/InputField';
import PasswordField from '../forms/input/PasswordField';
import ForgotPasswordLink from '../common/ForgotPasswordLink';

interface LoginFormProps {
  show: boolean;
  handleClose: () => void;
  pageType: 'regular' | 'patient';
}

const LoginForm: React.FC<LoginFormProps> = ({ show, handleClose, pageType }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [is2FARequired, setIs2FARequired] = useState(false); // State for handling 2FA
  const [verificationCode, setVerificationCode] = useState(''); // State for the 2FA code
  const [loginSuccess, setLoginSuccess] = useState(false); // Track if username/password is correct

  const handleToggle = () => setShowPassword(!showPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await authStore.loginWithHttp()

      if (authStore.isAuthenticated) {
        // If it's a non-patient user, trigger 2FA
        if (pageType !== 'patient') { //if (pageType !== 'Patient') { 
          setIs2FARequired(true);
          setLoginSuccess(true);
          // Trigger the backend to send the verification code via SMS
          await apiClient.post('/auth/send-verification-code/', { userId: authStore.id });
        } else {
          navigate(`/${authStore.userType.toLowerCase()}`); // Directly navigate for patient
        }
      }
    } catch (error: AxiosError | any) {
      handleApiError(error, authStore);
    }
  };

  // Handle 2FA Code Submission
  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Submit the 2FA code to verify
      const response = await apiClient.post('/auth/verify-code/', {
        userId: authStore.id,
        verificationCode: verificationCode,
      });

      if (response.status === 200) {
        navigate(`/${authStore.userType.toLowerCase()}`); // Redirect to the user's home page after successful 2FA
      } else {
        authStore.setLoginError(t('Invalid verification code'));
      }
    } catch (error: AxiosError | any) {
      handleApiError(error, authStore);
    }
  };

  const handleModalClose = () => {
    handleClose();
    authStore.reset();
    setIs2FARequired(false);
    setVerificationCode('');
  };

  return (
    <Modal show={show} onHide={handleModalClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>{t('Login')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {!is2FARequired ? (
          <form onSubmit={handleSubmit}>
            {/* Email or Username Field */}
            <InputField
              id="email"
              label={pageType === 'patient' ? t('Patient Id') : t('Email')}
              type={pageType === 'patient' ? 'text' : 'email'}
              value={authStore.email}
              onChange={(e) => authStore.setEmail(e.target.value)}
              placeholder={pageType === 'patient' ? t('Enter Patient Id') : t('Email')}
              required
            />

            {/* Password Field */}
            <PasswordField
              id="password"
              value={authStore.password}
              onChange={(e) => authStore.setPassword(e.target.value)}
              showPassword={showPassword}
              onToggle={handleToggle}
              pagetype={pageType}
              required
            />

            <ForgotPasswordLink onClick={() => navigate('/forgottenpwd')} text={t("Need help recovering your account?")} />

            {authStore.loginError && (
              <div className="alert alert-danger">{authStore.loginError}</div>
            )}

            <button type="submit" className="btn btn-primary">
              {t('Login')}
            </button>
          </form>
        ) : (
          // 2FA Form (shown after successful username/password login for non-patients)
          <form onSubmit={handle2FASubmit}>
            <h5>{t('Entertheverificationcodesenttoyourphone')}</h5>
            <InputField
              id="verificationCode"
              label={t('VerificationCode')}
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder={t('Enterverificationcode')}
            />

            {authStore.loginError && (
              <div className="alert alert-danger">{authStore.loginError}</div>
            )}

            <button type="submit" className="btn btn-primary">
              {t('SubmitCode')}
            </button>
          </form>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default observer(LoginForm);
