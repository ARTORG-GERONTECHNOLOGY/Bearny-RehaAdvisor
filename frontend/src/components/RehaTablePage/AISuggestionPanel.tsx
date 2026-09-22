import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import apiClient from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SuggestedItem {
  intervention: {
    _id: string;
    external_id: string;
    title: string;
    aim: string | null;
    physical_level: string | null;
    cognitive_level: string | null;
    duration_bucket: string | null;
  };
  suggested_frequency: string;
  suggested_days: string[];
  rationale: string;
  rule_signals: {
    avg_rating?: number;
    diagnosis_match?: number;
    wearable_signal?: string | null;
  };
  decision: 'accepted' | 'rejected' | 'modified' | 'pending';
  modification: Record<string, unknown>;
  decided_at: string | null;
}

interface AISuggestionData {
  _id: string;
  patient_id: string;
  suggested_at: string;
  patient_snapshot: Record<string, unknown>;
  items: SuggestedItem[];
  overall_decision: string;
  notes: string;
}

interface Props {
  patientId: string;
  suggestion: AISuggestionData;
  onDismiss: () => void;
  onApplied: () => void;
}

type ItemDecision = 'accepted' | 'rejected' | 'modified' | 'pending';

const AIM_COLORS: Record<string, string> = {
  Movement: 'bg-green-100 text-green-800',
  'Physical Activity': 'bg-blue-100 text-blue-800',
  'Relaxation/Sleep': 'bg-purple-100 text-purple-800',
  Education: 'bg-yellow-100 text-yellow-800',
  Monitoring: 'bg-gray-100 text-gray-700',
};

const AISuggestionPanel: React.FC<Props> = ({ patientId, suggestion, onDismiss, onApplied }) => {
  const { t } = useTranslation();

  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>(() => {
    const init: Record<string, ItemDecision> = {};
    for (const item of suggestion.items) {
      init[item.intervention._id] = 'pending';
    }
    return init;
  });

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setDecision = (ivId: string, d: ItemDecision) => {
    setDecisions((prev) => ({ ...prev, [ivId]: d }));
  };

  const pendingCount = Object.values(decisions).filter((d) => d === 'pending').length;
  const acceptedCount = Object.values(decisions).filter(
    (d) => d === 'accepted' || d === 'modified'
  ).length;

  const handleApply = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const items = suggestion.items.map((item) => ({
        intervention_id: item.intervention._id,
        decision: decisions[item.intervention._id] || 'pending',
      }));
      await apiClient.post(`/patients/${patientId}/ai-suggestion/${suggestion._id}/decide/`, {
        items,
        notes,
      });
      onApplied();
    } catch {
      setError(t('Failed to save decisions. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-brand/20 bg-brand/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
            {t('AI-generated therapy suggestions')}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {t('Review each suggestion and accept, modify, or reject it.')}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600"
          aria-label={t('Dismiss suggestions')}
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {suggestion.items.map((item) => {
          const ivId = item.intervention._id;
          const decision = decisions[ivId];
          const aim = item.intervention.aim || '';
          const aimClass = AIM_COLORS[aim] || 'bg-zinc-100 text-zinc-700';

          return (
            <Card
              key={ivId}
              className={`transition-opacity ${decision === 'rejected' ? 'opacity-40' : ''}`}
            >
              <CardHeader className="pb-1 pt-3">
                <div className="flex flex-wrap items-start gap-2">
                  <CardTitle className="flex-1 text-sm font-semibold leading-snug">
                    {item.intervention.title}
                  </CardTitle>
                  {aim && <Badge className={`shrink-0 text-xs ${aimClass}`}>{t(aim)}</Badge>}
                  {item.intervention.physical_level && (
                    <Badge variant="dashboard" className="shrink-0 text-xs">
                      {t('Physical')}: {t(item.intervention.physical_level)}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="mb-2 text-xs text-zinc-500">
                  <span className="font-medium">{t('Frequency')}:</span>{' '}
                  {item.suggested_frequency || '—'}
                  {item.rule_signals?.avg_rating != null && (
                    <span className="ml-3">★ {item.rule_signals.avg_rating.toFixed(1)}</span>
                  )}
                  {item.rule_signals?.wearable_signal && (
                    <span className="ml-3 text-brand">
                      ↑ {t(item.rule_signals.wearable_signal)}
                    </span>
                  )}
                </div>

                {item.rationale && (
                  <p className="mb-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {item.rationale}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    size="dashboard"
                    variant={decision === 'accepted' ? 'default' : 'secondary'}
                    onClick={() => setDecision(ivId, 'accepted')}
                  >
                    {t('Accept')}
                  </Button>
                  <Button
                    size="dashboard"
                    variant={decision === 'modified' ? 'default' : 'secondary'}
                    onClick={() => setDecision(ivId, 'modified')}
                  >
                    {t('Modify')}
                  </Button>
                  <Button
                    size="dashboard"
                    variant={decision === 'rejected' ? 'default' : 'secondary'}
                    onClick={() => setDecision(ivId, 'rejected')}
                  >
                    {t('Reject')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          {t('Notes (optional)')}
        </label>
        <textarea
          className="w-full rounded-lg border border-zinc-200 bg-white p-2 text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-brand dark:bg-zinc-900 dark:text-zinc-100"
          rows={2}
          placeholder={t("e.g. 'Skipped relaxation intervention — patient already does yoga'")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {pendingCount > 0
            ? t('{{n}} suggestion(s) not yet decided', { n: pendingCount })
            : acceptedCount > 0
              ? t('{{n}} will be added to plan', { n: acceptedCount })
              : t('All suggestions rejected')}
        </p>
        <div className="flex gap-2">
          <Button size="dashboard" variant="secondary" onClick={onDismiss} disabled={submitting}>
            {t('Cancel')}
          </Button>
          <Button size="dashboard" onClick={handleApply} disabled={submitting || pendingCount > 0}>
            {submitting ? t('Saving…') : t('Apply decisions')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AISuggestionPanel;
