// src/components/UserProfile/DeleteConfirmation.tsx
import React from 'react';
import { Button, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import StandardModal from '../common/StandardModal';

interface DeleteConfirmationProps {
  show: boolean;
  handleClose: () => void;
  handleConfirm: () => void;
  isLoading?: boolean;
}

const DeleteConfirmation: React.FC<DeleteConfirmationProps> = ({
  show,
  handleClose,
  handleConfirm,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  return (
    <StandardModal
      show={show}
      onHide={isLoading ? () => {} : handleClose}
      title={t('Delete Account')}
      size="sm"
      centered
      backdrop="static"
      keyboard={false}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
            {t('Cancel')}
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? (
              <>
                <Spinner size="sm" animation="border" className="me-2" />
                {t('Deleting...')}
              </>
            ) : (
              t('Delete Account')
            )}
          </Button>
        </>
      }
    >
      <p className="mb-2">
        {t('Are you sure you want to delete your account? This action cannot be undone.')}
      </p>

      {isLoading && (
        <div className="d-flex align-items-center gap-2 text-muted">
          <Spinner animation="border" size="sm" />
          <span>{t('Deleting account...')}</span>
        </div>
      )}
    </StandardModal>
  );
};

export default DeleteConfirmation;
