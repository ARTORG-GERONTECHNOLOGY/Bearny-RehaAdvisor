// src/stores/healthPageStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';
import type { FitbitEntry, QuestionnaireEntry, ViewMode, ChartRes, AdherenceEntry } from '../types/health';

type CombinedHealthResponse = {
  fitbit?: any[];
  questionnaire?: QuestionnaireEntry[];
  adherence?: AdherenceEntry[];
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

  // Visibility toggles (questionKey -> visible)
  visibleQuestions: Record<string, boolean> = {};

  // Status
  loading = false;
  error = '';

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
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
      if (q.questionKey && !(q.questionKey in vis)) vis[q.questionKey] = true;
    }
    this.visibleQuestions = vis;
  }

  // ───────────────────────────
  // Fetch
  // ───────────────────────────
  async fetchCombinedHealth(from: Date, to: Date, t: (k: string) => string) {
    const userId = localStorage.getItem('selectedPatient');
    if (!userId) {
      runInAction(() => {
        this.error = t('Missing selected patient.');
      });
      return;
    }

    this.loading = true;
    this.error = '';

    try {
      const params = {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      };

      const res = await apiClient.get<CombinedHealthResponse>(
        `
        '/patients/health-combined-history/${userId}/`,
        { params }
      );

      // Normalize exercise shape to always be: { sessions: [...] }
      const normalizedFitbit: FitbitEntry[] = (res.data.fitbit || []).map((d: any) => ({
        ...d,
        exercise: Array.isArray(d.exercise) ? { sessions: d.exercise } : d.exercise,
      }));

      runInAction(() => {
        this.fitbitData = normalizedFitbit;
        this.questionnaireData = Array.isArray(res.data.questionnaire) ? res.data.questionnaire : [];
        this.adherenceData = Array.isArray(res.data.adherence) ? res.data.adherence : [];
        this._rebuildVisibleQuestionsFromData();
      });
    } catch (e) {
      runInAction(() => {
        this.error = t('Failed to load health data.');
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}

export default HealthPageStore;
