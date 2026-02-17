// src/stores/interventionsImportStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';

export type ImportResult = {
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: Array<{ row?: number; intervention_id?: string; error?: string }>;
  message?: string;
};

export type ImportOptions = {
  sheet_name?: string; // default "Content"
  dry_run?: boolean; // default false
  keep_legacy_fields?: boolean; // default true
  default_lang?: string; // default "en"
  limit?: number | null;
};

export class InterventionsImportStore {
  loading = false;
  error = '';
  result: ImportResult | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  reset() {
    this.loading = false;
    this.error = '';
    this.result = null;
  }

  clearError() {
    this.error = '';
  }

  /**
   * Uploads an Excel (.xlsx / .xlsm) and triggers the import.
   *
   * Backend expectation (recommended):
   * POST /api/interventions/import/
   * multipart/form-data:
   *   - file: <binary>
   *   - sheet_name, dry_run, keep_legacy_fields, default_lang, limit
   */
  async importFromExcel(file: File, opts: ImportOptions = {}) {
    if (this.loading) return;

    this.loading = true;
    this.error = '';
    this.result = null;

    try {
      const fd = new FormData();
      fd.append('file', file);

      // options
      if (opts.sheet_name) fd.append('sheet_name', opts.sheet_name);
      if (typeof opts.dry_run === 'boolean') fd.append('dry_run', String(opts.dry_run));
      if (typeof opts.keep_legacy_fields === 'boolean')
        fd.append('keep_legacy_fields', String(opts.keep_legacy_fields));
      if (opts.default_lang) fd.append('default_lang', opts.default_lang);
      if (typeof opts.limit === 'number') fd.append('limit', String(opts.limit));

      const res = await apiClient.post('/interventions/import/excel', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      runInAction(() => {
        // Accept either {created,updated,...} or {result:{...}}
        this.result = (res.data?.result ?? res.data ?? null) as ImportResult;
      });
    } catch (e: any) {
      const backend =
        e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Import failed.';

      runInAction(() => {
        this.error = String(backend);
        this.result = e?.response?.data?.result ?? null;
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}

export const interventionsImportStore = new InterventionsImportStore();
