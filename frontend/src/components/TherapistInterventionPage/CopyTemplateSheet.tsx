// src/components/TherapistInterventionPage/CopyTemplateSheet.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface CopyTemplateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  description: string;
  submitting: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: () => void;
}

const CopyTemplateSheet: React.FC<CopyTemplateSheetProps> = ({
  open,
  onOpenChange,
  name,
  description,
  submitting,
  onNameChange,
  onDescriptionChange,
  onSubmit,
}) => {
  const { t } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{t('Copy template')}</SheetTitle>
        </SheetHeader>

        <FieldGroup className="mt-4">
          <Field>
            <FieldLabel htmlFor="copy-template-name">{t('Name')}</FieldLabel>
            <Input
              id="copy-template-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t('Template name')}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="copy-template-desc">{t('Description (optional)')}</FieldLabel>
            <Textarea
              id="copy-template-desc"
              rows={2}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
            />
          </Field>
        </FieldGroup>

        <SheetFooter className="mt-4">
          <Button
            variant="secondary"
            size="dashboard"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('Cancel')}
          </Button>
          <Button size="dashboard" onClick={onSubmit} disabled={!name.trim() || submitting}>
            {submitting ? t('Copying...') : t('Copy')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default CopyTemplateSheet;
