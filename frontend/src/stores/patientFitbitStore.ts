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
  needsReconnect = false;
  daysUntilExpiry: number | null = null;

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

  async fetchStatus(patientId: string) {
    if (this.connected === null) this.statusLoading = true;
    this.error = '';
    try {
      // Google Health status returns wearable_device for all patients
      const { data: ghData } = await apiClient.get(`/google-health/status/${patientId}/`);
      const device = ghData?.wearable_device;
      if (device && ['fitbit', 'omron', 'google_health', 'none'].includes(device)) {
        runInAction(() => {
          this.wearableDevice = device;
        });
      }

      if (device === 'google_health') {
        runInAction(() => {
          this.connected = !!ghData?.connected;
          this.needsReconnect = !!ghData?.needs_reconnect;
          this.daysUntilExpiry = ghData?.days_until_expiry ?? null;
        });
      } else {
        // Fitbit (or omron/none): fall through to Fitbit status for accurate connected state
        try {
          const { data: fbData } = await apiClient.get(`/fitbit/status/${patientId}/`);
          runInAction(() => {
            this.connected = !!fbData?.connected;
            this.needsReconnect = false;
            this.daysUntilExpiry = null;
          });
        } catch {
          runInAction(() => {
            this.connected = false;
          });
        }
      }
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
    const base = this.useGoogleHealth ? 'google-health' : 'fitbit';
    try {
      const { data } = await apiClient.get(`/${base}/summary/${patientId}/`, {
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
    const base = this.useGoogleHealth ? 'google-health' : 'fitbit';
    await apiClient.post(`/${base}/manual_steps/${patientId}/`, { date, steps });
    await this.fetchSummary(patientId, 7, true);
  }

  async disconnect() {
    this.error = '';
    const base = this.useGoogleHealth ? 'google-health' : 'fitbit';
    await apiClient.delete(`/${base}/disconnect/`);
    runInAction(() => {
      this.connected = false;
      this.summary = null;
    });
  }
}

export const patientFitbitStore = new PatientFitbitStore();
