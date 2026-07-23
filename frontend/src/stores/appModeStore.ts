import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';

type AppMode = 'dev' | 'normal' | 'study';

class AppModeStore {
  mode: AppMode = 'normal';
  redcapVisible: boolean = true;
  loaded: boolean = false;

  constructor() {
    makeAutoObservable(this);
  }

  // ── Derived feature flags ───────────────────────────────────────────────────
  // Use these in components instead of checking `mode` directly.

  /** Manual patient creation (Register Patient button) is available. */
  get showManualCreate(): boolean {
    return this.mode !== 'study';
  }

  /** REDCap import button is available. */
  get showRedcapImport(): boolean {
    return this.mode === 'dev' || this.mode === 'study';
  }

  /** REDCap tab in patient profile popup is shown. */
  get showRedcapTab(): boolean {
    return (this.mode === 'dev' || this.mode === 'study') && this.redcapVisible;
  }

  /** PII fields (name, email, phone, birthdate) are hidden in patient profile. */
  get hidePiiFields(): boolean {
    return this.mode === 'study';
  }

  /** Study group column and filter are shown (study/dev modes only). */
  get showStudyGroup(): boolean {
    return this.mode === 'study' || this.mode === 'dev';
  }

  // ── Data fetching ──────────────────────────────────────────────────────────

  async fetchMode(): Promise<void> {
    try {
      const response = await apiClient.get<{ mode: AppMode; redcapVisible: boolean }>('/app-mode/');
      runInAction(() => {
        const raw = response.data.mode;
        this.mode = ['dev', 'normal', 'study'].includes(raw) ? raw : 'normal';
        this.redcapVisible = response.data.redcapVisible ?? true;
        this.loaded = true;
      });
    } catch {
      // Fall back to 'normal' so the app stays functional if the endpoint is unreachable.
      runInAction(() => {
        this.mode = 'normal';
        this.redcapVisible = true;
        this.loaded = true;
      });
    }
  }
}

export const appModeStore = new AppModeStore();
