import { patientFitbitStore } from '@/stores/patientFitbitStore';
import { patientInterventionsStore } from '@/stores/patientInterventionsStore';
import { patientInterventionsLibraryStore } from '@/stores/interventionsLibraryStore';
import { healthPageStore } from '@/stores/healthPageStore';
import { getDateWindow } from '@/hooks/usePatientProcess';

let initializedFor: string | null = null;

export function initPatientData(patientId: string, lang: string): void {
  if (!patientId || initializedFor === patientId) return;
  initializedFor = patientId;

  const language = (lang || 'en').slice(0, 2);
  const { from: wFrom, to: wTo } = getDateWindow('week');
  const { from: mFrom, to: mTo } = getDateWindow('month');

  patientFitbitStore.fetchStatus(patientId);
  patientFitbitStore.fetchSummary(patientId, 7);
  patientFitbitStore.fetchSummary(patientId, 30);
  patientInterventionsStore.fetchPlan(patientId, lang);
  patientInterventionsLibraryStore.fetchAll({ mode: 'patient', lang: language });
  healthPageStore.fetchCombinedHistoryForPatient(patientId, wFrom, wTo);
  healthPageStore.fetchCombinedHistoryForPatient(patientId, mFrom, mTo);
}

/** Call on logout so the next login re-triggers a fresh fetch. */
export function resetPatientDataInit(): void {
  initializedFor = null;
}
