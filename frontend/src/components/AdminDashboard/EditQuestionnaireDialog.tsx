import React from 'react';
import { Alert } from 'react-bootstrap';
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

interface Props {
  open: boolean;
  title: string;
  description: string;
  tags: string;
  error: string | null;
  saving: boolean;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onTagsChange: (tags: string) => void;
  onDismissError: () => void;
  onCancel: () => void;
  onSave: () => void;
}

const EditQuestionnaireDialog: React.FC<Props> = ({
  open,
  title,
  description,
  tags,
  error,
  saving,
  onTitleChange,
  onDescriptionChange,
  onTagsChange,
  onDismissError,
  onCancel,
  onSave,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onCancel()}>
      <DialogContent hideClose={saving} onPointerDownOutside={(e) => saving && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('Edit questionnaire')}</DialogTitle>
        </DialogHeader>
        {error && (
          <Alert variant="danger" dismissible onClose={onDismissError}>
            {error}
          </Alert>
        )}
        <Alert variant="info" className="py-2 mb-3 small">
          <strong>{t('What changes here.')}</strong>{' '}
          {t(
            'Editing updates title, description and tags only — the underlying questions are not affected. Patients already assigned this questionnaire will continue to see the title and description that was current when they were assigned (their version is preserved). New assignments will use the updated information. Each save increments the version number shown in the table.'
          )}
        </Alert>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="edit-questionnaire-title">{t('Title')}</FieldLabel>
            <Input
              id="edit-questionnaire-title"
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-questionnaire-description">{t('Description')}</FieldLabel>
            <Textarea
              id="edit-questionnaire-description"
              rows={2}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-questionnaire-tags">
              {t('Tags')} ({t('comma-separated')})
            </FieldLabel>
            <Input
              id="edit-questionnaire-tags"
              type="text"
              value={tags}
              onChange={(e) => onTagsChange(e.target.value)}
              placeholder="dynamic, custom, shared"
            />
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button size="dashboard" variant="secondary" onClick={onCancel} disabled={saving}>
            {t('Cancel')}
          </Button>
          <Button size="dashboard" onClick={onSave} disabled={saving || !title.trim()}>
            {saving ? t('Saving...') : t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditQuestionnaireDialog;
