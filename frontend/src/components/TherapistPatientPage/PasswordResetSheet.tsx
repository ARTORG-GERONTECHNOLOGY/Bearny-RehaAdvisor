import React from 'react';
import { Form } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaKey } from 'react-icons/fa';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{t('ResetPassword')}</SheetTitle>
          <SheetDescription>{t('PasswordStrengthHint')}</SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          {passwordError && (
            <div className="alert alert-danger py-2 px-3 mb-2" role="alert">
              {passwordError}
            </div>
          )}
          {passwordSuccess && (
            <div className="alert alert-success py-2 px-3 mb-2" role="alert">
              {t('PasswordResetSuccess')}
            </div>
          )}

          <Form.Group controlId="pw-reset-new" className="mb-3">
            <Form.Label className="small mb-1">{t('NewPassword')}</Form.Label>
            <Form.Control
              type="password"
              value={passwordNew}
              onChange={(e) => onPasswordNewChange(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Form.Group>

          <Form.Group controlId="pw-reset-confirm" className="mb-3">
            <Form.Label className="small mb-1">{t('ConfirmPassword')}</Form.Label>
            <Form.Control
              type="password"
              value={passwordConfirm}
              onChange={(e) => onPasswordConfirmChange(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Form.Group>

          <SheetFooter>
            <Button size="dashboard" disabled={passwordSaving} onClick={onSubmit}>
              <FaKey />
              {passwordSaving ? t('Saving...') : t('SetNewPassword')}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default PasswordResetSheet;
