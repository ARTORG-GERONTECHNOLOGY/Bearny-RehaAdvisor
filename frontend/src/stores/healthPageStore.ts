// src/stores/healthPageStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '@/api/client';
import { SessionCache } from '@/utils/sessionCache';
import type { FitbitEntry, QuestionnaireEntry, ViewMode, AdherenceEntry } from '@/types/health';
import {
  DEFAULT_THRESHOLDS,
  normalizeThresholds,
  type PatientThresholds,
} from '@/utils/thresholds';
import { isRecord, type UnknownRecord } from '@/utils/typeGuards';
import { getApiErrorMessage } from '@/utils/apiErrorMessages';

const isArray = Array.isArray;

type CombinedHealthResponseRaw = {
  fitbit?: unknown;
  questionnaire?: unknown;
  adherence?: unknown;
};

type ThresholdsResponseRaw =
  | {
      thresholds?: unknown;
      history?: unknown;
    }
  | unknown;

// ---- Fitbit normalize helpers (exercise sessions shape) ----
type FitbitExerciseSessions = { sessions: unknown[] };

// We keep the output as FitbitEntry (your app type), but we normalize the raw with safe guards
const normalizeFitbitExercise = (exercise: unknown): FitbitExerciseSessions => {
  // 1) legacy list -> wrap
  if (isArray(exercise)) return { sessions: exercise };

  // 2) object with sessions array -> keep sessions
  if (isRecord(exercise) && isArray(exercise['sessions'])) {
    return { sessions: exercise['sessions'] as unknown[] };
  }

  // 3) missing / unknown -> empty
  return { sessions: [] };
};

const normalizeFitbitList = (raw: unknown): FitbitEntry[] => {
  if (!isArray(raw)) return [];

  // We avoid `any` by building `unknown` objects and then asserting to FitbitEntry at the end,
  // because FitbitEntry is your domain type (defined elsewhere).
  return raw
    .filter((x) => isRecord(x))
    .map((d) => {
      const rec = d as UnknownRecord;
      const ex = rec['exercise'];
      const normalizedExercise = normalizeFitbitExercise(ex);

      // produce a plain object with normalized exercise
      const out: UnknownRecord = { ...rec, exercise: normalizedExercise };

      return out as unknown as FitbitEntry;
    });
};

const normalizeQuestionnaireList = (raw: unknown): QuestionnaireEntry[] => {
  return isArray(raw) ? (raw as unknown[]).filter((x): x is QuestionnaireEntry => true) : [];
};

const normalizeAdherenceList = (raw: unknown): AdherenceEntry[] => {
  return isArray(raw) ? (raw as unknown[]).filter((x): x is AdherenceEntry => true) : [];
};

export class HealthPageStore {
  // UI state
  viewMode: ViewMode = 'monthly';
  referenceDate: Date = new Date();

  // Data state
  fitbitData: FitbitEntry[] = [];
  questionnaireData: QuestionnaireEntry[] = [];
  adherenceData: AdherenceEntry[] = [];

  // Thresholds (for chart goal lines / boundaries)
  thresholds: PatientThresholds = normalizeThresholds(DEFAULT_THRESHOLDS);
  thresholdsLoading = false;
  thresholdsError: string | null = null;

  // Status
  loading = false;
  error = '';

  private static cache = new SessionCache('healthPageStore');

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  private static saveToSessionStorage(
    cacheKey: string,
    data: {
      fitbitData: FitbitEntry[];
      questionnaireData: QuestionnaireEntry[];
      adherenceData: AdherenceEntry[];
    }
  ) {
    HealthPageStore.cache.set(cacheKey, data);
  }

  static loadFromSessionStorage(cacheKey: string) {
    return HealthPageStore.cache.get<{
      fitbitData: FitbitEntry[];
      questionnaireData: QuestionnaireEntry[];
      adherenceData: AdherenceEntry[];
    }>(cacheKey);
  }

  // ───────────────────────────
  // Derived ranges (data window)
  // ───────────────────────────
  get startDate(): Date {
    if (this.viewMode === 'weekly') {
      const d = new Date(this.referenceDate);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      return new Date(d.getFullYear(), d.getMonth(), diff);
    }
    return new Date(this.referenceDate.getFullYear(), this.referenceDate.getMonth(), 1);
  }

  get endDate(): Date {
    if (this.viewMode === 'weekly') {
      const start = this.startDate;
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return end;
    }
    return new Date(this.referenceDate.getFullYear(), this.referenceDate.getMonth() + 1, 0);
  }

  get viewStart(): Date {
    return this.startDate;
  }

  get viewEnd(): Date {
    return this.endDate;
  }

  // ───────────────────────────
  // Actions
  // ───────────────────────────
  setViewMode(mode: ViewMode) {
    this.viewMode = mode;
  }

  setReferenceDate(d: Date) {
    this.referenceDate = d;
  }

  setError(msg: string) {
    this.error = msg;
  }

  clearError() {
    this.error = '';
  }

  goPrev() {
    const d = new Date(this.referenceDate);
    if (this.viewMode === 'weekly') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    this.referenceDate = d;
  }

  goNext() {
    const d = new Date(this.referenceDate);
    if (this.viewMode === 'weekly') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    this.referenceDate = d;
  }

  // ───────────────────────────
  // Thresholds fetch
  // ───────────────────────────
  async fetchThresholds(patientId: string, t: (k: string) => string) {
    if (!patientId) return;

    this.thresholdsLoading = true;
    this.thresholdsError = null;

    try {
      const res = await apiClient.get<ThresholdsResponseRaw>(`/patients/${patientId}/thresholds/`);
      const data = res.data;

      // support both shapes:
      // 1) { thresholds: {...}, history: [...] }
      // 2) { ...threshold fields... }
      let th: unknown = data;

      if (isRecord(data) && 'thresholds' in data) {
        const maybe = (data as UnknownRecord)['thresholds'];
        if (maybe != null) th = maybe;
      }

      runInAction(() => {
        this.thresholds = normalizeThresholds(th);
      });
    } catch (err: unknown) {
      runInAction(() => {
        this.thresholdsError = getApiErrorMessage(err, t('Failed to load thresholds.'));
        // keep defaults so charts still work
        this.thresholds = this.thresholds || normalizeThresholds(DEFAULT_THRESHOLDS);
      });
    } finally {
      runInAction(() => {
        this.thresholdsLoading = false;
      });
    }
  }

  // ───────────────────────────
  // Fetch combined history by explicit patient ID (patient self-view)
  // ───────────────────────────
  async fetchCombinedHistoryForPatient(
    patientId: string,
    from: string,
    to: string,
    t: (k: string) => string = (k) => k
  ) {
    if (!patientId) return;

    const cacheKey = `${patientId}_${from}_${to}`;
    const cached = HealthPageStore.loadFromSessionStorage(cacheKey);
    if (cached) {
      runInAction(() => {
        this.fitbitData = cached.fitbitData;
        this.questionnaireData = cached.questionnaireData;
        this.adherenceData = cached.adherenceData;
      });
    }

    if (!cached) this.loading = true;
    this.error = '';

    try {
      const res = await apiClient.get<CombinedHealthResponseRaw>(
        `/patients/health-combined-history/${patientId}/`,
        { params: { from, to } }
      );

      const raw = res.data;
      const fitbitRaw = isRecord(raw) ? raw.fitbit : undefined;
      const questionnaireRaw = isRecord(raw) ? raw.questionnaire : undefined;
      const adherenceRaw = isRecord(raw) ? raw.adherence : undefined;

      runInAction(() => {
        this.fitbitData = normalizeFitbitList(fitbitRaw);
        this.questionnaireData = normalizeQuestionnaireList(questionnaireRaw);
        this.adherenceData = normalizeAdherenceList(adherenceRaw);
      });

      HealthPageStore.saveToSessionStorage(cacheKey, {
        fitbitData: this.fitbitData,
        questionnaireData: this.questionnaireData,
        adherenceData: this.adherenceData,
      });
    } catch (err: unknown) {
      runInAction(() => {
        this.fitbitData = [];
        this.questionnaireData = [];
        this.adherenceData = [];
        this.error = getApiErrorMessage(err, t('Failed to load health data.'));
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}

export const healthPageStore = new HealthPageStore();
export default HealthPageStore;
