// components/HomePage/LoginForm.tsx
import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import authStore from '@/stores/authStore';
import apiClient from '@/api/client';
import handleApiError from '@/utils/errorHandler';
import InputField from '@/components/forms/input/InputField';
import OTPField from '@/components/forms/input/OTPField';
import PasswordField from '@/components/forms/input/PasswordField';
import ForgotPasswordLink from '@/components//common/ForgotPasswordLink';
import ErrorAlert from '@/components/common/ErrorAlert';
import { FieldGroup } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface Props {
  show: boolean;
  handleClose: () => void;
}

const LoginForm: React.FC<Props> = ({ show, handleClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [is2FARequired, setIs2FARequired] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    authStore.reset();
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
        // Therapists and admins require 2FA phone verification
        setIs2FARequired(true);
        try {
          await apiClient.post('/auth/send-verification-code/', { userId: authStore.id });
        } catch {
          setError(t('Login succeeded but failed to send verification code.'));
        }
      } else if (utype === 'patient') {
        navigate('/patient');
      } else if (utype === 'researcher') {
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
      const backendMsg = err?.response?.data?.error || err?.response?.data?.detail;
      setError(backendMsg ? t(backendMsg) : t('Verification failed. Please try again.'));
    }
  };

  return (
    <Sheet open={show} onOpenChange={onClose}>
      <SheetContent side="bottom" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('Login')}</SheetTitle>
          {is2FARequired && (
            <SheetDescription>{t('Entertheverificationcodesenttoyourphone')}</SheetDescription>
          )}
        </SheetHeader>

        <div className="w-full max-w-sm mx-auto">
          {!is2FARequired ? (
            <form onSubmit={submitCredentials}>
              {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

              <FieldGroup>
                <InputField
                  id="email"
                  label={t('Email or Patient ID')}
                  type="text"
                  value={authStore.email}
                  onChange={(e) => authStore.setEmail(e.target.value)}
                  placeholder={t('Enter email or patient ID')}
                  autoComplete="username"
                />
                <PasswordField
                  id="password"
                  label={t('Password')}
                  value={authStore.password}
                  onChange={(e) => authStore.setPassword(e.target.value)}
                  placeholder={t('Enter your password')}
                  required
                />
                <Button type="submit">{t('Login')}</Button>
              </FieldGroup>

              <ForgotPasswordLink
                onClick={() => navigate('/forgottenpwd')}
                text={t('Need help recovering your account?')}
              />
            </form>
          ) : (
            <form onSubmit={submit2FA}>
              {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

              <FieldGroup className="mt-8">
                <OTPField
                  id="verificationCode"
                  label={t('VerificationCode')}
                  value={verificationCode}
                  onChange={setVerificationCode}
                  required
                />
                <Button type="submit" className="mb-16">
                  {t('SubmitCode')}
                </Button>
              </FieldGroup>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default observer(LoginForm);
