// src/components/UserProfile/ChangePasswordForm.tsx
import React, { useState } from 'react';
import { Button, Form, InputGroup } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { observer } from 'mobx-react-lite';

import ErrorAlert from '../common/ErrorAlert';
import userProfileStore from '../../stores/userProfileStore';

type Props = {
  onCancel: () => void;
};

const ChangePasswordForm: React.FC<Props> = observer(({ onCancel }) => {
  const { t } = useTranslation();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [show, setShow] = useState({ old: false, neo: false, confirm: false });
  const [localError, setLocalError] = useState('');

  const validate = () => {
    if (!oldPassword) return t('Please enter your old password.');
    if (!newPassword) return t('Please enter a new password.');
    if (newPassword.length < 8) return t('New password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return t('New passwords do not match!');
    return '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    const msg = validate();
    if (msg) {
      setLocalError(msg);
      return;
    }

    await userProfileStore.changePassword(oldPassword, newPassword);

    // clear fields if successful
    if (!userProfileStore.errorBanner) {
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const saving = userProfileStore.saving;

  return (
    <Form onSubmit={submit} aria-label={t('Change Password Form')}>
      {localError && <ErrorAlert message={localError} onClose={() => setLocalError('')} />}

      <Form.Group className="mb-3" controlId="oldPassword">
        <Form.Label>{t('Old Password')}</Form.Label>
        <InputGroup>
          <Form.Control
            type={show.old ? 'text' : 'password'}
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            autoComplete="current-password"
            disabled={saving}
          />
          <Button
            variant="outline-secondary"
            type="button"
            onClick={() => setShow((p) => ({ ...p, old: !p.old }))}
            disabled={saving}
          >
            {show.old ? <FaEyeSlash /> : <FaEye />}
          </Button>
        </InputGroup>
      </Form.Group>

      <Form.Group className="mb-3" controlId="newPassword">
        <Form.Label>{t('New Password')}</Form.Label>
        <InputGroup>
          <Form.Control
            type={show.neo ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            disabled={saving}
          />
          <Button
            variant="outline-secondary"
            type="button"
            onClick={() => setShow((p) => ({ ...p, neo: !p.neo }))}
            disabled={saving}
          >
            {show.neo ? <FaEyeSlash /> : <FaEye />}
          </Button>
        </InputGroup>
      </Form.Group>

      <Form.Group className="mb-3" controlId="confirmPassword">
        <Form.Label>{t('Confirm New Password')}</Form.Label>
        <InputGroup>
          <Form.Control
            type={show.confirm ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            disabled={saving}
          />
          <Button
            variant="outline-secondary"
            type="button"
            onClick={() => setShow((p) => ({ ...p, confirm: !p.confirm }))}
            disabled={saving}
          >
            {show.confirm ? <FaEyeSlash /> : <FaEye />}
          </Button>
        </InputGroup>
      </Form.Group>

      <div className="d-flex justify-content-between mt-4">
        <Button variant="secondary" type="button" onClick={onCancel} disabled={saving}>
          {t('Cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? t('Saving...') : t('Change Password')}
        </Button>
      </div>
    </Form>
  );
});

export default ChangePasswordForm;
