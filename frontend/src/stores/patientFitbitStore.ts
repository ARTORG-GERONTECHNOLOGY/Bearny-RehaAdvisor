import { makeAutoObservable, reaction, runInAction } from 'mobx';
import apiClient from '@/api/client';
import { SessionCache } from '@/utils/sessionCache';

export type Thresholds = {
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

export type DailyRow = {
  date: string;
  steps: number;
  active_minutes?: number;
  sleep_minutes?: number;
  weight_kg?: number | null;
  bp_sys?: number | null;
  bp_dia?: number | null;
};

export type FitbitSummary = {
  connected: boolean;
  last_sync: string | null;
  thresholds?: Partial<Thresholds>;
  today?: {
    steps?: number;
    active_minutes?: number;
    sleep_minutes?: number;
    resting_heart_rate?: number | null;
    weight_kg?: number | null;
    bp_sys?: number | null;
    bp_dia?: number | null;
  } | null;
  period: {
    days: number;
    totals?: {
      steps?: number;
      active_minutes?: number;
      sleep_minutes?: number;
      weight_kg?: number | null;
      bp_sys?: number | null;
      bp_dia?: number | null;
    };
    averages?: {
      steps?: number;
      active_minutes?: number;
      sleep_minutes?: number;
      weight_kg?: number | null;
      bp_sys?: number | null;
      bp_dia?: number | null;
    };
    daily: DailyRow[];
  };
};

const DEFAULT_THRESHOLDS: Thresholds = {
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

export const mergeThresholds = (api?: Partial<Thresholds>): Thresholds => ({
  ...DEFAULT_THRESHOLDS,
  ...(api || {}),
});

class PatientFitbitStore {
  private static cache = new SessionCache('patientFitbitStore');

  connected: boolean | null = null;
  statusLoading = false;

  summary: FitbitSummary | null = null;
  summaryLoading = false;

  error = '';

  constructor() {
    makeAutoObservable(this);
    this.loadConnectedFromStorage();

    reaction(
      () => this.connected,
      () => this.saveConnectedToStorage()
    );
  }

  private saveConnectedToStorage() {
    PatientFitbitStore.cache.set('connected', this.connected);
  }

  private loadConnectedFromStorage() {
    const val = PatientFitbitStore.cache.get<boolean>('connected');
    if (typeof val === 'boolean') this.connected = val;
  }

  private static saveSummaryToStorage(cacheKey: string, data: FitbitSummary) {
    PatientFitbitStore.cache.set(cacheKey, data);
  }

  private static loadSummaryFromStorage(cacheKey: string): FitbitSummary | null {
    return PatientFitbitStore.cache.get<FitbitSummary>(cacheKey);
  }

  clearError() {
    this.error = '';
  }

  async fetchStatus(patientId: string) {
    if (this.connected === null) this.statusLoading = true;
    this.error = '';
    try {
      const { data } = await apiClient.get(`/google-health/status/${patientId}/`);
      runInAction(() => {
        this.connected = !!data?.connected;
      });
    } catch {
      runInAction(() => {
        this.connected = false;
      });
    } finally {
      runInAction(() => {
        this.statusLoading = false;
      });
    }
  }

  async fetchSummary(patientId: string, days = 7, force = false) {
    const cacheKey = `${patientId}_${days}`;
    const cached = PatientFitbitStore.loadSummaryFromStorage(cacheKey);
    if (cached && !force) {
      runInAction(() => {
        this.summary = cached;
      });
    }
    if (!cached || force) this.summaryLoading = true;
    this.error = '';
    try {
      const { data } = await apiClient.get(`/google-health/summary/${patientId}/`, {
        params: { days },
      });
      runInAction(() => {
        this.summary = data;
      });
      PatientFitbitStore.saveSummaryToStorage(cacheKey, data as FitbitSummary);
    } catch {
      runInAction(() => {
        if (!cached) {
          this.summary = null;
          this.error = 'error_f';
        }
      });
    } finally {
      runInAction(() => {
        this.summaryLoading = false;
      });
    }
  }

  async refresh(patientId: string) {
    if (this.connected === null) await this.fetchStatus(patientId);
    await this.fetchSummary(patientId, 7);
  }

  async submitManualSteps(patientId: string, date: string, steps: number) {
    this.error = '';
    await apiClient.post(`/google-health/manual_steps/${patientId}/`, { date, steps });
    await this.fetchSummary(patientId, 7, true);
  }
}

export const patientFitbitStore = new PatientFitbitStore();
