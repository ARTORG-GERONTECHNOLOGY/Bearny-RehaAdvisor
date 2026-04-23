import React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

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
    <Sheet open={show} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="flex flex-col max-w-lg mx-auto"
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
        <SheetHeader>
          <SheetTitle>{t('Delete Account')}</SheetTitle>
          <SheetDescription>
            {t('Are you sure you want to delete your account? This action cannot be undone.')}
          </SheetDescription>
        </SheetHeader>

        <SheetFooter>
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default DeleteConfirmationSheet;
