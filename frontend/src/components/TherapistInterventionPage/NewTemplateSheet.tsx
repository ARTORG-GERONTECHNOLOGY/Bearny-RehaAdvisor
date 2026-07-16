// src/components/TherapistInterventionPage/NewTemplateSheet.tsx
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

interface NewTemplateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  description: string;
  isPublic: boolean;
  submitting: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPublicChange: (value: boolean) => void;
  onSubmit: () => void;
}

const NewTemplateSheet: React.FC<NewTemplateSheetProps> = ({
  open,
  onOpenChange,
  name,
  description,
  isPublic,
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
          <DialogTitle>{t('Create new template')}</DialogTitle>
        </DialogHeader>

        <FieldGroup className="mt-4">
          <Field>
            <FieldLabel htmlFor="new-template-name">{t('Name')}</FieldLabel>
            <Input
              id="new-template-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t('Template name')}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="new-template-desc">{t('Description (optional)')}</FieldLabel>
            <Textarea
              id="new-template-desc"
              rows={2}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
            />
          </Field>

          <Field orientation="horizontal">
            <FieldLabel htmlFor="new-template-public">
              {t('Public (visible to all therapists)')}
            </FieldLabel>
            <Switch id="new-template-public" checked={isPublic} onCheckedChange={onPublicChange} />
          </Field>
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
            {submitting ? t('Creating...') : t('Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewTemplateSheet;
