import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';

export type VideoUploadFileResult = {
  filename: string;
  status: 'ok' | 'error';
  external_id: string | null;
  interventions_updated: string[];
  error?: string;
};

export class InterventionsVideoUploadStore {
  loading = false;
  error = '';
  results: VideoUploadFileResult[] | null = null;

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
   * Uploads one or more .mp4 files to the batch video import endpoint.
   * POST /api/interventions/import/videos/
   * multipart/form-data, key: files[]
   */
  async uploadVideos(files: File[]): Promise<void> {
    if (this.loading) return;

    this.loading = true;
    this.error = '';
    this.results = null;

    try {
      const fd = new FormData();
      for (const file of files) {
        fd.append('files[]', file);
      }

      const res = await apiClient.post('/interventions/import/videos/', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      runInAction(() => {
        this.results = (res.data?.results ?? null) as VideoUploadFileResult[] | null;
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

export const interventionsVideoUploadStore = new InterventionsVideoUploadStore();
