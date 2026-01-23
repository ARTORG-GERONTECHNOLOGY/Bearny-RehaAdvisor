import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';
import authStore from './authStore';
import { filterInterventions } from '../utils/filterUtils';
import { translateText } from '../utils/translate';
import config from '../config/config.json';
import type { Intervention } from '../types';

type TitleMap = Record<string, { title: string; lang: string | null }>;
type TypeMap = Record<string, string>;

type PatientPlan = { interventions: Intervention[] } & Record<string, any>;
const EMPTY_PLAN: PatientPlan = { interventions: [] };

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

export const extractApiError = (e: any, fallback: string): string => {
  const api = e?.response?.data;
  if (!api) return fallback;

  const pieces: string[] = [];
  if (typeof api.message === 'string' && api.message.trim()) pieces.push(api.message.trim());
  if (Array.isArray(api.non_field_errors)) pieces.push(...api.non_field_errors.map((x: any) => String(x)));

  if (api.field_errors && typeof api.field_errors === 'object') {
    ObjectObject.entries(api.field_errors).forEach(([field, msgs]) => {
      if (Array.isArray(msgs)) msgs.forEach((m) => pieces.push(`${field}: ${m}`));
      else if (msgs) pieces.push(`${field}: ${msgs}`);
    });
  }

  if (typeof api.error === 'string' && api.error.trim()) pieces.push(api.error.trim());
  if (typeof api.details === 'string' && api.details.trim()) pieces.push(api.details.trim());

  const text = pieces.join(' ');
  return text || fallback;
};

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
  feedbackBrowserIntervention: any = null;

  repeatMode: 'create' | 'modify' = 'create';
  modifyDefaults: any = null;

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
    return Array.isArray(specs)
      ? specs.flatMap((spec) => (config as any)?.patientInfo?.function?.[spec]?.diagnosis || [])
      : [];
  }

  private buildCatalogMap() {
    const m = new Map<string, Intervention>();
    for (const it of this.allInterventions || []) m.set(it._id, it);
    return m;
  }

  /**
   * Your therapist rehab-plan endpoint returns schedule + notes, but NOT media/description.
   * We merge plan items with catalog details so the info popup can show media/desc again.
   */
  private mergePlanWithCatalog(plan: PatientPlan, catalog: Intervention[]): PatientPlan {
    const catalogMap = new Map<string, Intervention>();
    for (const it of catalog || []) catalogMap.set(it._id, it);

    const merged = (plan?.interventions || []).map((p: any) => {
      const full = catalogMap.get(p._id);

      // keep schedule fields from plan (dates/notes/frequency/etc)
      // keep media/desc/etc from catalog if plan doesn't have it
      return {
        ...(full || {}),
        ...(p || {}),
        // make sure these exist even if plan overwrites them incorrectly
        title: p?.title ?? full?.title ?? '',
        description: p?.description ?? full?.description ?? '',
        media_url: p?.media_url ?? (full as any)?.media_url ?? (full as any)?.media_file ?? '',
        media_file: (p as any)?.media_file ?? (full as any)?.media_file ?? '',
        link: p?.link ?? full?.link ?? '',
        tags: p?.tags ?? full?.tags ?? [],
        benefitFor: p?.benefitFor ?? (full as any)?.benefitFor ?? [],
        content_type: p?.content_type ?? full?.content_type ?? '',
        preview_img: (p as any)?.preview_img ?? (full as any)?.preview_img ?? '',
      } as any;
    });

    return { ...(plan || {}), interventions: merged };
  }

  private hasFutureDates(interventionId: string) {
    const p: any = this.patientData?.interventions?.find((i: any) => i._id === interventionId);
    return p?.dates?.some((d: any) => new Date(d.datetime) > new Date()) || false;
  }

  get patientAssignedItems(): Intervention[] {
    const ids = new Set((this.patientData?.interventions || []).map((x: any) => x._id));
    return (this.allInterventions || []).filter((it) => ids.has(it._id));
  }

  get activePatientItems(): Intervention[] {
    // plan items already merged; this is fine for the left list
    const ids = new Set((this.patientData?.interventions || []).map((x: any) => x._id));
    const items = (this.allInterventions || []).filter((it) => ids.has(it._id));
    return items.filter((it) => this.hasFutureDates(it._id));
  }

  get pastPatientItems(): Intervention[] {
    const ids = new Set((this.patientData?.interventions || []).map((x: any) => x._id));
    const items = (this.allInterventions || []).filter((it) => ids.has(it._id));
    return items.filter((it) => !this.hasFutureDates(it._id));
  }

  get selectedExerciseFromPlan(): any | null {
    if (!this.selectedExerciseId) return null;
    // prefer merged plan item (has dates + notes + merged media/desc)
    const planItem = (this.patientData?.interventions || []).find((x: any) => x._id === this.selectedExerciseId);
    if (planItem) return planItem;

    // fallback: catalog
    return (this.allInterventions || []).find((x) => x._id === this.selectedExerciseId) || null;
  }

  get selectedAssignment(): any | null {
    if (!this.selectedExerciseId) return null;
    return (this.patientData?.interventions || []).find((x: any) => x._id === this.selectedExerciseId) || null;
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
  async init(navigate: (path: string) => void, t: (k: string) => any) {
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
        this.error = typeof t === 'function' ? t('No patient selected.') : 'No patient selected.';
      });
      return;
    }

    runInAction(() => {
      this.patientUsername = sel;
      this.patientName = localStorage.getItem('selectedPatientName') || sel;
      this.loading = true;
      this.error = null;
    });

    // load everything via store (correct endpoints)
    await Promise.allSettled([this.fetchAll(t), this.fetchInts(t)]);

    // merge plan with catalog so popups/calendar regain media/desc
    runInAction(() => {
      this.patientData = this.mergePlanWithCatalog(this.patientData, this.allInterventions);
      this.loading = false;
    });

    // translate initial visible list
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
  async fetchAll(t: (k: string) => any) {
    try {
      const pid = this.patientIdForCalls;

      // ✅ correct URL from your urls.py:
      // /api/patients/rehabilitation-plan/therapist/<patient_id>/
      const res = await apiClient.get(`patients/rehabilitation-plan/therapist/${pid}/`);
      const raw = (res.data ?? {}) as Record<string, any>;

      if (raw.success === false && raw.message && !raw.interventions) {
        runInAction(() => {
          this.patientData = EMPTY_PLAN;
          this.error = raw.message;
        });
        return;
      }

      const interventions = Array.isArray(raw.interventions) ? raw.interventions : [];
      runInAction(() => {
        this.patientData = { ...raw, interventions };
      });

      // if catalog already loaded, merge now
      if (this.allInterventions?.length) {
        runInAction(() => {
          this.patientData = this.mergePlanWithCatalog(this.patientData, this.allInterventions);
        });
      }
    } catch (e: any) {
      const msg = extractApiError(
        e,
        typeof t === 'function'
          ? t('Error loading patients interventions. Reload the page or try again later.')
          : 'Error loading patients interventions. Reload the page or try again later.'
      );
      runInAction(() => {
        this.patientData = EMPTY_PLAN;
        this.error = msg;
      });
    }
  }

  async fetchInts(t: (k: string) => any) {
    try {
      const pid = this.patientIdForCalls;

      // ✅ correct URL from urls.py:
      // /api/interventions/all/<patient_id>/
      const res = await apiClient.get(`interventions/all/${pid}/`);
      const list = Array.isArray(res.data) ? res.data : res.data?.interventions || [];

      const uniq = new Map<string, Intervention>();
      (list || []).forEach((x: Intervention) => uniq.set(x._id, x));
      const arr = [...uniq.values()];

      runInAction(() => {
        this.allInterventions = arr;
        this.recommendations = arr;
        this.filteredRecommendations = arr;
      });

      this.applyAllFilters();

      // if plan already loaded, merge now
      if (this.patientData?.interventions?.length) {
        runInAction(() => {
          this.patientData = this.mergePlanWithCatalog(this.patientData, this.allInterventions);
        });
      }
    } catch (e: any) {
      const msg = extractApiError(
        e,
        typeof t === 'function' ? t('Error loading interventions. Reload the page or try again later.') : 'Error loading interventions.'
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
    const filtered = filterInterventions(this.recommendations, {
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
    const items =
      this.selectedTab === 'patient'
        ? (this.patientData?.interventions || []) // merged plan items
        : (this.filteredRecommendations || []);

    if (!items.length) {
      runInAction(() => {
        this.titleMap = {};
        this.typeMap = {};
      });
      return;
    }

    const newTitles: TitleMap = {};
    await Promise.all(
      items.map(async (rec: any) => {
        try {
          const { translatedText, detectedSourceLanguage } = await translateText(rec.title, userLang);
          newTitles[rec._id] = { title: translatedText || rec.title, lang: detectedSourceLanguage || null };
        } catch {
          newTitles[rec._id] = { title: rec.title, lang: null };
        }
      })
    );

    const newTypes: TypeMap = {};
    await Promise.all(
      items.map(async (rec: any) => {
        const label = capitalize(rec.content_type || '');
        try {
          const { translatedText } = await translateText(label, userLang);
          newTypes[rec._id] = translatedText || label;
        } catch {
          newTypes[rec._id] = label;
        }
      })
    );

    runInAction(() => {
      this.titleMap = newTitles;
      this.typeMap = newTypes;
    });
  }

  // ---------------------------------------------------------------------------
  // Modal open/close + click handlers
  // ---------------------------------------------------------------------------
  private setSelected(intervention: any) {
    const id = intervention?._id || intervention?.id;
    this.selectedExerciseId = id || null;
  }

  handleExerciseClick(intervention: any) {
    this.setSelected(intervention);
    this.showInfoInterventionModal = true;
  }

  closeInfoModal() {
    this.showInfoInterventionModal = false;
  }

  showStats(intervention: any) {
    this.setSelected(intervention);
    this.showExerciseStats = true;
  }

  closeStatsModal() {
    this.showExerciseStats = false;
  }

  openFeedbackBrowser(intervention: any) {
    this.setSelected(intervention);

    // use merged plan item if possible (dates + feedback are there)
    const planItem = this.selectedExerciseFromPlan || intervention;
    this.feedbackBrowserIntervention = planItem;
    this.showFeedbackBrowser = true;
  }

  closeFeedbackBrowser() {
    this.showFeedbackBrowser = false;
    this.feedbackBrowserIntervention = null;
  }

  openAddIntervention(intervention: any) {
    this.repeatMode = 'create';
    this.setSelected(intervention);
    this.modifyDefaults = null;
    this.showRepeatModal = true;
  }

  openModifyIntervention(intervention: any) {
    this.repeatMode = 'modify';
    this.setSelected(intervention);

    const assigned: any = this.selectedAssignment;
    const next = assigned?.dates?.map((d: any) => new Date(d.datetime)).find((d: Date) => d > new Date());

    this.modifyDefaults = {
      effectiveFrom: (next ? next : new Date(Date.now() + 86400000)).toISOString().slice(0, 10),
      frequency: assigned?.frequency || '',
      notes: assigned?.notes || '',
      require_video_feedback: !!assigned?.require_video_feedback,
    };

    this.showRepeatModal = true;
  }

  closeRepeatModal() {
    this.showRepeatModal = false;
  }

  async deleteExercise(interventionId: string, t: (k: string) => any) {
    try {
      // ✅ correct URL from urls.py:
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
    } catch (err: any) {
      const msg = extractApiError(err, typeof t === 'function' ? t('Failed to delete the intervention. Try again now or later.') : 'Failed to delete.');
      runInAction(() => {
        this.error = msg;
      });
    }
  }
}
