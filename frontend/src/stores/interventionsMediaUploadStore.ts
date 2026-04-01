import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';

export type MediaUploadFileResult = {
  filename: string;
  status: 'ok' | 'error';
  external_id: string | null;
  interventions_updated: string[];
  error?: string;
};

export class InterventionsMediaUploadStore {
  loading = false;
  error = '';
  results: MediaUploadFileResult[] | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  reset() {
    this.loading = false;
    this.error = '';
    this.results = null;
  }

  clearError() {
    this.error = '';
  }

  /**
   * Uploads one or more media files to the batch media import endpoint.
   * POST /api/interventions/import/media/
   * multipart/form-data, key: files[]
   */
  async uploadMedia(files: File[]): Promise<void> {
    if (this.loading) return;

    this.loading = true;
    this.error = '';
    this.results = null;

    try {
      const fd = new FormData();
      for (const file of files) {
        fd.append('files[]', file);
      }

      const res = await apiClient.post('/interventions/import/media/', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      runInAction(() => {
        this.results = (res.data?.results ?? null) as MediaUploadFileResult[] | null;
      });
    } catch (e: any) {
      const backend =
        e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Upload failed.';

      runInAction(() => {
        this.error = String(backend);
        this.results = e?.response?.data?.results ?? null;
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}

export const interventionsMediaUploadStore = new InterventionsMediaUploadStore();
