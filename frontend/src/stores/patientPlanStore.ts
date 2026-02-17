// src/stores/patientPlanStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';

export class PatientPlanStore {
  items: any[] = [];
  loading = false;
  error: string | null = null;

  private loadedForPatientId: string | null = null;
  private loadedAt: number | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get isLoaded() {
    return !!this.loadedAt;
  }

  async ensureLoaded(patientId: string, opts?: { force?: boolean }) {
    const force = !!opts?.force;

    // ✅ cache: don’t refetch if already loaded for this patient
    if (!force && this.loadedForPatientId === patientId && this.isLoaded) return;

    this.loading = true;
    this.error = null;

    try {
      const { data } = await apiClient.get(`/patients/rehabilitation-plan/patient/${patientId}/`);

      runInAction(() => {
        this.items = Array.isArray(data) ? data : [];
        this.loadedForPatientId = patientId;
        this.loadedAt = Date.now();
      });
    } catch (e: any) {
      runInAction(() => {
        this.error = e?.response?.data?.error || e?.message || 'Failed to load plan';
        this.items = [];
        this.loadedForPatientId = patientId;
        this.loadedAt = null;
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  // Optional: manual refresh button
  async refresh(patientId: string) {
    return this.ensureLoaded(patientId, { force: true });
  }
}
