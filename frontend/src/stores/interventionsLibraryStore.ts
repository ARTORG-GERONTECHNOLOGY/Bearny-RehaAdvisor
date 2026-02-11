// src/stores/interventionsLibraryStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';
import type { InterventionTypeTh } from '../types';

export type LibraryMode = 'patient' | 'therapist';

type FetchOptions = {
  mode: LibraryMode;

  /**
   * Optional: if your backend supports "patient_id" to include private interventions
   * (per your previous requirement: list_all_interventions(patientId) includes that patient's private items)
   */
  patientId?: string;

  /**
   * Optional: if backend supports filtering.
   * If not supported, store will still do client-side filtering.
   */
  includePrivate?: boolean;
};

/**
 * Robustly normalize different backend response shapes:
 * - array
 * - { data: [...] }
 * - { results: [...] }
 */
const normalizeList = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
};

/**
 * Try multiple "private" flags because your API has used both in places:
 * - is_private (snake)
 * - isPrivate (camel)
 */
const isPrivate = (x: any) => Boolean(x?.is_private ?? x?.isPrivate);

/**
 * Normalize intervention object to match new model fields while keeping backwards compatibility.
 * This prevents UI breaks when some endpoints still return legacy keys.
 */
const normalizeIntervention = (raw: any): any => {
  if (!raw || typeof raw !== 'object') return raw;

  const n: any = { ...raw };

  // unify id
  n.id = n.id ?? n._id ?? n.pk;

  // unify private flag
  n.is_private = n.is_private ?? n.isPrivate ?? false;

  // unify content type key variations (your FE submits "contentType")
  n.content_type = n.content_type ?? n.contentType ?? n.type ?? '';

  // unify language key variations (your FE submits "language")
  n.language = n.language ?? n.lang ?? 'en';

  // unify external id naming (your FE submits "external_id")
  n.external_id = n.external_id ?? n.externalId ?? '';

  // unify provider (already consistent but just in case)
  n.provider = n.provider ?? n.source ?? '';

  // unify media: ensure array
  n.media = Array.isArray(n.media) ? n.media : Array.isArray(n.media_items) ? n.media_items : [];

  // unify preview image field variations (img / image)
  n.img_url = n.img_url ?? n.image_url ?? n.preview_image_url ?? n.img ?? '';

  // unify patient targeting (public)
  n.patientTypes = n.patientTypes ?? n.patient_types ?? [];

  // unify taxonomy (optional new field)
  n.taxonomy = n.taxonomy ?? null;

  return n;
};

/**
 * Shared store class for Patient + Therapist libraries.
 *
 * ✅ Updated for new model + resilient response parsing + normalization.
 * ✅ Supports optional patientId param so therapist can request private interventions for a specific patient.
 */
export class InterventionsLibraryStore {
  items: InterventionTypeTh[] = [];
  loading = false;
  error = '';

  lastMode: LibraryMode | null = null;

  // Optional: track last fetch args (useful for refresh buttons)
  lastFetch: FetchOptions | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get count() {
    return this.items.length;
  }

  /**
   * Patient should not see private interventions.
   * Therapist sees all.
   */
  get visibleItemsForPatient() {
    return (this.items as any[]).filter((x) => !isPrivate(x));
  }

  get visibleItemsForTherapist() {
    return this.items;
  }

  clearError() {
    this.error = '';
  }

  reset() {
    this.items = [];
    this.loading = false;
    this.error = '';
    this.lastMode = null;
    this.lastFetch = null;
  }

  /**
   * Fetch the intervention library.
   *
   * Backend expectations (supports any subset):
   * - GET interventions/all/
   * - Optional query params:
   *   - patientId (or patient_id) to include that patient's private interventions
   *   - includePrivate to include private interventions (therapist mode)
   *
   * Client-side behavior:
   * - Always normalizes returned items to the "new model" shape used by the FE.
   * - Patient mode filters private items out client-side, regardless of backend.
   */
  async fetchAll(opts: FetchOptions) {
    const { mode, patientId, includePrivate } = opts;

    if (this.loading) return;

    this.loading = true;
    this.error = '';
    this.lastMode = mode;
    this.lastFetch = opts;

    try {
      // query params (only if provided)
      const params: Record<string, any> = {};
      if (patientId) {
        // support either param name depending on backend
        params.patientId = patientId;
      }
      if (typeof includePrivate === 'boolean') {
        params.includePrivate = includePrivate;
      }

      const res = await apiClient.get('interventions/all/', { params });

      const rawList = normalizeList(res.data);
      const normalized = rawList.map(normalizeIntervention) as InterventionTypeTh[];

      runInAction(() => {
        // patient mode: hide private
        this.items =
          mode === 'patient'
            ? (normalized as any[]).filter((x) => !isPrivate(x)) as InterventionTypeTh[]
            : normalized;
      });
    } catch (e: any) {
      const backend =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.response?.data?.detail ||
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

  /**
   * Convenience refresh using last fetch options (if available).
   */
  async refresh() {
    if (!this.lastFetch) return;
    return this.fetchAll(this.lastFetch);
  }
}

// Separate instances so each page can load independently
export const patientInterventionsLibraryStore = new InterventionsLibraryStore();
export const therapistInterventionsLibraryStore = new InterventionsLibraryStore();
