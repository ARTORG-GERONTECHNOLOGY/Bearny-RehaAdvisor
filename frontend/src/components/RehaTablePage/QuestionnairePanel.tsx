// src/components/RehaTablePage/QuestionnairePanel.tsx
import React from 'react';
import { Row, Col, Card, ButtonGroup, Button } from 'react-bootstrap';
import { TFunction } from 'i18next';
import { FaPlus, FaEdit, FaTrash } from 'react-icons/fa';

type QItem = {
  _id: string;
  key: string;
  title: string;
  description?: string;
  tags?: string[];
  question_count?: number;
  created_by_name?: string;
};

type QAssigned = {
  _id: string;
  title: string;
  description?: string;
  frequency?: string;
  dates?: string[];
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
                    </div>
                    <div>
                      <ButtonGroup size="sm" vertical>
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
                    {a.dates?.length ? (
                      <div className="small text-muted">
                        {t('Next on')}: {new Date(a.dates[0]).toLocaleDateString()}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <ButtonGroup size="sm">
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
