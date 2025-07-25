import React from 'react';
import { Modal, Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

interface DeleteConfirmationProps {
  show: boolean;
  handleClose: () => void;
  handleConfirm: () => void;
}

const DeleteConfirmation: React.FC<DeleteConfirmationProps> = ({
  show,
  handleClose,
  handleConfirm,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      show={show}
      onHide={handleClose}
      centered
      backdrop="static"
      keyboard={false}
      aria-labelledby="delete-account-modal-title"
    >
      <Modal.Header closeButton>
        <Modal.Title id="delete-account-modal-title">
          {t('Delete Account')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>{t('Are you sure you want to delete your account? This action cannot be undone.')}</p>
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="secondary"
          onClick={handleClose}
          aria-label={t('Cancel')}
        >
          {t('Cancel')}
        </Button>
        <Button
          variant="danger"
          onClick={handleConfirm}
          aria-label={t('Delete Account')}
        >
          {t('Delete Account')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default DeleteConfirmation;
