import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import authStore from '../../stores/authStore';
import apiClient from '../../api/client';
import handleApiError from '../../utils/errorHandler';
import InputField from '../forms/input/InputField';
import PasswordField from '../forms/input/PasswordField';
import ForgotPasswordLink from '../common/ForgotPasswordLink';
import ErrorAlert from '../common/ErrorAlert';

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
  const [error, setError] = useState<string | null>(null);

  const handleToggle = () => setShowPassword(!showPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); // Clear any previous errors

    try {
      await authStore.loginWithHttp();

      // Explicit check after login TODO Check success of request not if authenticated
      if (authStore.loginErrorMessage) {
        setError(authStore.loginErrorMessage);
        return;
      }

      if (pageType !== 'patient') {
        setIs2FARequired(true);

        try {
          await apiClient.post('/auth/send-verification-code/', { userId: authStore.id });
        } catch (sendCodeErr) {
          setError('Login succeeded but failed to send verification code.');
          console.error('2FA code send failed:', sendCodeErr);
        }
      } else {
        authStore.setAuthenticated(true);
        navigate(`/${authStore.userType.toLowerCase()}`);
      }
    } catch (err) {
      handleApiError(err, authStore);
      setError(err.message || 'Login failed. Please try again.');
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
        authStore.setAuthenticated(true);
        navigate(`/${authStore.userType.toLowerCase()}`); // Redirect to the user's home page after successful 2FA
      } else {
        authStore.setLoginError(t('Invalid verification code'));
      }
    } catch (err) {
      handleApiError(err, authStore);
      setError(err.message || 'Invalid verification code');
    }
  };

  const handleModalClose = () => {
    handleClose();
    authStore.reset();
    setIs2FARequired(false);
    setVerificationCode('');
  };

  return (
    <Modal
      show={show}
      onHide={handleModalClose}
      centered
      size="lg"
      backdrop="static"
      keyboard={false}
    >
      <Modal.Header closeButton>
        <Modal.Title>{t('Login')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {!is2FARequired ? (
          <form onSubmit={handleSubmit}>
            {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
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

            <ForgotPasswordLink
              onClick={() => navigate('/forgottenpwd')}
              text={t('Need help recovering your account?')}
            />

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
            {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
            <h5>{t('Entertheverificationcodesenttoyourphone')}</h5>
            <InputField
              id="verificationCode"
              label={t('VerificationCode')}
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder={t('Enterverificationcode')}
            />

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
