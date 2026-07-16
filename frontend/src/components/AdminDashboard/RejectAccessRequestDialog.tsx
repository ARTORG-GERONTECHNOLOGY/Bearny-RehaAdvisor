import React from 'react';
import { Form } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
        <Form.Group>
          <Form.Label>{t('Note for therapist (optional)')}</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder={t('Explain why the request is being declined...')}
          />
        </Form.Group>
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
