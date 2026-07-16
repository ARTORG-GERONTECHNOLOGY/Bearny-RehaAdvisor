import React from 'react';
import { useTranslation } from 'react-i18next';
import { FaKey } from 'react-icons/fa';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import PasswordField from '@/components/forms/input/PasswordField';
import ErrorAlert from '@/components/common/ErrorAlert';

interface PasswordResetSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  passwordNew: string;
  passwordConfirm: string;
  passwordError: string | null;
  passwordSuccess: boolean;
  passwordSaving: boolean;

  onPasswordNewChange: (value: string) => void;
  onPasswordConfirmChange: (value: string) => void;
  onSubmit: () => void;
}

const PasswordResetSheet: React.FC<PasswordResetSheetProps> = ({
  open,
  onOpenChange,
  passwordNew,
  passwordConfirm,
  passwordError,
  passwordSuccess,
  passwordSaving,
  onPasswordNewChange,
  onPasswordConfirmChange,
  onSubmit,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ResetPassword')}</DialogTitle>
          <DialogDescription>{t('PasswordStrengthHint')}</DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {passwordError && <ErrorAlert message={passwordError} />}
          {passwordSuccess && (
            <div role="status" className="bg-ok/5 p-3 mb-2 text-ok text-sm rounded-md">
              {t('PasswordResetSuccess')}
            </div>
          )}

          <FieldGroup>
            <PasswordField
              id="pw-reset-new"
              label={t('NewPassword')}
              placeholder="••••••••"
              value={passwordNew}
              onChange={(e) => onPasswordNewChange(e.target.value)}
              autoComplete="new-password"
            />

            <PasswordField
              id="pw-reset-confirm"
              label={t('ConfirmPassword')}
              placeholder="••••••••"
              value={passwordConfirm}
              onChange={(e) => onPasswordConfirmChange(e.target.value)}
              autoComplete="new-password"
            />
          </FieldGroup>

          <DialogFooter className="mt-4">
            <Button size="dashboard" disabled={passwordSaving} onClick={onSubmit}>
              <FaKey />
              {passwordSaving ? t('Saving...') : t('SetNewPassword')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PasswordResetSheet;
