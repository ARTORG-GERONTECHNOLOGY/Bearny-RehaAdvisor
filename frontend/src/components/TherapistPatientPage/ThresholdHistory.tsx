import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { PatientThresholds, ThresholdHistoryItem } from '@/stores/patientPopupStore';
import { formatLocaleDate, formatLocaleDateTime } from '@/utils/dateFormat';

function formatThresholdSnapshot(th: Partial<PatientThresholds>, t: (k: string) => string): string {
  if (!th || Object.keys(th).length === 0) return '—';
  const parts: string[] = [];
  if (th.steps_goal != null) parts.push(`${t('Steps goal')}: ${th.steps_goal}`);
  if (th.active_minutes_green != null)
    parts.push(
      `${t('Active zone minutes (green)')}/${t('Active zone minutes (yellow)')}: ${th.active_minutes_green}/${th.active_minutes_yellow ?? '?'}`
    );
  if (th.sleep_green_min != null)
    parts.push(
      `${t('Sleep min (green, minutes)')}/${t('Sleep min (yellow, minutes)')}: ${th.sleep_green_min}/${th.sleep_yellow_min ?? '?'}`
    );
  if (th.bp_sys_green_max != null)
    parts.push(
      `${t('BP systolic green max')}/${t('BP systolic yellow max')}: ≤${th.bp_sys_green_max}/≤${th.bp_sys_yellow_max ?? '?'}`
    );
  if (th.bp_dia_green_max != null)
    parts.push(
      `${t('BP diastolic green max')}/${t('BP diastolic yellow max')}: ≤${th.bp_dia_green_max}/≤${th.bp_dia_yellow_max ?? '?'}`
    );
  return parts.join('\n') || '—';
}

interface ThresholdHistoryProps {
  history: ThresholdHistoryItem[];
}

const ThresholdHistory: React.FC<ThresholdHistoryProps> = ({ history }) => {
  const { t } = useTranslation();
  const [historyEntry, setHistoryEntry] = useState<ThresholdHistoryItem | null>(null);

  if (!history || history.length === 0) {
    return <div className="text-zinc-500 text-xs">{t('No history yet.')}</div>;
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        {history.map((h, idx) => (
          <div
            key={idx}
            role="button"
            tabIndex={0}
            onClick={() => setHistoryEntry(h)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setHistoryEntry(h);
              }
            }}
            className="hover:bg-zinc-100 rounded-lg cursor-pointer"
          >
            <div className="text-sm font-medium">
              {h.effective_from ? formatLocaleDate(h.effective_from) : '—'}
            </div>
            <div className="text-xs text-zinc-500">
              {t('Changed by')}: {h.changed_by || '—'}
            </div>
            <div className="text-xs text-zinc-500 truncate">
              {t('Reason')}: {h.reason || '—'}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!historyEntry} onOpenChange={(v) => !v && setHistoryEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Previous values')}</DialogTitle>
            <DialogDescription>
              {historyEntry?.effective_from
                ? formatLocaleDateTime(historyEntry.effective_from)
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div data-testid="threshold-history-values" className="mt-4 whitespace-pre-wrap text-sm">
            {historyEntry ? formatThresholdSnapshot(historyEntry.thresholds, t) : ''}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ThresholdHistory;
