// src/components/UserProfile/DeleteConfirmation.tsx
import React from 'react';
import { Modal, Button, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

interface DeleteConfirmationProps {
  show: boolean;
  handleClose: () => void;
  handleConfirm: () => void;
  isLoading?: boolean; // ✅ NEW
}

const DeleteConfirmation: React.FC<DeleteConfirmationProps> = ({
  show,
  handleClose,
  handleConfirm,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      show={show}
      onHide={isLoading ? undefined : handleClose} // ✅ prevent closing during delete
      centered
      backdrop="static"
      keyboard={false}
      aria-labelledby="delete-account-modal-title"
    >
      <Modal.Header closeButton={!isLoading}>
        <Modal.Title id="delete-account-modal-title">
          {t('Delete Account')}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <p>
          {t(
            'Are you sure you want to delete your account? This action cannot be undone.'
          )}
        </p>

        {isLoading && (
          <div className="d-flex align-items-center gap-2 text-muted">
            <Spinner animation="border" size="sm" />
            <span>{t('Deleting account...')}</span>
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button
          variant="secondary"
          onClick={handleClose}
          aria-label={t('Cancel')}
          disabled={isLoading} // ✅ disable while deleting
        >
          {t('Cancel')}
        </Button>

        <Button
          variant="danger"
          onClick={handleConfirm}
          aria-label={t('Delete Account')}
          disabled={isLoading} // ✅ disable while deleting
        >
          {isLoading ? (
            <>
              <Spinner size="sm" animation="border" className="me-2" />
              {t('Deleting...')}
            </>
          ) : (
            t('Delete Account')
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default DeleteConfirmation;
