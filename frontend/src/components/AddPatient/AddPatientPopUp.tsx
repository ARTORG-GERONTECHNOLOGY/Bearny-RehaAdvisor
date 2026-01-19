import React, { useEffect, useCallback, useState } from 'react';
import { Card, Modal } from 'react-bootstrap';
import FormRegisterPatient from './RegisterPatientForm';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import authStore from '../../stores/authStore';

interface AddPatientPopupProps {
  show: boolean;
  handleClose: () => void;
}

const AddPatientPopup: React.FC<AddPatientPopupProps> = ({ show, handleClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // optional: track “dirty” if you later wire the form to report unsaved changes
  const [isDirty] = useState(false);

  useEffect(() => {
    // Ensure latest auth status
    authStore.checkAuthentication();

    // Only therapists can access this modal
    if (authStore.isAuthenticated && authStore.userType !== 'Therapist') {
      navigate('/unauthorized');
    }
  }, [navigate]);

  const confirmClose = useCallback(() => {
    const msg = isDirty
      ? t('Are you sure you want to close? Unsaved data will be lost.')
      : t('Close this window?');

    if (isDirty && !window.confirm(msg)) return;

    handleClose();
  }, [handleClose, isDirty, t]);

  // Esc should follow the same close logic (even with backdrop="static")
  const onEscapeKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      confirmClose();
    },
    [confirmClose]
  );

  useEffect(() => {
    if (!show) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscapeKeyDown(e);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [show, onEscapeKeyDown]);

  return (
    <Modal
      show={show}
      onHide={confirmClose} // ✅ X button uses confirmClose; Esc will trigger onHide too
      onEscapeKeyDown={(e) => {
        e.preventDefault();
        confirmClose();
      }}
      centered
      size="lg"
      backdrop="static"
      keyboard // ✅ allow Esc to trigger onHide
    >
      <Modal.Header closeButton>
        <Modal.Title>{t('AddaNewPatient')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <Card>
          <Card.Body>
            {/* Patient Registration Form */}
            {authStore.id ? (
              <FormRegisterPatient therapist={authStore.id} />
            ) : (
              <p className="text-muted text-center">{t('Loading user information...')}</p>
            )}
          </Card.Body>
        </Card>
      </Modal.Body>
    </Modal>
  );
};

export default AddPatientPopup;
