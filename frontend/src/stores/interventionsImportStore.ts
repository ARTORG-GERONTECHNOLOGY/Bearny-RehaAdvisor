// src/stores/interventionsImportStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import { t as i18nT } from 'i18next';
import apiClient from '../api/client';
import { getFriendlyApiErrorMessage } from '../utils/apiErrorMessages';

export type ImportResult = {
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: Array<{
    row?: number;
    intervention_id?: string;
    error?: string;
    severity?: 'warning' | 'error';
  }>;
  errors_count?: number;
  warnings?: number;
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
  errorCode = '';
  availableSheets: string[] = [];
  result: ImportResult | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  reset() {
    this.loading = false;
    this.error = '';
    this.errorCode = '';
    this.availableSheets = [];
    this.result = null;
  }

  clearError() {
    this.error = '';
    this.errorCode = '';
    this.availableSheets = [];
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
      const message = getFriendlyApiErrorMessage(e, {
        fallback: i18nT('Import failed. Please try again.'),
        payloadTooLarge: i18nT(
          'The Excel upload is too large for the server to accept. Please choose a file under 50 MB.'
        ),
        network: i18nT(
          'The Excel import could not reach the server. Please check your connection and try again.'
        ),
        timeout: i18nT('The Excel import timed out. Please try again, or import a smaller file.'),
        server: i18nT(
          'The server could not finish the Excel import. Please try again, and contact support if it keeps happening.'
        ),
        unauthorized: i18nT('Your session expired. Please sign in again and retry the import.'),
        forbidden: i18nT('You do not have permission to import interventions.'),
      });

      runInAction(() => {
        this.error = message;
        this.errorCode = e?.response?.data?.error_code || '';
        this.availableSheets = e?.response?.data?.available_sheets || [];
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
