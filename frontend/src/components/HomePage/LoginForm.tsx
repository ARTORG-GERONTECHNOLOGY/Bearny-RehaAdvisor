// components/HomePage/LoginForm.tsx
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
import InfoBubble from '../common/InfoBubble';

interface Props {
  show: boolean;
  handleClose: () => void;
}

const LoginForm: React.FC<Props> = ({ show, handleClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [is2FARequired, setIs2FARequired] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    authStore.reset();
    setShowPassword(false);
    setIs2FARequired(false);
    setVerificationCode('');
    setError(null);
  };

  const onClose = () => {
    handleClose();
    reset();
  };

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      // This should set id, userType, tokens, and loginErrorMessage on the store
      await authStore.loginWithHttp();

      if (authStore.loginErrorMessage) {
        setError(authStore.loginErrorMessage);
        return;
      }

      const utype = (authStore.userType || '').toLowerCase();

      if (utype === 'therapist' || utype === 'admin') {
        // Therapists and Admins require 2FA
        setIs2FARequired(true);
        try {
          await apiClient.post('/auth/send-verification-code/', { userId: authStore.id });
        } catch (err) {
          setError(t('Login succeeded but failed to send verification code.'));
        }
      } else if (utype === 'patient') {
        authStore.setAuthenticated(true);
        navigate('/patient');
      } else if (utype === 'admin') {
        // ✅ NEW: Admins go straight to /admin
        authStore.setAuthenticated(true);
        navigate('/admin');
      } else if (utype === 'researcher') {
        // (Optional) If you have a researcher area
        authStore.setAuthenticated(true);
        navigate('/researcher');
      } else {
        setError(t('Unsupported account type.'));
      }
    } catch (err: any) {
      handleApiError(err, authStore);
      setError(err?.message || t('Login failed. Please try again.'));
    }
  };

  const submit2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await apiClient.post('/auth/verify-code/', {
        userId: authStore.id,
        verificationCode,
      });

      if (res?.status === 200 && res?.data?.access_token && res?.data?.refresh_token) {
        await authStore.complete2FA(res.data.access_token, res.data.refresh_token);
        const role = (authStore.userType || '').toLowerCase();
        navigate(role === 'admin' ? '/admin' : '/therapist');
      } else {
        setError(t('Verification failed. Please try again.'));
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.detail || err?.message || t('Verification failed. Please try again.')
      );
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>{t('Login')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {!is2FARequired ? (
          <Form onSubmit={submitCredentials}>
            {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

            <InputField
              id="email"
              label={
                <>
                  {t('Email or Patient ID')}
                  <InfoBubble
                    tooltip={t(
                      'Use your registered email (therapist/admin/researcher) or patient ID.'
                    )}
                  />
                </>
              }
              type="text"
              value={authStore.email}
              onChange={(e) => authStore.setEmail(e.target.value)}
              placeholder={t('Enter email or patient ID')}
              required
            />

            <PasswordField
              id="password"
              value={authStore.password}
              onChange={(e) => authStore.setPassword(e.target.value)}
              showPassword={showPassword}
              onToggle={() => setShowPassword((s) => !s)}
              pagetype="regular"
              required
            />

            <ForgotPasswordLink
              onClick={() => navigate('/forgottenpwd')}
              text={t('Need help recovering your account?')}
            />

            {authStore.loginError && (
              <div className="alert alert-danger mt-3">{authStore.loginError}</div>
            )}

            <Button type="submit" variant="primary" className="mt-3 w-100">
              {t('Login')}
            </Button>
          </Form>
        ) : (
          <Form onSubmit={submit2FA}>
            {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

            <h5 className="mb-3">{t('Entertheverificationcodesenttoyourphone')}</h5>

            <InputField
              id="verificationCode"
              label={t('VerificationCode')}
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
