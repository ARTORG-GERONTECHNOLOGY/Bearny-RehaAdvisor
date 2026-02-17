import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';
import { translateText } from '../utils/translate';
import { format } from 'date-fns';

export type PatientRec = {
  intervention_id: string;
  intervention_title: string;
  description?: string;
  dates: string[];
  duration?: number;
  preview_img?: string;
  completion_dates?: string[];
  translated_title?: string;
  translated_description?: string;
  titleLang?: string;
  descLang?: string;
  notes?: string;
};

const upsertCompletionDate = (dates: string[] | undefined, dateKey: string) => {
  const base = Array.isArray(dates) ? dates : [];
  const withoutDay = base.filter((d) => !String(d).startsWith(dateKey));
  const canonical = `${dateKey}T00:00:00.000Z`;
  return [...withoutDay, canonical];
};

class PatientInterventionsStore {
  items: PatientRec[] = [];
  loading = false;

  error: string | null = null;
  errorDetails: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  clearError() {
    this.error = null;
    this.errorDetails = null;
  }

  isCompletedOn(rec: PatientRec, date: Date) {
    const dateStr = format(date, 'yyyy-MM-dd');
    return (rec.completion_dates || []).some((d) => String(d).startsWith(dateStr));
  }

  async fetchPlan(patientId: string, uiLang: string) {
    this.loading = true;
    this.clearError();

    try {
      const { data } = await apiClient.get(`/patients/rehabilitation-plan/patient/${patientId}/`);

      const lang = (uiLang || 'en').slice(0, 2);

      const translated: PatientRec[] = await Promise.all(
        (data || []).map(async (rec: PatientRec) => {
          const t1 = await translateText(rec.intervention_title, lang);
          const t2 = await translateText(rec.description || '', lang);
          return {
            ...rec,
            translated_title: t1.translatedText,
            translated_description: t2.translatedText,
            titleLang: t1.detectedSourceLanguage,
            descLang: t2.detectedSourceLanguage,
          };
        })
      );

      runInAction(() => {
        this.items = translated;
      });
    } catch (err: any) {
      const backend = err?.response?.data;
      runInAction(() => {
        this.error = backend?.error || err?.message || 'An unexpected error occurred.';
        this.errorDetails = backend?.details || null;
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async toggleCompleted(patientId: string, rec: PatientRec, date: Date) {
    const dateKey = format(date, 'yyyy-MM-dd');
    const already = this.isCompletedOn(rec, date);

    if (!already) {
      await apiClient.post('interventions/complete/', {
        patient_id: patientId,
        intervention_id: rec.intervention_id,
        date: dateKey,
      });

      runInAction(() => {
        this.items = this.items.map((r) =>
          r.intervention_id === rec.intervention_id
            ? { ...r, completion_dates: upsertCompletionDate(r.completion_dates, dateKey) }
            : r
        );
      });

      return { completed: true, dateKey };
    } else {
      await apiClient.post('interventions/uncomplete/', {
        patient_id: patientId,
        intervention_id: rec.intervention_id,
        date: dateKey,
      });

      runInAction(() => {
        this.items = this.items.map((r) =>
          r.intervention_id === rec.intervention_id
            ? {
                ...r,
                completion_dates: (r.completion_dates || []).filter(
                  (d) => !String(d).startsWith(dateKey)
                ),
              }
            : r
        );
      });

      return { completed: false, dateKey };
    }
  }
}

export const patientInterventionsStore = new PatientInterventionsStore();
