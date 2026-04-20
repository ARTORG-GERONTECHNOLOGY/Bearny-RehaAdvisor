// src/components/RehaTablePage/QuestionnairePanel.tsx
import React from 'react';
import { Row, Col, Card, ButtonGroup, Button } from 'react-bootstrap';
import { TFunction } from 'i18next';
import { FaPlus, FaEdit, FaTrash, FaEye } from 'react-icons/fa';

type QuestionTranslation = { language: string; text: string };
type QuestionOption = { key: string; translations?: QuestionTranslation[] };
type QuestionShape = {
  questionKey: string;
  answerType: string;
  translations?: QuestionTranslation[];
  possibleAnswers?: QuestionOption[];
};

type QItem = {
  _id: string;
  key: string;
  title: string;
  description?: string;
  tags?: string[];
  question_count?: number;
  created_by_name?: string;
  questions?: QuestionShape[];
};

type QAssigned = {
  _id: string;
  title: string;
  description?: string;
  frequency?: string;
  dates?: string[];
  question_count?: number;
  questions?: QuestionShape[];
};

interface QuestionnairePanelData {
  questionnaires: QItem[];
  assignedQuestionnaires: QAssigned[];
}

interface QuestionnairePanelActions {
  openAddQ: (q: QItem) => void;
  openModifyQ: (q: QItem) => void;
  removeQ: (id: string) => void;
  openBuilder: () => void;
}

interface QuestionnairePanelProps {
  data: QuestionnairePanelData;
  actions: QuestionnairePanelActions;
  t: TFunction;
}

const QuestionnairePanel: React.FC<QuestionnairePanelProps> = ({ data, actions, t }) => {
  const { questionnaires, assignedQuestionnaires } = data;
  const { openAddQ, openModifyQ, removeQ, openBuilder } = actions;
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const pickText = (translations?: QuestionTranslation[]) => {
    if (!Array.isArray(translations) || !translations.length) return '';
    return translations.find((tr) => tr.language === 'en')?.text || translations[0]?.text || '';
  };

  const findSourceQuestions = (id: string): QuestionShape[] => {
    const fromCatalog = questionnaires.find((q) => q._id === id)?.questions;
    if (Array.isArray(fromCatalog) && fromCatalog.length) return fromCatalog;
    const fromAssigned = assignedQuestionnaires.find((q) => q._id === id)?.questions;
    return Array.isArray(fromAssigned) ? fromAssigned : [];
  };

  const renderQuestions = (id: string) => {
    if (!expanded[id]) return null;
    const questions = findSourceQuestions(id);
    if (!questions.length) {
      return <div className="small text-muted mt-2">{t('No questions found')}</div>;
    }

    return (
      <div className="mt-2 small">
        {questions.map((question, index) => {
          const title = pickText(question.translations) || question.questionKey;
          const options = (question.possibleAnswers || [])
            .map((option) => pickText(option.translations) || option.key)
            .filter(Boolean);

          return (
            <div key={`${id}-${question.questionKey}-${index}`} className="mb-2">
              <div className="fw-semibold">
                {index + 1}. {title}
              </div>
              <div className="text-muted">
                {t('Type')}: {question.answerType || 'text'}
              </div>
              {options.length ? (
                <div className="text-muted">
                  {t('Answers')}: {options.join(', ')}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Row className="rehab-row">
      {/* Available questionnaires */}
      <Col xs={12} md={5} className="rehab-col">
        <Card className="flex-1 min-h-0 d-flex flex-column mb-3 mb-md-0">
          <Card.Header className="d-flex justify-content-between align-items-center">
            <span>{t('Available questionnaires')}</span>
            <Button size="sm" variant="primary" onClick={openBuilder}>
              {t('Create')}
            </Button>
          </Card.Header>
          <Card.Body className="p-2 flex-1 min-h-0">
            <div className="scroll-y">
              {questionnaires.length === 0 && (
                <div className="text-muted">{t('No questionnaires found')}</div>
              )}
              {questionnaires.map((q) => {
                const isAlready = !!assignedQuestionnaires.find((a) => a._id === q._id);
                return (
                  <div
                    key={q._id}
                    className="d-flex justify-content-between align-items-start mb-2 p-2 rounded border"
                  >
                    <div>
                      <div className="fw-semibold">{q.title}</div>
                      {q.created_by_name ? (
                        <div className="small text-muted">
                          {t('By')}: {q.created_by_name}
                        </div>
                      ) : null}
                      {q.question_count != null && (
                        <div className="small text-muted">
                          {t('Questions')}: {q.question_count}
                        </div>
                      )}
                      {renderQuestions(q._id)}
                    </div>
                    <div>
                      <ButtonGroup size="sm" vertical>
                        <Button
                          variant="outline-primary"
                          onClick={() => setExpanded((prev) => ({ ...prev, [q._id]: !prev[q._id] }))}
                        >
                          <FaEye />
                        </Button>
                        {isAlready ? (
                          <>
                            <Button variant="outline-secondary" onClick={() => openModifyQ(q)}>
                              <FaEdit />
                            </Button>
                            <Button variant="outline-danger" onClick={() => removeQ(q._id)}>
                              <FaTrash />
                            </Button>
                          </>
                        ) : (
                          <Button variant="outline-success" onClick={() => openAddQ(q)}>
                            <FaPlus />
                          </Button>
                        )}
                      </ButtonGroup>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card.Body>
        </Card>
      </Col>

      {/* Assigned questionnaires */}
      <Col xs={12} md={7} className="rehab-col">
        <Card className="flex-1 min-h-0 d-flex flex-column">
          <Card.Header>{t('Assigned questionnaires')}</Card.Header>
          <Card.Body className="p-2 flex-1 min-h-0">
            <div className="scroll-y">
              {assignedQuestionnaires.length === 0 && (
                <div className="text-muted">{t('No questionnaires assigned')}</div>
              )}
              {assignedQuestionnaires.map((a) => (
                <div
                  key={a._id}
                  className="d-flex justify-content-between align-items-center p-2 mb-2 border rounded"
                >
                  <div>
                    <div className="fw-semibold">{a.title}</div>
                    <div className="small text-muted">
                      {t('Frequency')}: {a.frequency || '—'}
                    </div>
                    {a.question_count != null ? (
                      <div className="small text-muted">
                        {t('Questions')}: {a.question_count}
                      </div>
                    ) : null}
                    {a.dates?.length ? (
                      <div className="small text-muted">
                        {t('Next on')}: {new Date(a.dates[0]).toLocaleDateString()}
                      </div>
                    ) : null}
                    {renderQuestions(a._id)}
                  </div>
                  <div>
                    <ButtonGroup size="sm">
                      <Button
                        variant="outline-primary"
                        onClick={() => setExpanded((prev) => ({ ...prev, [a._id]: !prev[a._id] }))}
                      >
                        <FaEye />
                      </Button>
                      <Button
                        variant="outline-secondary"
                        onClick={() =>
                          openModifyQ({
                            _id: a._id,
                            key: a._id,
                            title: a.title,
                          })
                        }
                      >
                        <FaEdit />
                      </Button>
                      <Button variant="outline-danger" onClick={() => removeQ(a._id)}>
                        <FaTrash />
                      </Button>
                    </ButtonGroup>
                  </div>
                </div>
              ))}
            </div>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
};

export default QuestionnairePanel;
