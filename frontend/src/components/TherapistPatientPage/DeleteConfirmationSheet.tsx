import React from 'react';
import { useTranslation } from 'react-i18next';
import { FaTrash } from 'react-icons/fa';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DeleteConfirmationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onConfirm: () => void;
}

const DeleteConfirmationSheet: React.FC<DeleteConfirmationSheetProps> = ({
  open,
  onOpenChange,
  saving,
  onConfirm,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ConfirmDeletion')}</DialogTitle>
          <DialogDescription>{t('DeleteConfirPAt')}</DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-3">
          <Button variant="secondary" size="dashboard" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            size="dashboard"
            onClick={onConfirm}
            disabled={saving}
            className="bg-nok hover:bg-nok/90"
          >
            <FaTrash />
            {t('Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteConfirmationSheet;
