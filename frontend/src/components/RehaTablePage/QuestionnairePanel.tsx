import React from 'react';
import { TFunction } from 'i18next';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import QuestionnaireAvailableCard from './QuestionnaireAvailableCard';
import QuestionnaireAssignedCard from './QuestionnaireAssignedCard';
import QuestionnaireDetailSheet from './QuestionnaireDetailSheet';
import { FaPlus } from 'react-icons/fa';
import { Badge } from '@/components/ui/badge';

type QuestionTranslation = { language: string; text: string };

type QuestionShape = {
  questionKey: string;
  answerType: string;
  translations?: QuestionTranslation[];
  possibleAnswers?: Array<{ key: string; translations?: QuestionTranslation[] }>;
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

type AnsweredEntry = NonNullable<QAssigned['answered_entries']>[number];

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

  const answeredByDay = answeredEntries.reduce<Record<string, AnsweredEntry[]>>((acc, row) => {
    const day = String(row.answered_at || '').slice(0, 10) || t('Unknown date');
    if (!acc[day]) acc[day] = [];
    acc[day].push(row);
    return acc;
  }, {});
  const answeredDays = Object.keys(answeredByDay).sort((x, y) => y.localeCompare(x));

  // Indexed by questionnaire id so each row doesn't scan all of assignedQuestionnaires.
  const assignedIds = React.useMemo(
    () => new Set(assignedQuestionnaires.map((a) => a._id)),
    [assignedQuestionnaires]
  );

  const isSheetItemAssigned = !!sheetItem && assignedIds.has(sheetItem.id);

  return (
    <>
      <Button size="dashboard" onClick={openBuilder} className="mb-3">
        <FaPlus />
        {t('Create')}
      </Button>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 rehab-row">
        <div className="md:col-span-5 rehab-col">
          <Card>
            <CardHeader>
              <CardTitle>{t('Available questionnaires')}</CardTitle>
              <CardAction>
                <Badge variant="dashboard">{questionnaires.length}</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {questionnaires.length === 0 && (
                <div className="text-muted-foreground">{t('No questionnaires found')}</div>
              )}
              {questionnaires.map((q) => (
                <QuestionnaireAvailableCard
                  key={q._id}
                  q={q}
                  isAssigned={assignedIds.has(q._id)}
                  onOpen={() => setSheetItem({ id: q._id, scope: 'available' })}
                  onAssign={() => openAddQ(q)}
                  t={t}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-7 rehab-col">
          <Card>
            <CardHeader>
              <CardTitle>{t('Assigned questionnaires')}</CardTitle>
              <CardAction>
                <Badge variant="dashboard">{assignedQuestionnaires.length}</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {assignedQuestionnaires.length === 0 && (
                <div className="text-muted-foreground">{t('No questionnaires assigned')}</div>
              )}
              {assignedQuestionnaires.map((a) => (
                <QuestionnaireAssignedCard
                  key={a._id}
                  a={a}
                  onOpen={() => setSheetItem({ id: a._id, scope: 'assigned' })}
                  onModify={() => openModifyQ({ _id: a._id, key: a._id, title: a.title })}
                  onRemove={() => removeQ(a._id)}
                  t={t}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <QuestionnaireDetailSheet
        open={!!sheetItem}
        onClose={() => setSheetItem(null)}
        sheetId={sheetItem?.id}
        title={sheetData?.title}
        description={sheetData?.description}
        isAssigned={isSheetItemAssigned}
        onAssign={() => {
          const catalogItem = questionnaires.find((q) => q._id === sheetItem?.id);
          if (catalogItem) openAddQ(catalogItem);
        }}
        answeredDays={answeredDays}
        answeredByDay={answeredByDay}
        sheetQuestions={sheetQuestions}
        t={t}
      />
    </>
  );
};

export default QuestionnairePanel;
