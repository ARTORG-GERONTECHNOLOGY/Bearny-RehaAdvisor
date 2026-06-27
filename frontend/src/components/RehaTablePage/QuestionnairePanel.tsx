// src/components/RehaTablePage/QuestionnairePanel.tsx
import React from 'react';
import { Row, Col } from 'react-bootstrap';
import { TFunction } from 'i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import CircleCheckFill from '@/assets/icons/circle-check-fill.svg?react';
import CirclePlusFill from '@/assets/icons/circle-plus-fill.svg?react';
import CircleRemoveFill from '@/assets/icons/trash-x-fill.svg?react';
import EditFill from '@/assets/icons/pencil-fill.svg?react';
import { Button } from '@/components/ui/button';

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
  answered_entries?: Array<{
    questionKey: string;
    questionTranslations?: QuestionTranslation[];
    answerType?: string;
    answers?: Array<{ key: string; translations?: QuestionTranslation[] }>;
    comment?: string;
    audio_url?: string | null;
    media_urls?: string[];
    answered_at?: string | null;
  }>;
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

const pickText = (translations?: QuestionTranslation[]) => {
  if (!Array.isArray(translations) || !translations.length) return '';
  return translations.find((tr) => tr.language === 'en')?.text || translations[0]?.text || '';
};

const QuestionnairePanel: React.FC<QuestionnairePanelProps> = ({ data, actions, t }) => {
  const { questionnaires, assignedQuestionnaires } = data;
  const { openAddQ, openModifyQ, removeQ, openBuilder } = actions;
  const [sheetItem, setSheetItem] = React.useState<{
    id: string;
    scope: 'available' | 'assigned';
  } | null>(null);

  const sheetData =
    sheetItem?.scope === 'available'
      ? (questionnaires.find((q) => q._id === sheetItem.id) ?? null)
      : (assignedQuestionnaires.find((q) => q._id === sheetItem?.id) ?? null);

  // For assigned items, prefer questions from the catalog (same _id), fall back to the assigned record itself.
  const sheetQuestions: QuestionShape[] = (() => {
    if (!sheetItem) return [];
    const fromCatalog = questionnaires.find((q) => q._id === sheetItem.id)?.questions;
    if (Array.isArray(fromCatalog) && fromCatalog.length) return fromCatalog;
    return Array.isArray(sheetData?.questions) ? sheetData!.questions! : [];
  })();

  const answeredEntries =
    sheetItem?.scope === 'assigned'
      ? ((sheetData as QAssigned | null)?.answered_entries ?? [])
      : [];

  const answeredByDay = answeredEntries.reduce<Record<string, typeof answeredEntries>>(
    (acc, row) => {
      const day = String(row.answered_at || '').slice(0, 10) || t('Unknown date');
      if (!acc[day]) acc[day] = [];
      acc[day].push(row);
      return acc;
    },
    {}
  );
  const answeredDays = Object.keys(answeredByDay).sort((x, y) => y.localeCompare(x));

  return (
    <>
      <Button onClick={openBuilder} className="mb-3">
        {t('Create')}
      </Button>
      <Row className="rehab-row">
        {/* Available questionnaires */}
        <Col xs={12} md={5} className="rehab-col">
          <Card>
            <CardHeader>
              <CardTitle>{t('Available questionnaires')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {questionnaires.length === 0 && (
                <div className="text-muted">{t('No questionnaires found')}</div>
              )}
              {questionnaires.map((q) => {
                const isAlready = !!assignedQuestionnaires.find((a) => a._id === q._id);
                return (
                  <Card
                    key={q._id}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => setSheetItem({ id: q._id, scope: 'available' })}
                  >
                    <CardHeader>
                      <CardTitle>{q.title}</CardTitle>
                      <CardDescription>
                        {(q.created_by_name || q.question_count != null) && (
                          <span>
                            {q.created_by_name}
                            {q.created_by_name && q.question_count != null && ' · '}
                            {q.question_count != null && `${q.question_count} ${t('Questions')}`}
                          </span>
                        )}
                      </CardDescription>
                      <CardAction onClick={(e) => e.stopPropagation()}>
                        {isAlready ? (
                          <div className="flex gap-1 items-center text-ok">
                            {t('Assigned')}
                            <CircleCheckFill className="w-5 h-5" />
                          </div>
                        ) : (
                          <Button variant="ghost" onClick={() => openAddQ(q)} className="p-0 gap-1">
                            <span className="text-base font-normal">{t('Assign')}</span>
                            <CirclePlusFill className="w-5 h-5" />
                          </Button>
                        )}
                      </CardAction>
                    </CardHeader>
                  </Card>
                );
              })}
            </CardContent>
          </Card>
        </Col>

        {/* Assigned questionnaires */}
        <Col xs={12} md={7} className="rehab-col">
          <Card>
            <CardHeader>
              <CardTitle>{t('Assigned questionnaires')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {assignedQuestionnaires.length === 0 && (
                <div className="text-muted">{t('No questionnaires assigned')}</div>
              )}
              {assignedQuestionnaires.map((a) => (
                <Card
                  key={a._id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => setSheetItem({ id: a._id, scope: 'assigned' })}
                >
                  <CardHeader>
                    <CardTitle>{a.title}</CardTitle>
                    <CardDescription>
                      {a.question_count != null && `${a.question_count} ${t('Questions')}`}
                    </CardDescription>
                    <CardAction onClick={(e) => e.stopPropagation()} className="flex gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => openModifyQ({ _id: a._id, key: a._id, title: a.title })}
                        className="p-0"
                      >
                        <EditFill className="w-5 h-5" />
                      </Button>
                      <Button variant="ghost" onClick={() => removeQ(a._id)} className="p-0">
                        <CircleRemoveFill className="text-nok w-5 h-5" />
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex gap-1 flex-wrap">
                    {a.frequency && <Badge>{a.frequency}</Badge>}
                    {!!a.dates?.length && (
                      <Badge>
                        {t('Next on')} {new Date(a.dates[0]).toLocaleDateString()}
                      </Badge>
                    )}
                    {!!a.answered_entries?.length && (
                      <Badge>
                        {a.answered_entries.length} {t('Answered')}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </Col>
      </Row>

      <Sheet open={!!sheetItem} onOpenChange={(open) => !open && setSheetItem(null)}>
        <SheetContent className="overflow-y-auto flex flex-col">
          <SheetHeader>
            <SheetTitle>{sheetData?.title}</SheetTitle>
            {sheetData?.description && <SheetDescription>{sheetData.description}</SheetDescription>}
            <div>
              {assignedQuestionnaires.find((a) => a._id === sheetItem?.id) ? (
                <div className="flex gap-1 items-center text-ok text-sm">
                  {t('Assigned')}
                  <CircleCheckFill className="w-5 h-5" />
                </div>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => {
                    const catalogItem = questionnaires.find((q) => q._id === sheetItem?.id);
                    if (catalogItem) openAddQ(catalogItem);
                  }}
                  className="p-0 gap-1"
                >
                  <span className="text-base font-normal">{t('Assign')}</span>
                  <CirclePlusFill className="w-[18px] h-[18px]" />
                </Button>
              )}
            </div>
          </SheetHeader>

          {answeredDays.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="font-semibold text-sm">{t('Answered results')}</div>
              {answeredDays.map((day) => (
                <Card key={`${sheetItem?.id}-${day}`}>
                  <CardHeader>
                    <CardTitle>{day}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1">
                    {answeredByDay[day].map((entry, idx) => {
                      const qText =
                        pickText(entry.questionTranslations) ||
                        entry.questionKey ||
                        t('Unknown question');
                      const answers = (entry.answers || [])
                        .map((ans) => pickText(ans.translations) || ans.key)
                        .filter(Boolean)
                        .join(', ');
                      return (
                        <div key={`${sheetItem?.id}-${day}-${entry.questionKey}-${idx}`}>
                          <div className="text-sm font-semibold">{qText}</div>
                          <div className="text-sm text-muted-foreground">
                            {t('Type')}: {entry.answerType || 'text'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {t('Answers')}: {answers || '—'}
                          </div>
                          {entry.comment && (
                            <div className="text-sm text-muted-foreground">
                              {t('Comment')}: {entry.comment}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {sheetQuestions.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t('No questions found')}</div>
          ) : (
            <div className="flex flex-col gap-2">
              {sheetQuestions.map((question, index) => {
                const title = pickText(question.translations) || question.questionKey;
                const options = (question.possibleAnswers || [])
                  .map((opt) => pickText(opt.translations) || opt.key)
                  .filter(Boolean);
                return (
                  <div key={`${sheetItem?.id}-${question.questionKey}-${index}`}>
                    <div className="font-semibold text-sm">
                      {index + 1}. {title}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t('Type')}: {question.answerType || 'text'}
                    </div>
                    {options.length > 0 && (
                      <div className="text-sm text-muted-foreground">
                        {t('Answers')}: {options.join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

export default QuestionnairePanel;
