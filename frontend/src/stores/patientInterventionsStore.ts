import i18next from 'i18next';
import { makeAutoObservable, reaction, runInAction } from 'mobx';
import apiClient from '@/api/client';
import { SessionCache } from '@/utils/sessionCache';
import { translateText } from '@/utils/translate';
import { asArray } from '@/utils/typeGuards';
import { extractApiErrorWithDetails } from '@/utils/apiErrorMessages';
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

  // full intervention object (from backend)
  intervention?: InterventionMeta;

  // translations
  translated_title?: string;
  translated_description?: string;
  // 2-letter language translateText rendered these into — not the language the plan was fetched in.
  translatedForLang?: string;
};

// Normalised exactly as translate.ts derives its target, so the two are comparable.
const currentUiLang = () => (i18next.language || 'en').slice(0, 2);

// Identifies the source text a translation belongs to, so a refetch can carry it over.
const translationKey = (
  r: Pick<PatientRec, 'intervention_id' | 'intervention_title' | 'description'>
) => JSON.stringify([r.intervention_id, r.intervention_title, r.description || '']);

const upsertCompletionDate = (dates: string[] | undefined, dateKey: string) => {
  const base = Array.isArray(dates) ? dates : [];
  const withoutDay = base.filter((d) => !String(d).startsWith(dateKey));
  // IMPORTANT: keep day-key stable; backend now returns YYYY-MM-DD -> we keep same
  return [...withoutDay, dateKey];
};

class PatientInterventionsStore {
  private static cache = new SessionCache('patientInterventionsStore');

  items: PatientRec[] = [];
  loading = false;

  error: string | null = null;
  errorDetails: string | null = null;

  assistanceMode: 'alone' | 'with_help' | null = null;

  private currentPatientId: string | null = null;
  // Bumped per fetchPlan() call so a stale fetch can't overwrite a newer one's items.
  private fetchGeneration = 0;

  constructor() {
    makeAutoObservable<PatientInterventionsStore, 'currentPatientId' | 'fetchGeneration'>(
      this,
      { currentPatientId: false, fetchGeneration: false },
      { autoBind: true }
    );

    reaction(
      () => this.items,
      () => {
        if (this.currentPatientId) this.saveToSessionStorage(this.currentPatientId);
      }
    );
  }

  private saveToSessionStorage(patientId: string) {
    PatientInterventionsStore.cache.set(patientId, this.items);
  }

  private loadFromSessionStorage(patientId: string): PatientRec[] | null {
    return PatientInterventionsStore.cache.get<PatientRec[]>(patientId);
  }

  clearError() {
    this.error = null;
    this.errorDetails = null;
  }

  setAssistanceMode(mode: 'alone' | 'with_help') {
    this.assistanceMode = mode;
  }

  isCompletedOn(rec: PatientRec, date: Date) {
    const dateStr = format(date, 'yyyy-MM-dd');
    return asArray<string>(rec.completion_dates).some((d) => String(d).startsWith(dateStr));
  }

  async fetchPlan(patientId: string, uiLang: string) {
    this.currentPatientId = patientId;
    const generation = ++this.fetchGeneration;
    const cached = this.loadFromSessionStorage(patientId);
    if (cached) {
      runInAction(() => {
        this.items = cached;
      });
    }
    if (!this.items.length) this.loading = true;
    this.clearError();

    // The plan is fetched in uiLang (which may be the patient's stored preference), but
    // translateText renders into i18next.language. They are not always the same.
    const lang = (uiLang || 'en').slice(0, 2);
    const target = currentUiLang();

    // Rows publish before translations resolve, so carry known ones over or a refetch flashes back to source.
    const previousTranslations = new Map(
      this.items
        .filter((r) => r.translated_title !== undefined && r.translatedForLang === target)
        .map((r) => [translationKey(r), r] as const)
    );

    let raw: PatientRec[];
    try {
      const { data } = await apiClient.get(`/patients/rehabilitation-plan/patient/${patientId}/`, {
        params: { lang },
      });
      if (generation !== this.fetchGeneration) return;

      raw = asArray<any>(data).map((row: any) => {
        const meta: InterventionMeta | undefined =
          row && typeof row === 'object' ? (row.intervention as InterventionMeta) : undefined;

        const intervention_id = String(row?.intervention_id || meta?._id || '');
        const intervention_title = String(row?.intervention_title || meta?.title || '');
        const description = String(row?.description || meta?.description || '');
        const prev = previousTranslations.get(
          translationKey({ intervention_id, intervention_title, description })
        );

        return {
          intervention_id,
          intervention_title,
          description,

          dates: asArray<string>(row?.dates),
          completion_dates: asArray<string>(row?.completion_dates),
          frequency: String(row?.frequency || ''),
          notes: String(row?.notes || ''),
          require_video_feedback: Boolean(row?.require_video_feedback),

          duration: typeof row?.duration === 'number' ? row.duration : undefined,
          preview_img: String(row?.preview_img || meta?.preview_img || ''),
          media: asArray<any>(row?.media || meta?.media),

          intervention: meta,

          translated_title: prev?.translated_title,
          translated_description: prev?.translated_description,
          translatedForLang: prev?.translatedForLang,
        };
      });

      // Render immediately with original-language text; translations patch in below.
      runInAction(() => {
        this.items = raw;
        this.loading = false;
      });
    } catch (err: unknown) {
      if (generation !== this.fetchGeneration) return;
      const { message, details } = extractApiErrorWithDetails(err, 'An unexpected error occurred.');
      runInAction(() => {
        this.error = message;
        this.errorDetails = details;
        this.loading = false;
      });
      return;
    }

    try {
      const rowsToTranslate = raw.filter((rec) => rec.translated_title === undefined);

      const translations = new Map(
        await Promise.all(
          rowsToTranslate.map(async (rec) => {
            // Description is unused here: it warms the cache the detail page reads on open.
            const [title, desc] = await Promise.all([
              translateText(rec.intervention_title),
              translateText(rec.description || ''),
            ]);

            // translateText signals failure by returning the text unchanged with 'error'.
            const failed =
              title.detectedSourceLanguage === 'error' || desc.detectedSourceLanguage === 'error';

            return [
              translationKey(rec),
              {
                translated_title: title.translatedText,
                translated_description: desc.translatedText,
                // Unmarked on failure so the next fetch retries instead of reusing raw text.
                translatedForLang: failed ? undefined : target,
              },
            ] as const;
          })
        )
      );

      // A switch mid-fetch means these were rendered into a different language than `target`.
      if (generation !== this.fetchGeneration || currentUiLang() !== target) return;

      runInAction(() => {
        this.items = this.items.map((r) => {
          const patch = translations.get(translationKey(r));
          return patch ? { ...r, ...patch } : r;
        });
      });
    } catch (err: unknown) {
      console.error('[fetchPlan] Translation patch failed:', err);
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
        ...(this.assistanceMode ? { assistance: this.assistanceMode } : {}),
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

  async rescheduleOccurrence(
    patientId: string,
    rec: PatientRec,
    oldDatetime: string,
    newDatetime: Date
  ) {
    const { data } = await apiClient.post('interventions/reschedule-date/', {
      patientId,
      interventionId: rec.intervention_id,
      oldDatetime,
      newDatetime: newDatetime.toISOString(),
    });

    const newIso = String(data?.newDatetime || newDatetime.toISOString());

    runInAction(() => {
      this.items = this.items.map((r) =>
        r.intervention_id === rec.intervention_id
          ? {
              ...r,
              dates: asArray<string>(r.dates).map((d) => (d === oldDatetime ? newIso : d)),
            }
          : r
      );
    });

    return newIso;
  }
}

export const patientInterventionsStore = new PatientInterventionsStore();
export { PatientInterventionsStore };
