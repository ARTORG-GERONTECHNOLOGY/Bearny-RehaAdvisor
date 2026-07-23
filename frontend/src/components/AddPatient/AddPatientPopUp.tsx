// src/components/TherapistPatientPage/AddPatientPopUp.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import authStore from '@/stores/authStore';
import FormRegisterPatient from '@/components/AddPatient/RegisterPatientForm';
import StandardModal from '../common/StandardModal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface AddPatientPopupProps {
  show: boolean;
  handleClose: () => void;
}

const AddPatientPopup: React.FC<AddPatientPopupProps> = observer(({ show, handleClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // optional: you can wire this to your form later
  const [isDirty] = useState(false);

  useEffect(() => {
    if (!show) return;

    authStore.checkAuthentication();

    if (authStore.isAuthenticated && authStore.userType !== 'Therapist') {
      navigate('/unauthorized');
    }
  }, [show, navigate]);

  const confirmClose = useCallback(() => {
    const msg = isDirty
      ? t('Are you sure you want to close? Unsaved data will be lost.')
      : t('Close this window?');

    if (isDirty && !window.confirm(msg)) return;
    handleClose();
  }, [handleClose, isDirty, t]);

  const footer = useMemo(
    () => (
      <div className="w-full flex justify-end">
        <Button size="dashboard" variant="secondary" onClick={confirmClose}>
          {t('Close')}
        </Button>
      </div>
    ),
    [confirmClose, t]
  );

  return (
    <StandardModal
      show={show}
      onHide={confirmClose}
      title={t('AddaNewPatient')}
      size="lg"
      backdrop="static"
      keyboard // allow Esc -> onHide -> confirmClose
      footer={footer}
    >
      <Card>
        <CardContent className="p-3">
          {authStore.id ? (
            <FormRegisterPatient therapist={authStore.id} />
          ) : (
            <p className="text-muted-foreground text-center mb-0">
              {t('Loading user information...')}
            </p>
          )}
        </CardContent>
      </Card>
    </StandardModal>
  );
});

export default AddPatientPopup;
