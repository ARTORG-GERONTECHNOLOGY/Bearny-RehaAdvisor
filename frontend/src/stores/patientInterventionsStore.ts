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
  titleLang?: string;
  descLang?: string;
  // 2-letter target language translated_title/translated_description were translated into.
  translatedForLang?: string;
};

// An empty intervention_id is not an identity: matching on it would hit every blank row, so those match by reference only.
const isSameRow = (r: PatientRec, rec: PatientRec) =>
  r === rec || (!!rec.intervention_id && r.intervention_id === rec.intervention_id);

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

  // A write for patient A resolving after the store re-pointed at patient B must not patch B's rows.
  // A null currentPatientId means no plan is loaded yet, so there is no other patient's data to corrupt.
  private showsOtherPatient(patientId: string) {
    return this.currentPatientId !== null && this.currentPatientId !== patientId;
  }

  async fetchPlan(patientId: string, uiLang: string) {
    const patientChanged = this.currentPatientId !== patientId;
    this.currentPatientId = patientId;
    const generation = ++this.fetchGeneration;
    const cached = this.loadFromSessionStorage(patientId);
    if (cached) {
      runInAction(() => {
        this.items = cached;
      });
    } else if (patientChanged) {
      // No cache for the new patient: drop stale items so they don't render under the new patient's identity.
      runInAction(() => {
        this.items = [];
      });
    }
    if (!this.items.length) this.loading = true;
    this.clearError();

    const lang = (uiLang || 'en').slice(0, 2);

    // Reuse known translations by array position (not id|title, which can collide) so a refetch doesn't flash translated text back to source while retranslating.
    const previousTranslations = new Map(
      this.items
        .map((r, index) => [index, r] as const)
        .filter(([, r]) => r.translated_title !== undefined && r.translatedForLang === lang)
    );

    let raw: PatientRec[];
    try {
      const { data } = await apiClient.get(`/patients/rehabilitation-plan/patient/${patientId}/`, {
        params: { lang },
      });
      if (generation !== this.fetchGeneration) return;

      raw = asArray<any>(data).map((row: any, index: number) => {
        const meta: InterventionMeta | undefined =
          row && typeof row === 'object' ? (row.intervention as InterventionMeta) : undefined;

        const intervention_id = String(row?.intervention_id || meta?._id || '');
        const intervention_title = String(row?.intervention_title || meta?.title || '');
        const description = String(row?.description || meta?.description || '');
        const candidate = previousTranslations.get(index);
        const prev =
          candidate &&
          candidate.intervention_id === intervention_id &&
          candidate.intervention_title === intervention_title &&
          candidate.description === description
            ? candidate
            : undefined;

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
          titleLang: prev?.titleLang,
          descLang: prev?.descLang,
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
      const rowsToTranslate = raw
        .map((rec, index) => ({ rec, index }))
        .filter(({ rec }) => rec.translated_title === undefined);

      // Keyed by array position, not intervention_id: rows can share an empty id.
      const translations = new Map(
        await Promise.all(
          rowsToTranslate.map(async ({ rec, index }) => {
            const options = { knownSourceLanguage: rec.intervention?.language };
            const [t1, t2] = await Promise.all([
              translateText(rec.intervention_title, options),
              translateText(rec.description || '', options),
            ]);

            // translateText signals failure by returning the text unchanged with 'error'.
            const failed =
              t1.detectedSourceLanguage === 'error' || t2.detectedSourceLanguage === 'error';

            return [
              index,
              {
                translated_title: t1.translatedText,
                translated_description: t2.translatedText,
                titleLang: t1.detectedSourceLanguage,
                descLang: t2.detectedSourceLanguage,
                // Unmarked on failure so the next fetch retries instead of reusing raw text.
                translatedForLang: failed ? undefined : lang,
              },
            ] as const;
          })
        )
      );

      if (generation !== this.fetchGeneration) return;

      runInAction(() => {
        this.items = this.items.map((r, index) => {
          const patch = translations.get(index);
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

      if (!this.showsOtherPatient(patientId)) {
        runInAction(() => {
          this.items = this.items.map((r) =>
            isSameRow(r, rec)
              ? { ...r, completion_dates: upsertCompletionDate(r.completion_dates, dateKey) }
              : r
          );
        });
      }

      return { completed: true, dateKey };
    }

    await apiClient.post('interventions/uncomplete/', {
      patient_id: patientId,
      intervention_id: rec.intervention_id,
      date: dateKey,
    });

    if (!this.showsOtherPatient(patientId)) {
      runInAction(() => {
        this.items = this.items.map((r) =>
          isSameRow(r, rec)
            ? {
                ...r,
                completion_dates: asArray<string>(r.completion_dates).filter(
                  (d) => !String(d).startsWith(dateKey)
                ),
              }
            : r
        );
      });
    }

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

    if (!this.showsOtherPatient(patientId)) {
      runInAction(() => {
        this.items = this.items.map((r) =>
          isSameRow(r, rec)
            ? {
                ...r,
                dates: asArray<string>(r.dates).map((d) => (d === oldDatetime ? newIso : d)),
              }
            : r
        );
      });
    }

    return newIso;
  }
}

export const patientInterventionsStore = new PatientInterventionsStore();
export { PatientInterventionsStore };
