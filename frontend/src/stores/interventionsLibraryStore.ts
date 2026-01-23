// src/stores/interventionsLibraryStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';
import type { InterventionTypeTh } from '../types';

export type LibraryMode = 'patient' | 'therapist';

type FetchOptions = {
  mode: LibraryMode;
};

/**
 * Shared store class for both Patient + Therapist libraries.
 *
 * ✅ Why shared?
 * - Same data source ("interventions/all/")
 * - Same basic state: items/loading/error
 * - Different visibility rules (patient hides private)
 *
 * ✅ Why separate instances?
 * - Patient and Therapist can have different visibility + independent loading/error states
 * - Avoids cross-page coupling when both pages are open / navigated quickly
 */
export class InterventionsLibraryStore {
  items: InterventionTypeTh[] = [];
  loading = false;
  error = '';

  // Optional: keep last fetch mode for debug/UI decisions
  lastMode: LibraryMode | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get count() {
    return this.items.length;
  }

  /**
   * Patient should not see private interventions.
   * Therapist can see them (and may also have edit actions elsewhere).
   */
  get visibleItemsForPatient() {
    return this.items.filter((x: any) => !x?.is_private);
  }

  clearError() {
    this.error = '';
  }

  reset() {
    this.items = [];
    this.loading = false;
    this.error = '';
    this.lastMode = null;
  }

  /**
   * Fetches the intervention library.
   * - mode="patient": filters out private items client-side (backend filtering is still recommended).
   * - mode="therapist": shows all returned items.
   */
  async fetchAll({ mode }: FetchOptions) {
    if (this.loading) return;

    this.loading = true;
    this.error = '';
    this.lastMode = mode;

    try {
      const res = await apiClient.get<InterventionTypeTh[]>('interventions/all/');
      const raw = Array.isArray(res.data) ? res.data : [];

      runInAction(() => {
        this.items = raw;
      });
    } catch (e: any) {
      const backend =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        'Failed to fetch interventions.';

      runInAction(() => {
        this.error = String(backend);
        this.items = [];
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}

// ✅ Separate instances so each page can load independently without stepping on each other
export const patientInterventionsLibraryStore = new InterventionsLibraryStore();
export const therapistInterventionsLibraryStore = new InterventionsLibraryStore();
