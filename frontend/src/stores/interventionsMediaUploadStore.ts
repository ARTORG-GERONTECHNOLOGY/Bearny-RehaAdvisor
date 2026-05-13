import { makeAutoObservable, runInAction } from 'mobx';
import { t as i18nT } from 'i18next';
import apiClient from '../api/client';
import { getFriendlyApiErrorMessage } from '../utils/apiErrorMessages';

export const MAX_MEDIA_UPLOAD_BATCH_BYTES = 1000 * 1024 * 1024;
export const MAX_MEDIA_UPLOAD_BATCH_MB = Math.floor(MAX_MEDIA_UPLOAD_BATCH_BYTES / (1024 * 1024));

export type MediaUploadFileResult = {
  filename: string;
  status: 'ok' | 'error';
  external_id: string | null;
  interventions_updated: string[];
  error?: string;
};

export function splitFilesIntoUploadBatches(
  files: File[],
  maxBatchBytes = MAX_MEDIA_UPLOAD_BATCH_BYTES
): File[][] {
  const batches: File[][] = [];
  let currentBatch: File[] = [];
  let currentBytes = 0;

  for (const file of files) {
    const fileBytes = Number(file.size) || 0;
    if (currentBatch.length > 0 && currentBytes + fileBytes > maxBatchBytes) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBytes = 0;
    }

    currentBatch.push(file);
    currentBytes += fileBytes;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

function fileTooLargeResult(file: File): MediaUploadFileResult {
  return {
    filename: file.name,
    status: 'error',
    external_id: null,
    interventions_updated: [],
    error: i18nT('This file is too large to upload. Maximum allowed size is {{maxSize}} MB.', {
      maxSize: MAX_MEDIA_UPLOAD_BATCH_MB,
    }),
  };
}

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
    const allResults: MediaUploadFileResult[] = [];

    try {
      const uploadableFiles = files.filter((file) => file.size <= MAX_MEDIA_UPLOAD_BATCH_BYTES);
      const skippedResults = files
        .filter((file) => file.size > MAX_MEDIA_UPLOAD_BATCH_BYTES)
        .map(fileTooLargeResult);
      const batches = splitFilesIntoUploadBatches(uploadableFiles);
      allResults.push(...skippedResults);

      for (const batch of batches) {
        const fd = new FormData();
        for (const file of batch) {
          fd.append('files[]', file);
        }

        const res = await apiClient.post('/interventions/import/media/', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        allResults.push(...((res.data?.results ?? []) as MediaUploadFileResult[]));
      }

      runInAction(() => {
        this.results = allResults.length > 0 ? allResults : null;
      });
    } catch (e: any) {
      const message = getFriendlyApiErrorMessage(e, {
        fallback: i18nT('Upload failed. Please try again.'),
        payloadTooLarge: i18nT(
          'The upload is too large for the server to accept. Files are uploaded in smaller batches automatically, but one file or batch still exceeded the limit. Please remove files over 1000 MB and try again.'
        ),
        network: i18nT(
          'The upload could not reach the server. Please check your connection and try again.'
        ),
        timeout: i18nT(
          'The upload timed out. Please try again with fewer files or a more stable connection.'
        ),
        server: i18nT(
          'The server could not finish the upload. Please try again, and contact support if it keeps happening.'
        ),
        unauthorized: i18nT('Your session expired. Please sign in again and retry the upload.'),
        forbidden: i18nT('You do not have permission to upload intervention media.'),
      });

      runInAction(() => {
        this.error = message;
        this.results = e?.response?.data?.results ?? (allResults.length > 0 ? allResults : null);
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}

export const interventionsMediaUploadStore = new InterventionsMediaUploadStore();
