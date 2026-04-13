// src/stores/interventionsLibraryStore.ts
import { makeAutoObservable, reaction, runInAction } from 'mobx';
import apiClient from '@/api/client';
import { SessionCache } from '@/utils/sessionCache';
import type { InterventionTypeTh } from '@/types';

export type LibraryMode = 'patient' | 'therapist';

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

type UnknownRec = Record<string, unknown>;

const isRecord = (v: unknown): v is UnknownRec => typeof v === 'object' && v !== null;

const asString = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

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

const normalizeIntervention = (raw: unknown): UnknownRec => {
  if (!isRecord(raw)) return {};

  // clone as UnknownRec
  const n: UnknownRec = { ...raw };

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

  return n;
};

export class InterventionsLibraryStore {
  items: InterventionTypeTh[] = [];
  loading = false;
  error = '';

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
      // axios-like error shape without `any`
      const msg =
        isRecord(e) && isRecord(e.response) && isRecord(e.response.data)
          ? asString(
              e.response.data.message ??
                e.response.data.error ??
                e.response.data.detail ??
                e.message,
              'Failed to fetch interventions.'
            )
          : isRecord(e)
            ? asString(e.message, 'Failed to fetch interventions.')
            : 'Failed to fetch interventions.';

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
