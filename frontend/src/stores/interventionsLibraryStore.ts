// src/stores/interventionsLibraryStore.ts
import { makeAutoObservable, reaction, runInAction } from 'mobx';
import apiClient from '@/api/client';
import { SessionCache } from '@/utils/sessionCache';
import { getApiErrorMessage } from '@/utils/apiErrorMessages';
import { isRecord, asString, type UnknownRecord } from '@/utils/typeGuards';
import type { InterventionTypeTh } from '@/types';

export type LibraryMode = 'patient' | 'therapist';

// What the patient has done with library items, keyed by external_id (or _id when there is none).
export type LibraryStatus = {
  completed: string[];
  viewed: string[];
  last_completed: Record<string, string>; // ref -> YYYY-MM-DD of the latest completion, library or plan
  last_library_completed: Record<string, string>; // ref -> YYYY-MM-DD of the latest library completion
};

const EMPTY_STATUS: LibraryStatus = {
  completed: [],
  viewed: [],
  last_completed: {},
  last_library_completed: {},
};

const asDayMap = (v: unknown): Record<string, string> =>
  isRecord(v) ? Object.fromEntries(Object.entries(v).map(([k, d]) => [k, asString(d, '')])) : {};

const asStringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => asString(x)).filter(Boolean) : [];

export const libraryRef = (item: unknown): string => {
  if (!isRecord(item)) return '';
  return asString(item.external_id, '') || asString(item._id ?? item.id, '');
};

// Built once per status, so each card is a set lookup. Completed wins over viewed: the backend lists an
// item in at most one, but a stale cache could hold both.
export const libraryStatusLookup = (status: LibraryStatus) => {
  const completed = new Set(status.completed);
  const viewed = new Set(status.viewed);
  return (item: unknown): 'completed' | 'viewed' | null => {
    const ref = libraryRef(item);
    if (!ref) return null;
    if (completed.has(ref)) return 'completed';
    if (viewed.has(ref)) return 'viewed';
    return null;
  };
};

type FetchOptions = {
  mode: LibraryMode;

  /**
   * If provided, backend can include that patient's private interventions.
   * Your backend route may be:
   *  - /api/interventions/all/<patient_id>/?lang=de
   * or still:
   *  - /api/interventions/all/?patientId=...
   */
  patientId?: string;

  /**
   * Optional: if backend supports filtering. If not, store still filters client-side.
   */
  includePrivate?: boolean;

  /**
   * Language preference used for "best variant" selection (grouped by external_id)
   */
  lang?: string;
};

const normalizeList = (data: unknown): unknown[] => {
  if (Array.isArray(data)) return data;
  if (isRecord(data)) {
    const d = data.data;
    if (Array.isArray(d)) return d;
    const r = data.results;
    if (Array.isArray(r)) return r;
  }
  return [];
};

const isPrivate = (x: unknown): boolean => {
  if (!isRecord(x)) return false;
  const v = x.is_private ?? x.isPrivate;
  return Boolean(v);
};

const normalizeIntervention = (raw: unknown): UnknownRecord => {
  if (!isRecord(raw)) return {};

  // clone as UnknownRecord
  const n: UnknownRecord = { ...raw };

  // unify id
  const id = n.id ?? n._id ?? n.pk;
  if (typeof id === 'string' || typeof id === 'number') n.id = String(id);

  // unify private flag
  n.is_private = Boolean(n.is_private ?? n.isPrivate ?? false);

  // unify content type variations
  n.content_type = asString(n.content_type ?? n.contentType ?? n.type, '').toLowerCase();

  // language + external id + provider
  n.language = asString(n.language ?? n.lang, 'en');
  n.external_id = asString(n.external_id ?? n.externalId, '');
  n.provider = asString(n.provider ?? n.source, '');

  // available languages list for globe hint + modal buttons
  const al = n.available_languages;
  const al2 = n.availableLanguages;
  n.available_languages = Array.isArray(al)
    ? al.map((x) => asString(x)).filter(Boolean)
    : Array.isArray(al2)
      ? al2.map((x) => asString(x)).filter(Boolean)
      : [];

  // aims/tags split (backend sends these now)
  const aims = n.aims;
  const aim = n.aim;
  n.aims = Array.isArray(aims)
    ? aims.map((x) => asString(x)).filter(Boolean)
    : Array.isArray(aim)
      ? aim.map((x) => asString(x)).filter(Boolean)
      : typeof aim === 'string' && aim.trim()
        ? [aim.trim()]
        : [];

  n.tags = Array.isArray(n.tags) ? n.tags.map((x) => asString(x)).filter(Boolean) : [];

  // media always array
  const media = n.media;
  const mediaItems = n.media_items;
  n.media = Array.isArray(media) ? media : Array.isArray(mediaItems) ? mediaItems : [];

  // preview image variations
  n.preview_img = asString(
    n.preview_img ??
      n.previewImage ??
      n.preview_image ??
      n.preview_image_url ??
      n.img_url ??
      n.image_url ??
      n.img,
    ''
  );

  // patient targeting
  n.patient_types = Array.isArray(n.patient_types)
    ? n.patient_types
    : Array.isArray(n.patientTypes)
      ? n.patientTypes
      : [];

  // keep where/setting (backend sends these now)
  n.where = Array.isArray(n.where) ? n.where : [];
  n.setting = Array.isArray(n.setting) ? n.setting : [];

  // star rating aggregation from backend
  n.avg_rating = typeof (n as any).avg_rating === 'number' ? (n as any).avg_rating : null;
  n.rating_count = typeof (n as any).rating_count === 'number' ? (n as any).rating_count : 0;

  return n;
};

export class InterventionsLibraryStore {
  items: InterventionTypeTh[] = [];
  loading = false;
  error = '';
  status: LibraryStatus = EMPTY_STATUS;
  private statusPatientId = '';
  private statusRequest = 0;

  lastMode: LibraryMode | null = null;
  lastFetch: FetchOptions | null = null;

  private cache: SessionCache;

  constructor(storageKey: string) {
    this.cache = new SessionCache(storageKey);
    makeAutoObservable(this, {}, { autoBind: true });
    this.loadFromSessionStorage();

    reaction(
      () => this.items,
      () => {
        this.saveToSessionStorage();
      }
    );
  }

  saveToSessionStorage() {
    this.cache.set('items', this.items);
  }

  loadFromSessionStorage() {
    const items = this.cache.get<InterventionTypeTh[]>('items');
    if (items) {
      this.items = items;
    }
  }

  get count() {
    return this.items.length;
  }

  get visibleItemsForPatient() {
    // no `any`: filter via unknown guard
    return this.items.filter((x) => !isPrivate(x));
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
    this.status = EMPTY_STATUS;
    this.statusPatientId = '';
  }

  lastCompletedOf(item: unknown): string | null {
    return this.status.last_completed[libraryRef(item)] || null;
  }

  lastLibraryCompletedOf(item: unknown): string | null {
    return this.status.last_library_completed[libraryRef(item)] || null;
  }

  async fetchStatus(patientId: string) {
    const request = ++this.statusRequest;
    // Stores outlive a logout, so the previous patient's status never shows while this one loads.
    if (patientId !== this.statusPatientId) {
      this.status = EMPTY_STATUS;
      this.statusPatientId = patientId;
    }
    try {
      const res = await apiClient.get(`patients/library-status/${patientId}/`);
      // A slower, older response must not overwrite a newer one (e.g. the reload after a tap).
      if (request !== this.statusRequest) return;
      const data = isRecord(res.data) ? res.data : {};
      runInAction(() => {
        this.status = {
          completed: asStringList(data.completed),
          viewed: asStringList(data.viewed),
          last_completed: asDayMap(data.last_completed),
          last_library_completed: asDayMap(data.last_library_completed),
        };
      });
    } catch {
      // Status is decoration on the list; the library stays usable without it.
    }
  }

  // Completes or un-completes a library item for one day, apart from the plan.
  async setLibraryCompleted(
    patientId: string,
    interventionId: string,
    dateKey: string,
    completed: boolean
  ) {
    await apiClient.post(completed ? 'interventions/complete/' : 'interventions/uncomplete/', {
      patient_id: patientId,
      intervention_id: interventionId,
      date: dateKey,
      source: 'library',
    });
    await this.fetchStatus(patientId);
  }

  /**
   * Updated to match new backend behavior:
   * - supports ?lang=xx which backend uses to pick best variant per external_id
   * - supports private items by route /all/<patientId>/ when provided (preferred)
   */
  async fetchAll(opts: FetchOptions) {
    const { mode, patientId, includePrivate, lang } = opts;
    if (this.loading) return;

    if (!this.items.length) this.loading = true;
    this.error = '';
    this.lastMode = mode;
    this.lastFetch = opts;

    try {
      const params: Record<string, string | boolean> = {};
      if (lang) params.lang = lang;
      if (typeof includePrivate === 'boolean') params.includePrivate = includePrivate;

      const endpoint = patientId ? `interventions/all/${patientId}/` : 'interventions/all/';
      const res = await apiClient.get(endpoint, { params });

      const rawList = normalizeList(res.data);
      const normalized = rawList.map(normalizeIntervention) as unknown[];

      // Cast to your app type after normalization; if the backend changes,
      // you still won’t have `any` leaking through this file.
      const asTyped = normalized as InterventionTypeTh[];

      runInAction(() => {
        this.items = mode === 'patient' ? asTyped.filter((x) => !isPrivate(x)) : asTyped;
      });
    } catch (e: unknown) {
      const msg = getApiErrorMessage(e, 'Failed to fetch interventions.');

      runInAction(() => {
        this.error = msg;
        this.items = [];
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async refresh() {
    if (!this.lastFetch) return;
    return this.fetchAll(this.lastFetch);
  }
}

export const patientInterventionsLibraryStore = new InterventionsLibraryStore(
  'patientInterventionsLibraryStore'
);
export const therapistInterventionsLibraryStore = new InterventionsLibraryStore(
  'therapistInterventionsLibraryStore'
);
