// src/stores/rehabTableStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';
import authStore from './authStore';
import { filterInterventions } from '../utils/filterUtils';
import { translateText } from '../utils/translate';
import config from '../config/config.json';
import type { Intervention } from '../types';

type TitleMap = Record<string, { title: string; lang: string | null }>;
type TypeMap = Record<string, string>;

// -------------------- Typed “unknown-first” helpers (no any) --------------------

type ApiErrorResponseData = {
  message?: unknown;
  error?: unknown;
  detail?: unknown;
  details?: unknown;
  field_errors?: unknown;
  non_field_errors?: unknown;
};

type ApiErrorLike = {
  response?: { data?: ApiErrorResponseData };
  message?: unknown;
};

const toStr = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

const joinArray = (v: unknown): string =>
  Array.isArray(v)
    ? v
        .map((x) => toStr(x))
        .filter(Boolean)
        .join(' ')
    : '';

const fieldErrorsToText = (v: unknown): string => {
  if (!v || typeof v !== 'object') return '';
  return Object.entries(v as Record<string, unknown>)
    .map(([field, msgs]) => {
      if (Array.isArray(msgs)) return msgs.map((m) => `${field}: ${toStr(m)}`).join(' ');
      if (msgs) return `${field}: ${toStr(msgs)}`;
      return '';
    })
    .filter(Boolean)
    .join(' ');
};

export const extractApiError = (e: unknown, fallback: string): string => {
  const err = e as ApiErrorLike;
  const api = err?.response?.data;

  if (!api) return fallback;

  const pieces: string[] = [];

  const msg = toStr(api.message).trim();
  if (msg) pieces.push(msg);

  const nonField = joinArray(api.non_field_errors).trim();
  if (nonField) pieces.push(nonField);

  const fieldText = fieldErrorsToText(api.field_errors).trim();
  if (fieldText) pieces.push(fieldText);

  const apiErr = toStr(api.error).trim();
  if (apiErr) pieces.push(apiErr);

  const details = toStr(api.details ?? api.detail).trim();
  if (details) pieces.push(details);

  const text = pieces.join(' ').trim();
  return text || fallback;
};

// -------------------- Domain types --------------------

type PatientPlan = {
  interventions: Intervention[];
} & Record<string, unknown>;

const EMPTY_PLAN: PatientPlan = { interventions: [] };

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// Some plan/cat fields are not in the shared Intervention type yet (legacy/new model overlap)
type PlanLike = {
  _id?: string;
  id?: string;
  title?: string;
  description?: string;
  content_type?: string;
  link?: string;
  tags?: unknown;
  benefitFor?: unknown;
  preview_img?: string;
  dates?: Array<{ datetime: string }>;
  frequency?: unknown;
  notes?: unknown;
  require_video_feedback?: unknown;
  media_url?: unknown;
  media_file?: unknown;
} & Record<string, unknown>;

// Defaults passed into Repeat modal
type ModifyDefaults = {
  effectiveFrom: string; // YYYY-MM-DD
  frequency: string;
  notes: string;
  require_video_feedback: boolean;
};

const getId = (x: unknown): string => {
  if (!x || typeof x !== 'object') return '';
  const o = x as { _id?: unknown; id?: unknown };
  const v = o._id ?? o.id;
  return typeof v === 'string' ? v : '';
};

const getContentType = (x: unknown): string => {
  if (!x || typeof x !== 'object') return '';
  const o = x as { content_type?: unknown; contentType?: unknown };
  const v = o.content_type ?? o.contentType;
  return typeof v === 'string' ? v : '';
};

const getDates = (x: unknown): Array<{ datetime: string }> => {
  if (!x || typeof x !== 'object') return [];
  const o = x as { dates?: unknown };
  return Array.isArray(o.dates)
    ? o.dates
        .map((d) =>
          d && typeof d === 'object' ? (d as { datetime?: unknown }).datetime : undefined
        )
        .filter((dt): dt is string => typeof dt === 'string')
        .map((dt) => ({ datetime: dt }))
    : [];
};

const isTruthy = (v: unknown): boolean => v === true || v === 'true' || v === 1 || v === '1';

// -------------------- Store --------------------

export class RehabTableStore {
  // ---------------------------------------------------------------------------
  // UI State
  // ---------------------------------------------------------------------------
  loading = true;
  error: string | null = null;

  // Tabs
  topTab: 'interventions' | 'questionnaires' = 'interventions';
  selectedTab: 'patient' | 'all' = 'patient';

  // Patient context
  patientName = '';
  patientUsername = '';
  patientData: PatientPlan = EMPTY_PLAN;

  // Data
  allInterventions: Intervention[] = []; // catalog (includes private if backend adds them)
  recommendations: Intervention[] = [];
  filteredRecommendations: Intervention[] = [];

  // i18n
  userLang = 'en';

  // translations for visible items
  titleMap: TitleMap = {};
  typeMap: TypeMap = {};

  // filters (ALL tab)
  searchTerm = '';
  patientTypeFilter = '';
  contentTypeFilter = '';
  tagFilter: string[] = [];
  benefitForFilter: string[] = [];

  // Selected intervention + modals
  selectedExerciseId: string | null = null;

  showExerciseStats = false;
  showRepeatModal = false;
  showInfoInterventionModal = false;

  showFeedbackBrowser = false;
  feedbackBrowserIntervention: Intervention | null = null;

  repeatMode: 'create' | 'modify' = 'create';
  modifyDefaults: ModifyDefaults | null = null;

  // analytics
  private entryTime = 0;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  // ---------------------------------------------------------------------------
  // Derived / helpers
  // ---------------------------------------------------------------------------
  get patientIdForCalls() {
    return localStorage.getItem('selectedPatient') || this.patientUsername;
  }

  get specialisations(): string[] {
    const raw = authStore.specialisations || [];
    return (raw || []).map((s) => String(s).trim()).filter(Boolean);
  }

  get diagnoses(): string[] {
    const specs = this.specialisations;
    const cfg = config as unknown as {
      patientInfo?: { function?: Record<string, { diagnosis?: unknown }> };
    };
    const fn = cfg?.patientInfo?.function || {};
    return Array.isArray(specs)
      ? specs.flatMap((spec) => {
          const dx = fn?.[spec]?.diagnosis;
          return Array.isArray(dx) ? dx.map(String) : [];
        })
      : [];
  }

  /**
   * Therapist rehab-plan endpoint returns schedule + notes, but NOT media/description.
   * We merge plan items with catalog details so the info popup can show media/desc again.
   */
  private mergePlanWithCatalog(plan: PatientPlan, catalog: Intervention[]): PatientPlan {
    const catalogMap = new Map<string, Intervention>();
    for (const it of catalog || []) catalogMap.set(it._id, it);

    const merged: Intervention[] = (plan?.interventions || []).map((p0) => {
      const p = (p0 as unknown as PlanLike) || {};
      const full = catalogMap.get((p._id as string) || '') as unknown as PlanLike | undefined;

      // keep schedule fields from plan (dates/notes/frequency/etc)
      // keep media/desc/etc from catalog if plan doesn't have it
      const out: PlanLike = {
        ...(full || {}),
        ...(p || {}),
        title:
          (typeof p.title === 'string' && p.title) ||
          (typeof full?.title === 'string' ? full.title : '') ||
          '',
        description:
          (typeof p.description === 'string' && p.description) ||
          (typeof full?.description === 'string' ? full.description : '') ||
          '',
        media_url:
          (typeof p.media_url === 'string' && p.media_url) ||
          (typeof full?.media_url === 'string' ? full.media_url : '') ||
          (typeof full?.media_file === 'string' ? full.media_file : '') ||
          '',
        media_file:
          (typeof p.media_file === 'string' && p.media_file) ||
          (typeof full?.media_file === 'string' ? full.media_file : '') ||
          '',
        link:
          (typeof p.link === 'string' && p.link) ||
          (typeof full?.link === 'string' ? full.link : '') ||
          '',
        tags: (Array.isArray(p.tags) && p.tags) || (Array.isArray(full?.tags) ? full.tags : []),
        benefitFor:
          (Array.isArray(p.benefitFor) && p.benefitFor) ||
          (Array.isArray(full?.benefitFor) ? full.benefitFor : []),
        content_type:
          (typeof p.content_type === 'string' && p.content_type) ||
          (typeof full?.content_type === 'string' ? full.content_type : '') ||
          '',
        preview_img:
          (typeof p.preview_img === 'string' && p.preview_img) ||
          (typeof full?.preview_img === 'string' ? full.preview_img : '') ||
          '',
      };

      // Cast back to Intervention for the rest of the app. (We keep extra fields too.)
      return out as unknown as Intervention;
    });

    return { ...(plan || {}), interventions: merged };
  }

  private hasFutureDates(interventionId: string) {
    const planItem = (this.patientData?.interventions || []).find(
      (i) => i._id === interventionId
    ) as unknown;
    const dates = getDates(planItem);
    return dates.some((d) => new Date(d.datetime) > new Date());
  }

  get patientAssignedItems(): Intervention[] {
    const ids = new Set((this.patientData?.interventions || []).map((x) => x._id));
    return (this.allInterventions || []).filter((it) => ids.has(it._id));
  }

  get activePatientItems(): Intervention[] {
    const ids = new Set((this.patientData?.interventions || []).map((x) => x._id));
    const items = (this.allInterventions || []).filter((it) => ids.has(it._id));
    return items.filter((it) => this.hasFutureDates(it._id));
  }

  get pastPatientItems(): Intervention[] {
    const ids = new Set((this.patientData?.interventions || []).map((x) => x._id));
    const items = (this.allInterventions || []).filter((it) => ids.has(it._id));
    return items.filter((it) => !this.hasFutureDates(it._id));
  }

  get selectedExerciseFromPlan(): Intervention | null {
    if (!this.selectedExerciseId) return null;

    const planItem = (this.patientData?.interventions || []).find(
      (x) => x._id === this.selectedExerciseId
    );
    if (planItem) return planItem;

    return (this.allInterventions || []).find((x) => x._id === this.selectedExerciseId) || null;
  }

  get selectedAssignment(): Intervention | null {
    if (!this.selectedExerciseId) return null;
    return (
      (this.patientData?.interventions || []).find((x) => x._id === this.selectedExerciseId) || null
    );
  }

  // ---------------------------------------------------------------------------
  // Simple setters (needed by LeftPanel controlled inputs)
  // ---------------------------------------------------------------------------
  setUserLang(lang: string) {
    this.userLang = lang || 'en';
  }

  setError(v: string | null) {
    this.error = v;
  }

  setTopTab(v: 'interventions' | 'questionnaires') {
    this.topTab = v;
  }

  setSelectedTab(v: 'patient' | 'all') {
    this.selectedTab = v;
    if (v === 'all') this.applyAllFilters();
  }

  setSearchTerm(v: string) {
    this.searchTerm = v;
    this.applyAllFilters();
  }
  setPatientTypeFilter(v: string) {
    this.patientTypeFilter = v;
    this.applyAllFilters();
  }
  setContentTypeFilter(v: string) {
    this.contentTypeFilter = v;
    this.applyAllFilters();
  }
  setTagFilter(v: string[]) {
    this.tagFilter = Array.isArray(v) ? v : [];
    this.applyAllFilters();
  }
  setBenefitForFilter(v: string[]) {
    this.benefitForFilter = Array.isArray(v) ? v : [];
    this.applyAllFilters();
  }

  resetAllFilters() {
    this.searchTerm = '';
    this.patientTypeFilter = '';
    this.contentTypeFilter = '';
    this.tagFilter = [];
    this.benefitForFilter = [];
    this.applyAllFilters();
  }

  // ---------------------------------------------------------------------------
  // Init / cleanup
  // ---------------------------------------------------------------------------
  async init(navigate: (path: string) => void, t: (k: string) => unknown) {
    this.entryTime = Date.now();

    await authStore.checkAuthentication();
    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
      return;
    }

    const sel = localStorage.getItem('selectedPatient');
    if (!sel) {
      runInAction(() => {
        this.loading = false;
        this.error =
          typeof t === 'function' ? String(t('No patient selected.')) : 'No patient selected.';
      });
      return;
    }

    runInAction(() => {
      this.patientUsername = sel;
      this.patientName = localStorage.getItem('selectedPatientName') || sel;
      this.loading = true;
      this.error = null;
    });

    await Promise.allSettled([this.fetchAll(t), this.fetchInts(t)]);

    runInAction(() => {
      this.patientData = this.mergePlanWithCatalog(this.patientData, this.allInterventions);
      this.loading = false;
    });

    await this.translateVisibleItems(this.userLang);
  }

  async dispose() {
    const exitTime = Date.now();
    const durationMin = ((exitTime - this.entryTime) / 60000).toFixed(2);
    const patient = localStorage.getItem('selectedPatient');
    const therapist = authStore?.id || 'unknown';

    try {
      await apiClient.post('/analytics/log', {
        userAgent: 'Therapist',
        user: therapist,
        patient,
        action: 'REHATABLE',
        started: new Date(this.entryTime).toISOString(),
        ended: new Date(exitTime).toISOString(),
        details: `Viewed ${patient} rehabilitation plan for ${durationMin} minutes`,
      });
    } catch {
      // ignore
    }
  }

  // ---------------------------------------------------------------------------
  // Data loading (✅ correct backend URLs)
  // ---------------------------------------------------------------------------
  async fetchAll(t: (k: string) => unknown) {
    try {
      const pid = this.patientIdForCalls;

      // /api/patients/rehabilitation-plan/therapist/<patient_id>/
      const res = await apiClient.get(`patients/rehabilitation-plan/therapist/${pid}/`);
      const raw = (res.data ?? {}) as Record<string, unknown>;

      const success = raw.success;
      const message = raw.message;

      if (success === false && typeof message === 'string' && !raw.interventions) {
        runInAction(() => {
          this.patientData = EMPTY_PLAN;
          this.error = message;
        });
        return;
      }

      const interventions = Array.isArray(raw.interventions)
        ? (raw.interventions as Intervention[])
        : [];
      runInAction(() => {
        this.patientData = { ...raw, interventions } as PatientPlan;
      });

      if (this.allInterventions?.length) {
        runInAction(() => {
          this.patientData = this.mergePlanWithCatalog(this.patientData, this.allInterventions);
        });
      }
    } catch (e: unknown) {
      const msg = extractApiError(
        e,
        typeof t === 'function'
          ? String(t('Error loading patients interventions. Reload the page or try again later.'))
          : 'Error loading patients interventions. Reload the page or try again later.'
      );
      runInAction(() => {
        this.patientData = EMPTY_PLAN;
        this.error = msg;
      });
    }
  }

  async fetchInts(t: (k: string) => unknown) {
    try {
      const pid = this.patientIdForCalls;

      // /api/interventions/all/<patient_id>/
      const res = await apiClient.get(`interventions/all/${pid}/`);
      const data = res.data as unknown;

      const list: Intervention[] = Array.isArray(data)
        ? (data as Intervention[])
        : data &&
            typeof data === 'object' &&
            Array.isArray((data as { interventions?: unknown }).interventions)
          ? ((data as { interventions: Intervention[] }).interventions as Intervention[])
          : [];

      const uniq = new Map<string, Intervention>();
      (list || []).forEach((x) => uniq.set(x._id, x));
      const arr = [...uniq.values()];

      runInAction(() => {
        this.allInterventions = arr;
        this.recommendations = arr;
        this.filteredRecommendations = arr;
      });

      this.applyAllFilters();

      if (this.patientData?.interventions?.length) {
        runInAction(() => {
          this.patientData = this.mergePlanWithCatalog(this.patientData, this.allInterventions);
        });
      }
    } catch (e: unknown) {
      const msg = extractApiError(
        e,
        typeof t === 'function'
          ? String(t('Error loading interventions. Reload the page or try again later.'))
          : 'Error loading interventions.'
      );
      runInAction(() => {
        this.error = msg;
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Filters (ALL tab)
  // ---------------------------------------------------------------------------
  applyAllFilters() {
    const filtered = filterInterventions(this.recommendations, this.titleMap, {
      patientTypeFilter: this.patientTypeFilter,
      contentTypeFilter: this.contentTypeFilter,
      tagFilter: this.tagFilter,
      benefitForFilter: this.benefitForFilter,
      searchTerm: this.searchTerm,
    });
    this.filteredRecommendations = filtered;
  }

  // ---------------------------------------------------------------------------
  // Translations for left list (only the currently visible items)
  // ---------------------------------------------------------------------------
  async translateVisibleItems(userLang: string) {
    const items: Intervention[] =
      this.selectedTab === 'patient'
        ? this.patientData?.interventions || []
        : this.filteredRecommendations || [];

    if (!items.length) {
      runInAction(() => {
        this.titleMap = {};
        this.typeMap = {};
      });
      return;
    }

    const newTitles: TitleMap = {};
    await Promise.all(
      items.map(async (rec) => {
        const id = rec._id;
        const title = rec.title;

        try {
          const { translatedText, detectedSourceLanguage } = await translateText(title, userLang);
          newTitles[id] = {
            title: translatedText || title,
            lang: detectedSourceLanguage || null,
          };
        } catch {
          newTitles[id] = { title, lang: null };
        }
      })
    );

    const newTypes: TypeMap = {};
    await Promise.all(
      items.map(async (rec) => {
        const id = rec._id;
        const label = capitalize(getContentType(rec));
        try {
          const { translatedText } = await translateText(label, userLang);
          newTypes[id] = translatedText || label;
        } catch {
          newTypes[id] = label;
        }
      })
    );

    runInAction(() => {
      this.titleMap = newTitles;
      this.typeMap = newTypes;
    });
  }

  // ---------------------------------------------------------------------------
  // Modal open/close + click handlers (accept unknown, extract id safely)
  // ---------------------------------------------------------------------------
  private setSelected(intervention: unknown) {
    const id = getId(intervention);
    this.selectedExerciseId = id || null;
  }

  handleExerciseClick(intervention: unknown) {
    this.setSelected(intervention);
    this.showInfoInterventionModal = true;
  }

  closeInfoModal() {
    this.showInfoInterventionModal = false;
  }

  showStats(intervention: unknown) {
    this.setSelected(intervention);
    this.showExerciseStats = true;
  }

  closeStatsModal() {
    this.showExerciseStats = false;
  }

  openFeedbackBrowser(intervention: unknown) {
    this.setSelected(intervention);

    // use merged plan item if possible (dates + feedback are there)
    const planItem = this.selectedExerciseFromPlan || null;
    this.feedbackBrowserIntervention = planItem || (intervention as Intervention);
    this.showFeedbackBrowser = true;
  }

  closeFeedbackBrowser() {
    this.showFeedbackBrowser = false;
    this.feedbackBrowserIntervention = null;
  }

  openAddIntervention(intervention: unknown) {
    this.repeatMode = 'create';
    this.setSelected(intervention);
    this.modifyDefaults = null;
    this.showRepeatModal = true;
  }

  openModifyIntervention(intervention: unknown) {
    this.repeatMode = 'modify';
    this.setSelected(intervention);

    const assigned = this.selectedAssignment as unknown;
    const dates = getDates(assigned)
      .map((d) => new Date(d.datetime))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    const now = new Date();
    const next = dates.find((d) => d > now);

    const freqRaw =
      assigned && typeof assigned === 'object'
        ? (assigned as { frequency?: unknown }).frequency
        : undefined;
    const notesRaw =
      assigned && typeof assigned === 'object'
        ? (assigned as { notes?: unknown }).notes
        : undefined;
    const rvfRaw =
      assigned && typeof assigned === 'object'
        ? (assigned as { require_video_feedback?: unknown }).require_video_feedback
        : undefined;

    this.modifyDefaults = {
      effectiveFrom: (next ? next : new Date(Date.now() + 86400000)).toISOString().slice(0, 10),
      frequency: typeof freqRaw === 'string' ? freqRaw : toStr(freqRaw),
      notes: typeof notesRaw === 'string' ? notesRaw : toStr(notesRaw),
      require_video_feedback: isTruthy(rvfRaw),
    };

    this.showRepeatModal = true;
  }

  closeRepeatModal() {
    this.showRepeatModal = false;
  }

  async deleteExercise(interventionId: string, t: (k: string) => unknown) {
    try {
      // POST /api/interventions/remove-from-patient/
      const res = await apiClient.post('interventions/remove-from-patient/', {
        patientId: this.patientIdForCalls,
        intervention: interventionId,
      });

      if (res.status === 200 || res.status === 201) {
        await Promise.all([this.fetchAll(t), this.fetchInts(t)]);
        runInAction(() => {
          this.patientData = this.mergePlanWithCatalog(this.patientData, this.allInterventions);
        });
        await this.translateVisibleItems(this.userLang);
      }
    } catch (err: unknown) {
      const msg = extractApiError(
        err,
        typeof t === 'function'
          ? String(t('Failed to delete the intervention. Try again now or later.'))
          : 'Failed to delete.'
      );
      runInAction(() => {
        this.error = msg;
      });
    }
  }
}
