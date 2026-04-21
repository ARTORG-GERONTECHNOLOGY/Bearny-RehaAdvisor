import React from 'react';
import { Table } from 'react-bootstrap';
import type { QuestionnaireEntry } from '../../types/health';
import { isInRange } from '../../utils/healthCharts';

type Props = {
  data: QuestionnaireEntry[];
  start?: Date | null;
  end?: Date | null;
  lang: string;
  t: (k: string) => string;
};

const QuestionnaireResultsTable: React.FC<Props> = ({ data, start, end, lang, t }) => {
  const filtered = (data || []).filter((d) => isInRange(d.date, start, end));

  const grouped = filtered.reduce<Record<string, QuestionnaireEntry[]>>((acc, row) => {
    const day = String(row.date || '').slice(0, 10);
    if (!day) return acc;
    if (!acc[day]) acc[day] = [];
    acc[day].push(row);
    return acc;
  }, {});

  const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const pickText = (translations?: { language: string; text: string }[]) =>
    translations?.find((tr) => tr.language === lang)?.text ||
    translations?.find((tr) => tr.language === 'en')?.text ||
    translations?.[0]?.text ||
    '';

  if (!days.length) {
    return <div className="text-muted">{t('No questionnaire data available.')}</div>;
  }

  return (
    <div className="d-flex flex-column gap-3">
      {days.map((day) => (
        <div key={day} className="border rounded p-2 p-md-3">
          <div className="fw-semibold mb-2">
            {t('Date')}: {day}
          </div>
          <Table size="sm" striped responsive className="mb-0">
            <thead>
              <tr>
                <th>{t('Question')}</th>
                <th>{t('Type')}</th>
                <th>{t('Answers')}</th>
                <th>{t('Comment')}</th>
                <th>{t('Media')}</th>
              </tr>
            </thead>
            <tbody>
              {grouped[day].map((entry, idx) => {
                const questionText =
                  pickText(entry.questionTranslations) || entry.questionKey || t('Unknown');
                const answers = (entry.answers || [])
                  .map((a) => pickText(a.translations) || a.key)
                  .filter(Boolean)
                  .join(', ');
                const media = (entry.media_urls || []).filter(Boolean).join(', ');

                return (
                  <tr key={`${day}-${entry.questionKey}-${idx}`}>
                    <td>{questionText}</td>
                    <td>{entry.answerType || 'text'}</td>
                    <td>{answers || '—'}</td>
                    <td>{entry.comment || '—'}</td>
                    <td>{media || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      ))}
    </div>
  );
};

export default QuestionnaireResultsTable;
