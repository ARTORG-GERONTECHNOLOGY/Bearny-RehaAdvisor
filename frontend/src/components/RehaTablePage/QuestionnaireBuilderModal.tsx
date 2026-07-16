import React, { useMemo, useState } from 'react';
import { Alert, Form, Spinner } from 'react-bootstrap';
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

        <Form.Group className="mb-3" controlId="q-builder-title">
          <Form.Label>{t('Title')}</Form.Label>
          <Form.Control value={title} onChange={(e) => setTitle(e.target.value)} />
        </Form.Group>

        <Form.Group className="mb-3" controlId="q-builder-description">
          <Form.Label>{t('Description')}</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Form.Group>

        {questions.map((q, idx) => (
          <div key={`question-${idx}`} className="border rounded p-3 mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <strong>
                {t('Question')} {idx + 1}
              </strong>
              {questions.length > 1 ? (
                <Button
                  size="dashboard"
                  className="bg-nok hover:bg-nok/90"
                  onClick={() => removeQuestion(idx)}
                >
                  {t('Remove')}
                </Button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
              <div className="md:col-span-8">
                <Form.Group controlId={`q-builder-text-${idx}`}>
                  <Form.Label>{t('Question text')}</Form.Label>
                  <Form.Control
                    value={q.text}
                    onChange={(e) => updateQuestion(idx, { text: e.target.value })}
                  />
                </Form.Group>
              </div>
              <div className="md:col-span-4">
                <Form.Group controlId={`q-builder-type-${idx}`}>
                  <Form.Label>{t('Answer type')}</Form.Label>
                  <Form.Select
                    value={q.type}
                    onChange={(e) => updateQuestion(idx, { type: e.target.value as BuilderType })}
                  >
                    <option value="open-answer">{t('Open answer')}</option>
                    <option value="one-choice">{t('One choice')}</option>
                    <option value="multiple-choice">{t('Multiple choice')}</option>
                  </Form.Select>
                </Form.Group>
              </div>
            </div>

            {q.type === 'one-choice' || q.type === 'multiple-choice' ? (
              <Form.Group className="mt-2" controlId={`q-builder-options-${idx}`}>
                <Form.Label>{t('Options (comma or new line separated)')}</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={q.optionsText}
                  onChange={(e) => updateQuestion(idx, { optionsText: e.target.value })}
                />
              </Form.Group>
            ) : null}
          </div>
        ))}

        <Button size="dashboard" onClick={addQuestion}>
          {t('Add question')}
        </Button>

        <DialogFooter>
          <Button size="dashboard" variant="secondary" onClick={onHide} disabled={submitting}>
            {t('Cancel')}
          </Button>
          <Button size="dashboard" onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
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
