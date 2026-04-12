// src/stores/healthPageStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '@/api/client';
import { SessionCache } from '@/utils/sessionCache';
import type {
  FitbitEntry,
  QuestionnaireEntry,
  ViewMode,
  ChartRes,
  AdherenceEntry,
} from '../types/health';

export type PatientThresholds = {
  steps_goal: number;

  active_minutes_green: number;
  active_minutes_yellow: number;

  sleep_green_min: number;
  sleep_yellow_min: number;

  bp_sys_green_max: number;
  bp_sys_yellow_max: number;
  bp_dia_green_max: number;
  bp_dia_yellow_max: number;
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is UnknownRecord => typeof v === 'object' && v !== null;
const isString = (v: unknown): v is string => typeof v === 'string';
const isArray = Array.isArray;

const getString = (v: unknown): string | null => (isString(v) ? v : null);

const extractApiErrorMessage = (err: unknown, fallback: string): string => {
  // axios-like shape: err.response.data.{error|message|detail}
  if (isRecord(err)) {
    const resp = err['response'];
    if (isRecord(resp)) {
      const data = resp['data'];
      if (isRecord(data)) {
        const msg =
          getString(data['error']) ||
          getString(data['message']) ||
          getString(data['detail']) ||
          getString(data['details']);
        if (msg && msg.trim()) return msg.trim();
      }
    }

    const msg = getString(err['message']);
    if (msg && msg.trim()) return msg.trim();
  }
  return fallback;
};

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

const DEFAULT_THRESHOLDS: PatientThresholds = {
  steps_goal: 10000,
  active_minutes_green: 30,
  active_minutes_yellow: 20,
  sleep_green_min: 7 * 60,
  sleep_yellow_min: 6 * 60,
  bp_sys_green_max: 129,
  bp_sys_yellow_max: 139,
  bp_dia_green_max: 84,
  bp_dia_yellow_max: 89,
};

const n = (v: unknown, fallback: number) => {
  const x = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(x) ? x : fallback;
};

const normalizeThresholds = (raw: unknown): PatientThresholds => {
  const t = isRecord(raw) ? raw : {};
  return {
    steps_goal: n(t['steps_goal'], DEFAULT_THRESHOLDS.steps_goal),

    active_minutes_green: n(t['active_minutes_green'], DEFAULT_THRESHOLDS.active_minutes_green),
    active_minutes_yellow: n(t['active_minutes_yellow'], DEFAULT_THRESHOLDS.active_minutes_yellow),

    sleep_green_min: n(t['sleep_green_min'], DEFAULT_THRESHOLDS.sleep_green_min),
    sleep_yellow_min: n(t['sleep_yellow_min'], DEFAULT_THRESHOLDS.sleep_yellow_min),

    bp_sys_green_max: n(t['bp_sys_green_max'], DEFAULT_THRESHOLDS.bp_sys_green_max),
    bp_sys_yellow_max: n(t['bp_sys_yellow_max'], DEFAULT_THRESHOLDS.bp_sys_yellow_max),
    bp_dia_green_max: n(t['bp_dia_green_max'], DEFAULT_THRESHOLDS.bp_dia_green_max),
    bp_dia_yellow_max: n(t['bp_dia_yellow_max'], DEFAULT_THRESHOLDS.bp_dia_yellow_max),
  };
};

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
  chartRes: ChartRes = 'daily';
  referenceDate: Date = new Date();
  patientName: string | null = null;

  // Data state
  fitbitData: FitbitEntry[] = [];
  questionnaireData: QuestionnaireEntry[] = [];
  adherenceData: AdherenceEntry[] = [];

  // Thresholds (for chart goal lines / boundaries)
  thresholds: PatientThresholds = normalizeThresholds(DEFAULT_THRESHOLDS);
  thresholdsLoading = false;
  thresholdsError: string | null = null;

  // Visibility toggles (questionKey -> visible)
  visibleQuestions: Record<string, boolean> = {};

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

  setChartRes(res: ChartRes) {
    this.chartRes = res;
  }

  setReferenceDate(d: Date) {
    this.referenceDate = d;
  }

  setPatientName(name: string | null) {
    this.patientName = name;
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

  toggleQuestion(key: string) {
    this.visibleQuestions = {
      ...this.visibleQuestions,
      [key]: !this.visibleQuestions[key],
    };
  }

  setAllQuestionsVisible(value: boolean) {
    const next: Record<string, boolean> = {};
    Object.keys(this.visibleQuestions || {}).forEach((k) => (next[k] = value));
    this.visibleQuestions = next;
  }

  private _rebuildVisibleQuestionsFromData() {
    const vis: Record<string, boolean> = {};
    for (const q of this.questionnaireData) {
      // QuestionnaireEntry likely has questionKey; we treat it as optional string.
      const key = (q as unknown as { questionKey?: unknown }).questionKey;
      if (typeof key === 'string' && key.trim() && !(key in vis)) vis[key] = true;
    }
    this.visibleQuestions = vis;
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
        this.thresholdsError = extractApiErrorMessage(err, t('Failed to load thresholds.'));
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
  // Fetch combined (fitbit + questionnaire + adherence) + thresholds
  // ───────────────────────────
  async fetchCombinedHealth(from: Date, to: Date, t: (k: string) => string) {
    const userId = localStorage.getItem('selectedPatient');
    if (!userId) {
      runInAction(() => {
        this.error = t('Missing selected patient.');
      });
      return;
    }

    // fetch thresholds in parallel (don't block if it fails)
    void this.fetchThresholds(userId, t);

    await this.fetchCombinedHistoryForPatient(
      userId,
      from.toISOString().slice(0, 10),
      to.toISOString().slice(0, 10),
      t
    );
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
        this._rebuildVisibleQuestionsFromData();
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
        this._rebuildVisibleQuestionsFromData();
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
        this.error = extractApiErrorMessage(err, t('Failed to load health data.'));
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
