import React, { useEffect } from 'react';
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

  useEffect(() => {
    // Ensure latest auth status
    authStore.checkAuthentication();

    // Only therapists can access this modal
    if (authStore.isAuthenticated && authStore.userType !== 'Therapist') {
      navigate('/unauthorized');
    }
  }, [navigate]);

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static" keyboard={false}>
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
