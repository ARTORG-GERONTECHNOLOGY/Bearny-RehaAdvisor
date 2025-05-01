import React, { useEffect } from 'react';
import { Card, Modal } from 'react-bootstrap';
import FormRegisterPatient from './RegisterPatientForm'; // Import the registration form component
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom'; // For redirecting unauthorized users
import authStore from '../../stores/authStore';

interface AddPatientPopupProps {
  show: boolean;
  handleClose: () => void;
}

const AddPatientPopup: React.FC<AddPatientPopupProps> = ({ show, handleClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate(); // Used for navigation

  // Authentication and role check
  useEffect(() => {
    authStore.checkAuthentication();
    if (authStore.isAuthenticated && authStore.userType !== 'Therapist') {
      navigate('/unauthorized'); // Redirect to unauthorized access page if not a therapist
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
            {/* Registration Form */}
            <FormRegisterPatient therapist={authStore.id} />
          </Card.Body>
        </Card>
      </Modal.Body>
    </Modal>
  );
};

export default AddPatientPopup;
