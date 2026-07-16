import React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DeleteConfirmationProps {
  show: boolean;
  handleClose: () => void;
  handleConfirm: () => void;
  isLoading?: boolean;
}

const DeleteConfirmationSheet: React.FC<DeleteConfirmationProps> = ({
  show,
  handleClose,
  handleConfirm,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  const handleOpenChange = (open: boolean) => {
    if (!open && !isLoading) {
      handleClose();
    }
  };

  return (
    <Dialog open={show} onOpenChange={handleOpenChange}>
      <DialogContent
        onEscapeKeyDown={(event) => {
          if (isLoading) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          if (isLoading) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('Delete Account')}</DialogTitle>
          <DialogDescription>
            {t('Are you sure you want to delete your account? This action cannot be undone.')}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`bg-nok hover:bg-nok/90 ${isLoading ? 'animate-pulse' : ''}`}
          >
            {isLoading ? t('Deleting...') : t('Delete Account')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteConfirmationSheet;
