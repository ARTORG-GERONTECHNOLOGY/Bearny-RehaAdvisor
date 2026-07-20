import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { QuestionnaireEntry } from '@/types/health';
import { eachDateInRange, isInRange } from '@/utils/healthCharts';

type Props = {
  data: QuestionnaireEntry[];
  start?: Date | null;
  end?: Date | null;
  lang: string;
  t: (k: string) => string;
};

const pickText = (translations?: { language: string; text: string }[], lang?: string) =>
  translations?.find((tr) => tr.language === lang)?.text ||
  translations?.find((tr) => tr.language === 'en')?.text ||
  translations?.[0]?.text ||
  '';

// One table per day, listing every question answered that day.
const DayResultsTable: React.FC<{
  entries: QuestionnaireEntry[];
  lang: string;
  t: (k: string) => string;
}> = ({ entries, lang, t }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>{t('Question')}</TableHead>
        <TableHead>{t('Type')}</TableHead>
        <TableHead>{t('Answers')}</TableHead>
        <TableHead>{t('Comment')}</TableHead>
        <TableHead>{t('Media')}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {entries.map((entry, idx) => {
        const questionText =
          pickText(entry.questionTranslations, lang) || entry.questionKey || t('Unknown');
        const answers = (entry.answers || [])
          .map((a) => pickText(a.translations, lang) || a.key)
          .filter(Boolean)
          .join(', ');
        const media = (entry.media_urls || []).filter(Boolean).join(', ');

        return (
          <TableRow key={`${entry.questionKey}-${idx}`}>
            <TableCell>{questionText}</TableCell>
            <TableCell>{entry.answerType || 'text'}</TableCell>
            <TableCell>{answers || '—'}</TableCell>
            <TableCell>{entry.comment || '—'}</TableCell>
            <TableCell>{media || '—'}</TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  </Table>
);

// Groups questionnaire entries within the visible range by day.
const groupByDay = (
  data: QuestionnaireEntry[],
  start?: Date | null,
  end?: Date | null
): Record<string, QuestionnaireEntry[]> => {
  const filtered = (data || []).filter((d) => isInRange(d.date, start, end));
  return filtered.reduce<Record<string, QuestionnaireEntry[]>>((acc, row) => {
    const day = String(row.date || '').slice(0, 10);
    if (!day) return acc;
    if (!acc[day]) acc[day] = [];
    acc[day].push(row);
    return acc;
  }, {});
};

// Number of distinct days with at least one questionnaire entry in the visible date range.
export const countQuestionnaireDays = (
  data: QuestionnaireEntry[],
  start?: Date | null,
  end?: Date | null
): number => Object.keys(groupByDay(data, start, end)).length;

const QuestionnaireResultsTable: React.FC<Props> = ({ data, start, end, lang, t }) => {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const grouped = useMemo(() => groupByDay(data, start, end), [data, start, end]);

  const days = useMemo(
    () => (start && end ? eachDateInRange(start, end) : Object.keys(grouped).sort()),
    [start, end, grouped]
  );

  if (!days.length) {
    return (
      <div className="flex h-24 w-full items-center justify-center text-sm text-zinc-500">
        {t('No questionnaire data available.')}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-7 gap-1 h-24">
        {days.map((day) => {
          const hasEntry = !!grouped[day]?.length;
          return (
            <button
              key={day}
              type="button"
              title={day}
              aria-label={day}
              aria-pressed={selectedDay === day}
              disabled={!hasEntry}
              onClick={() => setSelectedDay(day)}
              className={cn(
                'h-full max-h-5 w-full border-none',
                hasEntry
                  ? 'bg-brand hover:bg-brand/90 cursor-pointer'
                  : 'bg-chartMuted hover:bg-chartMuted/75 cursor-default'
              )}
            />
          );
        })}
      </div>

      <Dialog open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="min-w-[40vw]">
          <DialogHeader>
            <DialogTitle>{t('Questionnaire Results By Date')}</DialogTitle>
            <DialogDescription>
              {t('Date')}: {selectedDay}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {selectedDay && grouped[selectedDay] && (
              <DayResultsTable entries={grouped[selectedDay]} lang={lang} t={t} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default QuestionnaireResultsTable;
