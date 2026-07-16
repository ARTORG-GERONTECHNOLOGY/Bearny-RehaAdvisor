import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import CircleCheckFill from '@/assets/icons/circle-check-fill.svg?react';
import CirclePlusFill from '@/assets/icons/circle-plus-fill.svg?react';

type QuestionTranslation = { language: string; text: string };

type QuestionShape = {
  questionKey: string;
  answerType: string;
  translations?: QuestionTranslation[];
  possibleAnswers?: Array<{ key: string; translations?: QuestionTranslation[] }>;
};

type AnsweredEntry = {
  questionKey: string;
  questionTranslations?: QuestionTranslation[];
  answerType?: string;
  answers?: Array<{ key: string; translations?: QuestionTranslation[] }>;
  comment?: string;
  answered_at?: string | null;
};

const pickText = (translations?: QuestionTranslation[]) => {
  if (!Array.isArray(translations) || !translations.length) return '';
  return translations.find((tr) => tr.language === 'en')?.text || translations[0]?.text || '';
};

interface QuestionnaireDetailSheetProps {
  open: boolean;
  onClose: () => void;
  sheetId?: string;
  title?: string;
  description?: string;
  isAssigned: boolean;
  onAssign: () => void;
  answeredDays: string[];
  answeredByDay: Record<string, AnsweredEntry[]>;
  sheetQuestions: QuestionShape[];
  t: (key: string) => string;
}

const QuestionnaireDetailSheet: React.FC<QuestionnaireDetailSheetProps> = ({
  open,
  onClose,
  sheetId,
  title,
  description,
  isAssigned,
  onAssign,
  answeredDays,
  answeredByDay,
  sheetQuestions,
  t,
}) => (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="flex flex-col min-w-[40vw]">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
        <div>
          {isAssigned ? (
            <div className="flex gap-1 items-center text-ok text-sm">
              {t('Assigned')}
              <CircleCheckFill className="w-5 h-5" />
            </div>
          ) : (
            <Button variant="ghost" onClick={onAssign} className="p-0 gap-1">
              <span className="text-base font-normal">{t('Assign')}</span>
              <CirclePlusFill className="w-[18px] h-[18px]" />
            </Button>
          )}
        </div>
      </DialogHeader>

      {answeredDays.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="font-semibold text-sm">{t('Answered results')}</div>
          {answeredDays.map((day) => (
            <Card key={`${sheetId}-${day}`}>
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
                    <div key={`${sheetId}-${day}-${entry.questionKey}-${idx}`}>
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
            const qTitle = pickText(question.translations) || question.questionKey;
            const options = (question.possibleAnswers || [])
              .map((opt) => pickText(opt.translations) || opt.key)
              .filter(Boolean);
            return (
              <div key={`${sheetId}-${question.questionKey}-${index}`}>
                <div className="font-semibold text-sm">
                  {index + 1}. {qTitle}
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
    </DialogContent>
  </Dialog>
);

export default QuestionnaireDetailSheet;
