import React, { useMemo, useState } from 'react';
import { Alert, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import apiClient from '../../api/client';
import authStore from '../../stores/authStore';

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
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        t('Failed to create questionnaire.');
      setError(String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>{t('Create questionnaire')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
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
                <Button variant="outline-danger" size="sm" onClick={() => removeQuestion(idx)}>
                  {t('Remove')}
                </Button>
              ) : null}
            </div>

            <Row className="g-2">
              <Col md={8}>
                <Form.Group controlId={`q-builder-text-${idx}`}>
                  <Form.Label>{t('Question text')}</Form.Label>
                  <Form.Control
                    value={q.text}
                    onChange={(e) => updateQuestion(idx, { text: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
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
              </Col>
            </Row>

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

        <Button variant="outline-primary" onClick={addQuestion}>
          {t('Add question')}
        </Button>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={onHide} disabled={submitting}>
          {t('Cancel')}
        </Button>
        <Button variant="success" onClick={submit} disabled={!canSubmit || submitting}>
          {submitting ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              {t('Saving...')}
            </>
          ) : (
            t('Create')
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default QuestionnaireBuilderModal;
