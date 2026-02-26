import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';
import { translateText } from '../utils/translate';
import { format } from 'date-fns';

export type InterventionMeta = {
  _id?: string;
  external_id?: string;
  language?: string;
  provider?: string;
  title?: string;
  description?: string;
  content_type?: string;
  aim?: string;
  topic?: string[];
  where?: string[];
  setting?: string[];
  lc9?: string[];
  duration_bucket?: string;
  keywords?: string[];
  media?: any[];
  preview_img?: string;
  is_private?: boolean;
};

export type PatientRec = {
  intervention_id: string;
  intervention_title: string;
  description?: string;

  // assignment
  dates: string[];
  completion_dates?: string[];
  frequency?: string;
  notes?: string;
  require_video_feedback?: boolean;

  // media/preview (legacy still used by UI)
  duration?: number;
  preview_img?: string;
  media?: any[];

  // ✅ NEW: full intervention object (from backend)
  intervention?: InterventionMeta;

  // translations
  translated_title?: string;
  translated_description?: string;
  titleLang?: string;
  descLang?: string;
};

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const upsertCompletionDate = (dates: string[] | undefined, dateKey: string) => {
  const base = Array.isArray(dates) ? dates : [];
  const withoutDay = base.filter((d) => !String(d).startsWith(dateKey));
  // IMPORTANT: keep day-key stable; backend now returns YYYY-MM-DD -> we keep same
  return [...withoutDay, dateKey];
};

class PatientInterventionsStore {
  items: PatientRec[] = [];
  loading = false;

  error: string | null = null;
  errorDetails: string | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  clearError() {
    this.error = null;
    this.errorDetails = null;
  }

  // ✅ completion_dates are now day-keys: ["2026-02-25", ...]
  isCompletedOn(rec: PatientRec, date: Date) {
    const dateStr = format(date, 'yyyy-MM-dd');
    return asArray<string>(rec.completion_dates).some((d) => String(d).startsWith(dateStr));
  }

  async fetchPlan(patientId: string, uiLang: string) {
    this.loading = true;
    this.clearError();

    try {
      const { data } = await apiClient.get(`/patients/rehabilitation-plan/patient/${patientId}/`);
      const list = asArray<any>(data);

      const lang = (uiLang || 'en').slice(0, 2);

      const translated: PatientRec[] = await Promise.all(
        list.map(async (row: any) => {
          const meta: InterventionMeta | undefined =
            row && typeof row === 'object' ? (row.intervention as InterventionMeta) : undefined;

          const title = String(row?.intervention_title || meta?.title || '');
          const desc = String(row?.description || meta?.description || '');

          const t1 = await translateText(title, lang);
          const t2 = await translateText(desc, lang);

          return {
            intervention_id: String(row?.intervention_id || meta?._id || ''),
            intervention_title: title,
            description: desc,

            dates: asArray<string>(row?.dates),
            completion_dates: asArray<string>(row?.completion_dates),
            frequency: String(row?.frequency || ''),
            notes: String(row?.notes || ''),
            require_video_feedback: Boolean(row?.require_video_feedback),

            duration: typeof row?.duration === 'number' ? row.duration : undefined,
            preview_img: String(row?.preview_img || meta?.preview_img || ''),
            media: asArray<any>(row?.media || meta?.media),

            intervention: meta,

            translated_title: t1.translatedText,
            translated_description: t2.translatedText,
            titleLang: t1.detectedSourceLanguage,
            descLang: t2.detectedSourceLanguage,
          } as PatientRec;
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
    }

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
              completion_dates: asArray<string>(r.completion_dates).filter(
                (d) => !String(d).startsWith(dateKey)
              ),
            }
          : r
      );
    });

    return { completed: false, dateKey };
  }
}

export const patientInterventionsStore = new PatientInterventionsStore();
export { PatientInterventionsStore };