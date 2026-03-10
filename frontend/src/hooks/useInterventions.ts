import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { patientInterventionsStore, type PatientRec } from '@/stores/patientInterventionsStore';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';
import authStore from '@/stores/authStore';

/**
 * Helper function to normalize date keys to yyyy-MM-dd format
 */
export const normalizeDayKey = (d: string | Date): string => {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  return format(dateObj, 'yyyy-MM-dd');
};

/**
 * Custom hook for managing patient interventions
 * Handles fetching, sorting, completion toggling, and feedback
 */
export const useInterventions = (date: Date) => {
  const { i18n } = useTranslation();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const patientId = localStorage.getItem('id') || authStore.id || '';

  // Get interventions for the specified date
  const interventions = useMemo(() => {
    const dateKey = normalizeDayKey(date);
    return patientInterventionsStore.items.filter((rec) =>
      (rec.dates || []).some((d) => normalizeDayKey(d) === dateKey)
    );
  }, [date, patientInterventionsStore.items]);

  // Sort interventions: incomplete first, then completed, alphabetically within each group
  const sortedInterventions = useMemo(() => {
    return [...interventions].sort((a, b) => {
      const aDone = patientInterventionsStore.isCompletedOn(a, date);
      const bDone = patientInterventionsStore.isCompletedOn(b, date);
      if (aDone === bDone) {
        const at = a.translated_title || a.intervention_title || '';
        const bt = b.translated_title || b.intervention_title || '';
        return at.localeCompare(bt);
      }
      return aDone ? 1 : -1;
    });
  }, [interventions, date]);

  // Calculate completion count
  const completionCount = useMemo(() => {
    const completed = interventions.filter((rec) =>
      patientInterventionsStore.isCompletedOn(rec, date)
    ).length;
    return { completed, total: interventions.length };
  }, [interventions, date]);

  // Open feedback for completed intervention
  const openFeedbackFor = useCallback(
    async (interventionId: string, dateKey: string) => {
      try {
        await patientQuestionnairesStore.openInterventionFeedback(
          patientId,
          interventionId,
          dateKey,
          i18n.language
        );
      } catch (e) {
        console.error('[openFeedbackFor] failed:', e);
        try {
          patientQuestionnairesStore.closeFeedback();
        } catch {
          // Ignore close errors
        }
      }
    },
    [patientId, i18n.language]
  );

  // Handle toggle completion
  const toggleCompleted = useCallback(
    async (rec: PatientRec, targetDate: Date) => {
      if (!patientId) return;

      const dateKey = format(targetDate, 'yyyy-MM-dd');
      const lockKey = `${rec.intervention_id}__${dateKey}`;

      if (busyKey === lockKey) return;
      setBusyKey(lockKey);

      try {
        const res = await patientInterventionsStore.toggleCompleted(patientId, rec, targetDate);

        setBusyKey(null);

        if (res?.completed) {
          void openFeedbackFor(rec.intervention_id, res.dateKey);
        }
      } catch (err) {
        console.error('Toggle completed failed:', err);
        setBusyKey(null);
      }
    },
    [patientId, busyKey, openFeedbackFor]
  );

  // Check if an intervention is busy (being toggled)
  const isBusy = useCallback(
    (rec: PatientRec, targetDate: Date): boolean => {
      const dateKey = format(targetDate, 'yyyy-MM-dd');
      const lockKey = `${rec.intervention_id}__${dateKey}`;
      return busyKey === lockKey;
    },
    [busyKey]
  );

  return {
    interventions,
    sortedInterventions,
    completionCount,
    toggleCompleted,
    isBusy,
    patientId,
  };
};
