import React from 'react';
import { useTranslation } from 'react-i18next';
import { FaTrash } from 'react-icons/fa';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{t('ConfirmDeletion')}</SheetTitle>
          <SheetDescription>{t('DeleteConfirPAt')}</SheetDescription>
        </SheetHeader>

        <SheetFooter className="mt-3">
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default DeleteConfirmationSheet;
