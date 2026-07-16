// src/components/TherapistInterventionPage/EditTemplateMetaSheet.tsx
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
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

interface EditTemplateMetaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  description: string;
  isPublic: boolean;
  showPublicToggle: boolean;
  submitting: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPublicChange: (value: boolean) => void;
  onSubmit: () => void;
}

const EditTemplateMetaSheet: React.FC<EditTemplateMetaSheetProps> = ({
  open,
  onOpenChange,
  name,
  description,
  isPublic,
  showPublicToggle,
  submitting,
  onNameChange,
  onDescriptionChange,
  onPublicChange,
  onSubmit,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Edit template info')}</DialogTitle>
        </DialogHeader>

        <FieldGroup className="mt-4">
          <Field>
            <FieldLabel htmlFor="edit-meta-name">{t('Name')}</FieldLabel>
            <Input
              id="edit-meta-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t('Template name')}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="edit-meta-desc">{t('Description (optional)')}</FieldLabel>
            <Textarea
              id="edit-meta-desc"
              rows={2}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
            />
          </Field>

          {showPublicToggle && (
            <Field orientation="horizontal">
              <FieldLabel htmlFor="edit-meta-public">
                {t('Public (visible to all therapists)')}
              </FieldLabel>
              <Switch id="edit-meta-public" checked={isPublic} onCheckedChange={onPublicChange} />
            </Field>
          )}
        </FieldGroup>

        <DialogFooter className="mt-4">
          <Button
            variant="secondary"
            size="dashboard"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('Cancel')}
          </Button>
          <Button size="dashboard" onClick={onSubmit} disabled={!name.trim() || submitting}>
            {submitting ? t('Saving...') : t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditTemplateMetaSheet;
