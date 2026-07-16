import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  open: boolean;
  note: string;
  submitting: boolean;
  onNoteChange: (note: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

const RejectAccessRequestDialog: React.FC<Props> = ({
  open,
  note,
  submitting,
  onNoteChange,
  onCancel,
  onSubmit,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Decline access change request')}</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="reject-note">{t('Note for therapist (optional)')}</FieldLabel>
          <Textarea
            id="reject-note"
            rows={3}
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder={t('Explain why the request is being declined...')}
          />
        </Field>
        <DialogFooter>
          <Button size="dashboard" variant="secondary" onClick={onCancel} disabled={submitting}>
            {t('Cancel')}
          </Button>
          <Button
            size="dashboard"
            className="bg-nok hover:bg-nok/90"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? t('Declining...') : t('Decline')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RejectAccessRequestDialog;
