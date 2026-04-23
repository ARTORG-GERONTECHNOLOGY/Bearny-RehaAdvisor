// src/components/UserProfile/ChangePasswordSheet.tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import userProfileStore from '@/stores/userProfileStore';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import PasswordField from '@/components/forms/input/PasswordField';
import ErrorAlert from '@/components/common/ErrorAlert';
import { FieldGroup } from '@/components/ui/field';

type Props = {
  show: boolean;
  onCancel: () => void;
};

const ChangePasswordSheet: React.FC<Props> = observer(({ show, onCancel }) => {
  const { t } = useTranslation();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [localError, setLocalError] = useState('');

  const saving = userProfileStore.saving;

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

    if (!userProfileStore.errorBanner) {
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !saving) onCancel();
  };

  return (
    <Sheet open={show} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="flex flex-col max-w-lg mx-auto"
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        <SheetHeader>
          <SheetTitle>{t('Change Password')}</SheetTitle>
        </SheetHeader>

        <form onSubmit={submit} aria-label={t('Change Password Form')}>
          {localError && <ErrorAlert message={localError} onClose={() => setLocalError('')} />}

          <FieldGroup>
            <PasswordField
              id="oldPassword"
              label={t('Old Password')}
              placeholder=""
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
              disabled={saving}
            />
            <PasswordField
              id="newPassword"
              label={t('New Password')}
              placeholder=""
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              disabled={saving}
            />
            <PasswordField
              id="confirmPassword"
              label={t('Confirm New Password')}
              placeholder=""
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={saving}
            />
          </FieldGroup>

          <SheetFooter className="mt-6">
            <Button variant="secondary" type="button" onClick={onCancel} disabled={saving}>
              {t('Cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('Saving...') : t('Change Password')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
});

export default ChangePasswordSheet;
