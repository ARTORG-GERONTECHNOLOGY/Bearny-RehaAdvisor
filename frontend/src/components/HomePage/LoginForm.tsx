import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Modal, Button, Form } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import authStore from '../../stores/authStore';
import apiClient from '../../api/client';
import handleApiError from '../../utils/errorHandler';
import InputField from '../forms/input/InputField';
import PasswordField from '../forms/input/PasswordField';
import ForgotPasswordLink from '../common/ForgotPasswordLink';
import ErrorAlert from '../common/ErrorAlert';
import InfoBubble from '../common/InfoBubble'; // Optional, for tooltip hints

interface LoginFormProps {
  show: boolean;
  handleClose: () => void;
  pageType: 'regular' | 'patient';
}

const LoginForm: React.FC<LoginFormProps> = ({ show, handleClose, pageType }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [is2FARequired, setIs2FARequired] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleToggle = () => setShowPassword(!showPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await authStore.loginWithHttp();

      if (authStore.loginErrorMessage) {
        setError(authStore.loginErrorMessage);
        return;
      }

      if (pageType !== 'patient') {
        setIs2FARequired(true);
        try {
          await apiClient.post('/auth/send-verification-code/', { userId: authStore.id });
        } catch (sendCodeErr) {
          setError(t('Login succeeded but failed to send verification code.'));
          console.error('2FA code send failed:', sendCodeErr);
        }
      } else {
        authStore.setAuthenticated(true);
        navigate(`/${authStore.userType.toLowerCase()}`);
      }
    } catch (err: any) {
      handleApiError(err, authStore);
      setError(err.message || t('Login failed. Please try again.'));
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await apiClient.post('/auth/verify-code/', {
        userId: authStore.id,
        verificationCode,
      });

      if (response.status === 200) {
        authStore.setAuthenticated(true);
        navigate(`/${authStore.userType.toLowerCase()}`);
      } else {
        authStore.setLoginError(t('Invalid verification code'));
      }
    } catch (err: any) {
      handleApiError(err, authStore);
      setError(err.message || t('Invalid verification code'));
    }
  };

  const handleModalClose = () => {
    handleClose();
    authStore.reset();
    setIs2FARequired(false);
    setVerificationCode('');
    setError(null);
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
          <Form onSubmit={handleSubmit}>
            {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

            {/* Login identifier */}
            <InputField
              id="email"
              label={
                <>
                  {pageType === 'patient' ? t('Patient Id') : t('Email')}
                  <InfoBubble tooltip={t('This is your registered email or patient ID.')} />
                </>
              }
              type={pageType === 'patient' ? 'text' : 'email'}
              value={authStore.email}
              onChange={(e) => authStore.setEmail(e.target.value)}
              placeholder={pageType === 'patient' ? t('Enter Patient Id') : t('Enter your email')}
              required
            />

            {/* Password input */}
            <PasswordField
              id="password"
              value={authStore.password}
              onChange={(e) => authStore.setPassword(e.target.value)}
              showPassword={showPassword}
              onToggle={handleToggle}
              pagetype={pageType}
              required
            />

            {/* Forgot password link (only for non-patients) */}
            {pageType !== 'patient' && (
              <ForgotPasswordLink
                onClick={() => navigate('/forgottenpwd')}
                text={t('Need help recovering your account?')}
              />
            )}

            {authStore.loginError && (
              <div className="alert alert-danger mt-3">{authStore.loginError}</div>
            )}

            <Button type="submit" variant="primary" className="mt-3 w-100">
              {t('Login')}
            </Button>
          </Form>
        ) : (
          <Form onSubmit={handle2FASubmit}>
            {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

            <h5 className="mb-3">{t('Entertheverificationcodesenttoyourphone')}</h5>
            <InputField
              id="verificationCode"
              label={
                <>
                  {t('VerificationCode')}
                  <InfoBubble tooltip={t('This 6-digit code was sent to your registered phone.')} />
                </>
              }
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder={t('Enterverificationcode')}
              required
            />

            <Button type="submit" variant="success" className="mt-3 w-100">
              {t('SubmitCode')}
            </Button>
          </Form>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default observer(LoginForm);
