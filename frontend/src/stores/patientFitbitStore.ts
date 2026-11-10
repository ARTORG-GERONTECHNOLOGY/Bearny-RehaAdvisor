import { makeAutoObservable, reaction, runInAction } from 'mobx';
import apiClient from '@/api/client';
import { SessionCache } from '@/utils/sessionCache';
import { type PatientThresholds } from '@/utils/thresholds';

export type AzmBreakdown = {
  fat_burn?: number | null;
  cardio?: number | null;
  peak?: number | null;
  total?: number | null;
};

export type DailyRow = {
  date: string;
  steps: number;
  active_minutes?: number;
  active_zone_minutes?: AzmBreakdown | null;
  sleep_minutes?: number;
  weight_kg?: number | null;
  bp_sys?: number | null;
  bp_dia?: number | null;
};

export type FitbitSummary = {
  connected: boolean;
  last_sync: string | null;
  thresholds?: Partial<PatientThresholds>;
  today?: {
    steps?: number;
    active_minutes?: number;
    active_zone_minutes?: AzmBreakdown | null;
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

class PatientFitbitStore {
  private static cache = new SessionCache('patientFitbitStore');

  connected: boolean | null = null;
  statusLoading = false;
  wearableDevice: 'fitbit' | 'omron' | 'google_health' | 'none' = 'fitbit';
  wearableDeviceLoaded = false;
  private statusFor: string | null = null;
  needsReconnect = false;
  daysUntilExpiry: number | null = null;
  hrScopeOk: boolean | null = null;
  hrDataMissing: boolean | null = null;
  sleepScopeOk: boolean | null = null;
  noDataEver: boolean | null = null;
  accountNotLinked: boolean | null = null;

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

  get useGoogleHealth(): boolean {
    return this.wearableDevice === 'google_health';
  }

  clearError() {
    this.error = '';
  }

  private resetStatusFlags() {
    this.needsReconnect = false;
    this.daysUntilExpiry = null;
    this.hrScopeOk = null;
    this.hrDataMissing = null;
    this.sleepScopeOk = null;
    this.noDataEver = null;
    this.accountNotLinked = null;
  }

  private switchTo(patientId: string) {
    if (patientId === this.statusFor) return;
    if (this.statusFor !== null) {
      // The store outlives logout, so drop the previous patient's state.
      this.connected = null;
      this.wearableDevice = 'fitbit';
      this.summary = null;
      this.resetStatusFlags();
    }
    this.wearableDeviceLoaded = false;
    this.statusFor = patientId;
  }

  private isCurrent(patientId: string) {
    return patientId === this.statusFor;
  }

  async fetchStatus(patientId: string) {
    this.switchTo(patientId);
    if (this.connected === null) this.statusLoading = true;
    this.error = '';
    try {
      // Google Health status returns wearable_device for all patients
      const { data: ghData } = await apiClient.get(`/google-health/status/${patientId}/`);
      if (!this.isCurrent(patientId)) return;
      const device = ghData?.wearable_device;
      if (device && ['fitbit', 'omron', 'google_health', 'none'].includes(device)) {
        runInAction(() => {
          this.wearableDevice = device;
          this.wearableDeviceLoaded = true;
        });
      }

      if (device === 'google_health') {
        runInAction(() => {
          this.connected = !!ghData?.connected;
          this.needsReconnect = !!ghData?.needs_reconnect;
          this.daysUntilExpiry = ghData?.days_until_expiry ?? null;
          this.hrScopeOk = ghData?.hr_scope_ok ?? null;
          this.hrDataMissing = ghData?.hr_data_missing ?? null;
          this.sleepScopeOk = ghData?.sleep_scope_ok ?? null;
          this.noDataEver = ghData?.no_data_ever ?? null;
          this.accountNotLinked = ghData?.account_not_linked ?? null;
        });
      } else {
        // Fitbit's API is gone and omron/none have no connection, so no device data arrives.
        runInAction(() => {
          this.connected = false;
          this.resetStatusFlags();
        });
      }
    } catch {
      if (!this.isCurrent(patientId)) return;
      runInAction(() => {
        this.connected = false;
        this.resetStatusFlags();
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
    const base = this.useGoogleHealth ? 'google-health' : 'fitbit';
    try {
      const { data } = await apiClient.get(`/${base}/summary/${patientId}/`, {
        params: { days },
      });
      if (this.statusFor !== null && !this.isCurrent(patientId)) return;
      runInAction(() => {
        this.summary = data;
      });
      PatientFitbitStore.saveSummaryToStorage(cacheKey, data as FitbitSummary);
    } catch {
      if (this.statusFor !== null && !this.isCurrent(patientId)) return;
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
    const base = this.useGoogleHealth ? 'google-health' : 'fitbit';
    await apiClient.post(`/${base}/manual_steps/${patientId}/`, { date, steps });
    await this.fetchSummary(patientId, 7, true);
  }

  async disconnect() {
    this.error = '';
    await apiClient.delete('/google-health/disconnect/');
    runInAction(() => {
      this.connected = false;
      this.summary = null;
    });
  }
}

export const patientFitbitStore = new PatientFitbitStore();
