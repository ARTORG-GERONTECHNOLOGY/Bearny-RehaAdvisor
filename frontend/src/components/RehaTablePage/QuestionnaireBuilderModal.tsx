import React, { useMemo, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import apiClient from '@/api/client';
import authStore from '@/stores/authStore';
import { getApiErrorMessage } from '@/utils/apiErrorMessages';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FaPlus, FaTrash } from 'react-icons/fa';

type BuilderType = 'open-answer' | 'one-choice' | 'multiple-choice';

type DraftQuestion = {
  text: string;
  type: BuilderType;
  optionsText: string;
};

interface Props {
  show: boolean;
  onHide: () => void;
  onSuccess?: () => void;
}

const EMPTY_Q: DraftQuestion = { text: '', type: 'open-answer', optionsText: '' };

const QuestionnaireBuilderModal: React.FC<Props> = ({ show, onHide, onSuccess }) => {
  const { t } = useTranslation();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<DraftQuestion[]>([{ ...EMPTY_Q }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addQuestion = () => setQuestions((prev) => [...prev, { ...EMPTY_Q }]);
  const removeQuestion = (index: number) =>
    setQuestions((prev) => prev.filter((_, i) => i !== index));

  const updateQuestion = (index: number, patch: Partial<DraftQuestion>) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const reset = () => {
    setTitle('');
    setDescription('');
    setQuestions([{ ...EMPTY_Q }]);
    setError('');
    setSubmitting(false);
  };

  const parseOptions = (input: string): string[] => {
    return input
      .split(/\n|,/g)
      .map((x) => x.trim())
      .filter(Boolean);
  };

  const canSubmit = useMemo(() => {
    if (!title.trim()) return false;
    if (!questions.length) return false;

    for (const q of questions) {
      if (!q.text.trim()) return false;
      if (q.type === 'one-choice' || q.type === 'multiple-choice') {
        if (parseOptions(q.optionsText).length < 2) return false;
      }
    }
    return true;
  }, [questions, title]);

  const submit = async () => {
    if (submitting) return;
    setError('');

    if (!title.trim()) {
      setError(t('Please provide a questionnaire title.'));
      return;
    }

    const payloadQuestions = questions.map((q) => ({
      text: q.text.trim(),
      type: q.type,
      options:
        q.type === 'one-choice' || q.type === 'multiple-choice' ? parseOptions(q.optionsText) : [],
    }));

    if (payloadQuestions.some((q) => !q.text)) {
      setError(t('Every question needs text.'));
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/questionnaires/health/', {
        title: title.trim(),
        description: description.trim(),
        subject: 'Healthstatus',
        therapistId: authStore.id,
        questions: payloadQuestions,
      });

      onSuccess?.();
      reset();
      onHide();
    } catch (e: any) {
      setError(getApiErrorMessage(e, t('Failed to create questionnaire.')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
      <DialogContent className="max-w-3xl" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('Create questionnaire')}</DialogTitle>
        </DialogHeader>

        {error ? <Alert variant="danger">{error}</Alert> : null}

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="q-builder-title">{t('Title')}</FieldLabel>
            <Input id="q-builder-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>

          <Field>
            <FieldLabel htmlFor="q-builder-description">{t('Description')}</FieldLabel>
            <Textarea
              id="q-builder-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </FieldGroup>

        {questions.map((q, idx) => (
          <div key={`question-${idx}`} className="border rounded-lg p-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <strong>
                {t('Question')} {idx + 1}
              </strong>
              {questions.length > 1 ? (
                <Button
                  size="dashboard"
                  variant="secondary"
                  className="text-nok"
                  onClick={() => removeQuestion(idx)}
                >
                  <FaTrash />
                  {t('Delete')}
                </Button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
              <div className="md:col-span-8">
                <Field>
                  <FieldLabel htmlFor={`q-builder-text-${idx}`}>{t('Question text')}</FieldLabel>
                  <Input
                    id={`q-builder-text-${idx}`}
                    value={q.text}
                    onChange={(e) => updateQuestion(idx, { text: e.target.value })}
                  />
                </Field>
              </div>
              <div className="md:col-span-4">
                <Field>
                  <FieldLabel htmlFor={`q-builder-type-${idx}`}>{t('Answer type')}</FieldLabel>
                  <Select
                    value={q.type}
                    onValueChange={(value) => updateQuestion(idx, { type: value as BuilderType })}
                  >
                    <SelectTrigger id={`q-builder-type-${idx}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open-answer">{t('Open answer')}</SelectItem>
                      <SelectItem value="one-choice">{t('One choice')}</SelectItem>
                      <SelectItem value="multiple-choice">{t('Multiple choice')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>

            {q.type === 'one-choice' || q.type === 'multiple-choice' ? (
              <Field className="mt-2">
                <FieldLabel htmlFor={`q-builder-options-${idx}`}>
                  {t('Options (comma or new line separated)')}
                </FieldLabel>
                <Textarea
                  id={`q-builder-options-${idx}`}
                  rows={2}
                  value={q.optionsText}
                  onChange={(e) => updateQuestion(idx, { optionsText: e.target.value })}
                />
              </Field>
            ) : null}
          </div>
        ))}

        <Button size="dashboard" onClick={addQuestion}>
          <FaPlus />
          {t('Add question')}
        </Button>

        <DialogFooter>
          <Button size="dashboard" variant="secondary" onClick={onHide} disabled={submitting}>
            {t('Cancel')}
          </Button>
          <Button size="dashboard" onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? (
              <>
                <Spinner />
                {t('Saving...')}
              </>
            ) : (
              t('Create')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuestionnaireBuilderModal;
