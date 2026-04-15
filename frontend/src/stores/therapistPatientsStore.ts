// src/stores/therapistPatientsStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';
import authStore from './authStore';
import { PatientType } from '../types';

export type SortKey = 'ampel' | 'created' | 'last_login' | 'adherence' | 'health' | 'feedback';

export type RedcapCandidate = {
  project: string;
  record_id?: string;
  pat_id?: string;
  identifier: string;
  dag?: string;
};

const redcapKey = (c: RedcapCandidate) => `${c.project}::${(c.identifier || '').trim()}`;

// ---- typed error helpers (no `any`) ----
type ApiErrorResponse = {
  data?: {
    error?: string;
    message?: string;
    detail?: string;
    details?: unknown;
    field_errors?: Record<string, unknown>;
    non_field_errors?: unknown;
    success?: boolean;
  };
};

type ApiErrorLike = {
  response?: ApiErrorResponse;
  message?: string;
};

const joinIfArray = (v: unknown): string => (Array.isArray(v) ? v.map(String).join(' ') : '');

const stringifyUnknown = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

const fieldErrorsToText = (fieldErrors: unknown): string => {
  if (!fieldErrors || typeof fieldErrors !== 'object') return '';
  const entries = Object.entries(fieldErrors as Record<string, unknown>);
  return entries
    .map(([k, v]) => {
      const text = Array.isArray(v) ? v.map(String).join(' ') : stringifyUnknown(v);
      return `${k}: ${text}`;
    })
    .join(' | ');
};

const extractApiMessage = (
  err: unknown,
  fallback: string
): { message: string; details: string | null } => {
  const e = err as ApiErrorLike;
  const api = e?.response?.data;

  const nonField = joinIfArray(api?.non_field_errors);
  const fieldText = fieldErrorsToText(api?.field_errors);

  const message = api?.message || api?.error || api?.detail || nonField || e?.message || fallback;

  const details =
    typeof api?.details === 'string'
      ? api.details
      : api?.details != null
        ? stringifyUnknown(api.details)
        : fieldText || null;

  return { message: String(message), details: details ? String(details) : null };
};

export class TherapistPatientsStore {
  patients: PatientType[] = [];

  // UI state
  loading = false;

  error = '';
  errorDetails: string | null = null;
  showErrorDetails = false;

  // popups
  selectedPatient: PatientType | null = null;
  showPatientPopup = false;
  showAddPatientPopup = false;

  // ✅ REDCap import modal
  showImportRedcapModal = false;
  redcapLoading = false;
  redcapError = '';
  redcapCandidates: RedcapCandidate[] = [];

  // ✅ per-row passwords
  redcapRowPasswords: Record<string, string> = {};

  // ✅ import tracking
  importingKey: string | null = null; // which row is importing right now
  importedKeys: Record<string, boolean> = {}; // grey-out rows that were imported

  // filters
  searchTerm = '';
  sexFilter = '';
  durationFilter = '';
  birthdateFilter = '';
  diseaseFilter = '';
  showCompleted = false;

  // sort
  sortBy: SortKey = 'ampel';

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  // -------------------------
  // Actions
  // -------------------------
  setSearchTerm(v: string) {
    this.searchTerm = v;
  }
  setSexFilter(v: string) {
    this.sexFilter = v;
  }
  setDurationFilter(v: string) {
    this.durationFilter = v;
  }
  setBirthdateFilter(v: string) {
    this.birthdateFilter = v;
  }
  setDiseaseFilter(v: string) {
    this.diseaseFilter = v;
  }
  setShowCompleted(v: boolean) {
    this.showCompleted = v;
  }
  setSortBy(v: SortKey) {
    this.sortBy = v;
  }

  resetFilters() {
    this.searchTerm = '';
    this.sexFilter = '';
    this.durationFilter = '';
    this.birthdateFilter = '';
    this.diseaseFilter = '';
    this.showCompleted = false;
    this.sortBy = 'ampel';
  }

  openPatient(p: PatientType) {
    this.selectedPatient = p;
    this.showPatientPopup = true;
  }

  closePatient() {
    this.showPatientPopup = false;
    this.selectedPatient = null;
  }

  openAddPatient() {
    this.showAddPatientPopup = true;
  }

  closeAddPatient() {
    this.showAddPatientPopup = false;
  }

  toggleErrorDetails() {
    this.showErrorDetails = !this.showErrorDetails;
  }

  // -------------------------
  // ✅ REDCap modal controls
  // -------------------------
  openImportRedcap() {
    this.showImportRedcapModal = true;
  }

  closeImportRedcap() {
    if (this.importingKey) return; // don't close while importing
    this.showImportRedcapModal = false;
    this.redcapError = '';
    this.redcapRowPasswords = {};
    this.importingKey = null;
    this.importedKeys = {};
  }

  setRedcapRowPassword(key: string, value: string) {
    this.redcapRowPasswords = {
      ...this.redcapRowPasswords,
      [key]: value,
    };
  }

  // -------------------------
  // ✅ Fetch candidates
  // -------------------------
  async fetchRedcapCandidates(t: (key: string) => string) {
    this.redcapLoading = true;
    this.redcapError = '';

    try {
      const res = await apiClient.get('/redcap/available-patients/', {
        params: {
          therapistUserId: authStore.id, // Mongo User _id
        },
      });

      const data = (res.data ?? {}) as Record<string, unknown>;
      const candidates = Array.isArray(data.candidates)
        ? (data.candidates as RedcapCandidate[])
        : [];

      // Surface per-project errors returned in a 200 response body
      const apiErrors = Array.isArray(data.errors) ? (data.errors as { project: string; error: string }[]) : [];
      const errorMessage =
        apiErrors.length > 0
          ? apiErrors.map((e) => `${e.project}: ${e.error}`).join(' | ')
          : '';

      runInAction(() => {
        this.redcapCandidates = candidates;
        if (errorMessage) this.redcapError = errorMessage;

        // keep existing rowPasswords for still-present keys
        const nextPw: Record<string, string> = {};
        candidates.forEach((c) => {
          const k = redcapKey(c);
          if (this.redcapRowPasswords[k] != null) nextPw[k] = this.redcapRowPasswords[k];
        });
        this.redcapRowPasswords = nextPw;

        // keep importedKeys only for still-present keys
        const nextImported: Record<string, boolean> = {};
        candidates.forEach((c) => {
          const k = redcapKey(c);
          if (this.importedKeys[k]) nextImported[k] = true;
        });
        this.importedKeys = nextImported;
      });
    } catch (err: unknown) {
      const { message } = extractApiMessage(err, t('Failed to fetch REDCap patients.'));
      runInAction(() => {
        this.redcapError = message;
      });
    } finally {
      runInAction(() => {
        this.redcapLoading = false;
      });
    }
  }

  // -------------------------
  // ✅ Import one
  // -------------------------
  async importOneFromRedcap(c: RedcapCandidate, t: (key: string) => string) {
    const key = redcapKey(c);
    if (!key) return;

    const password = (this.redcapRowPasswords[key] || '').trim();
    if (!password) {
      this.redcapError = t('Please provide a password for this patient.');
      return;
    }

    // already imported or currently importing
    if (this.importedKeys[key] || this.importingKey) return;

    this.importingKey = key;
    this.redcapError = '';

    try {
      await apiClient.post('/redcap/import-patient/', {
        project: c.project,
        therapistUserId: authStore.id,
        patient_code: c.identifier, // ✅ IMPORTANT: identifier is what BE expects
        password,
      });

      runInAction(() => {
        this.importedKeys = { ...this.importedKeys, [key]: true };
      });

      // refresh patients list immediately
      await this.fetchPatients(t);

      // optionally refresh candidates list too (keeps UI accurate)
      await this.fetchRedcapCandidates(t);
    } catch (err: unknown) {
      const { message } = extractApiMessage(err, t('Failed to import patient.'));
      runInAction(() => {
        this.redcapError = message;
      });
    } finally {
      runInAction(() => {
        this.importingKey = null;
      });
    }
  }

  // -------------------------
  // Data loading
  // -------------------------
  async fetchPatients(t: (key: string) => string) {
    this.loading = true;
    this.error = '';
    this.errorDetails = null;
    this.showErrorDetails = false;

    try {
      const res = await apiClient.get(`therapists/${authStore.id}/patients`);
      const payload = res.data as unknown;

      // If API returns an error-ish envelope: { success:false, ... }
      if (
        payload &&
        typeof payload === 'object' &&
        (payload as { success?: unknown }).success === false
      ) {
        const p = payload as {
          message?: unknown;
          error?: unknown;
          details?: unknown;
          field_errors?: unknown;
          non_field_errors?: unknown;
        };

        const nonField = joinIfArray(p.non_field_errors);
        const fieldText = fieldErrorsToText(p.field_errors);

        const message =
          (typeof p.message === 'string' && p.message) ||
          (typeof p.error === 'string' && p.error) ||
          nonField ||
          t('Failed to fetch patients. Please try again later.');

        const details =
          typeof p.details === 'string'
            ? p.details
            : p.details != null
              ? stringifyUnknown(p.details)
              : fieldText || null;

        runInAction(() => {
          this.error = message;
          this.errorDetails = details;
          this.patients = [];
        });
        return;
      }

      const list: PatientType[] = Array.isArray(payload)
        ? (payload as PatientType[])
        : payload &&
            typeof payload === 'object' &&
            Array.isArray((payload as { data?: unknown }).data)
          ? ((payload as { data: PatientType[] }).data as PatientType[])
          : [];

      const sorted = this.sortByCreatedDesc(list);

      runInAction(() => {
        this.patients = sorted;
      });
    } catch (err: unknown) {
      const { message, details } = extractApiMessage(
        err,
        t('Failed to fetch patients. Please try again later.')
      );
      runInAction(() => {
        this.error = message;
        this.errorDetails = details;
        this.patients = [];
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  // -------------------------
  // Derived / computed
  // -------------------------
  get diseaseOptions(): string[] {
    const all: string[] = [];
    this.patients.forEach((p) => {
      if (Array.isArray(p.diagnosis)) p.diagnosis.forEach((d) => all.push(String(d)));
      else if (p.diagnosis) all.push(String(p.diagnosis));
    });
    return Array.from(new Set(all)).sort();
  }

  get filteredPatients(): PatientType[] {
    let filtered = [...this.patients];

    if (this.sexFilter) filtered = filtered.filter((p) => p.sex === this.sexFilter);

    if (this.durationFilter) {
      filtered = filtered.filter((p) => {
        const d = (p as unknown as { duration?: unknown }).duration;
        const dur = typeof d === 'number' ? d : Number(d);
        if (!Number.isFinite(dur)) return false;

        if (this.durationFilter === '< 30 days') return dur < 30;
        if (this.durationFilter === '30-60 days') return dur >= 30 && dur <= 60;
        if (this.durationFilter === '60-90 days') return dur > 60 && dur <= 90;
        return dur > 90;
      });
    }

    if (this.diseaseFilter) {
      filtered = filtered.filter((p) => {
        const diag = p.diagnosis;
        if (!diag) return false;
        if (Array.isArray(diag)) return diag.map((x) => String(x)).includes(this.diseaseFilter);
        return String(diag) === this.diseaseFilter;
      });
    }

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter((p) => {
        const first = (p.first_name || '').toLowerCase();
        const last = (p.name || '').toLowerCase();
        const full1 = `${first} ${last}`.trim();
        const full2 = `${last} ${first}`.trim();

        const maybeUsername = (p as unknown as { username?: unknown }).username;
        const username = typeof maybeUsername === 'string' ? maybeUsername.toLowerCase() : '';

        const maybeId = (p as unknown as { _id?: unknown })._id;
        const pid = typeof maybeId === 'string' ? maybeId.toLowerCase() : '';

        const maybeCode = (p as unknown as { patient_code?: unknown }).patient_code;
        const pcode = typeof maybeCode === 'string' ? maybeCode.toLowerCase() : '';

        return (
          first.includes(term) ||
          last.includes(term) ||
          full1.includes(term) ||
          full2.includes(term) ||
          username.includes(term) ||
          pcode.includes(term) ||
          pid.includes(term)
        );
      });
    }

    if (this.birthdateFilter) {
      filtered = filtered.filter((p) => {
        const maybeAge = (p as unknown as { age?: unknown }).age;
        const ageStr = typeof maybeAge === 'string' ? maybeAge : stringifyUnknown(maybeAge);
        return ageStr.slice(0, 10) === this.birthdateFilter;
      });
    }

    return filtered;
  }

  sortByCreatedDesc(list: PatientType[]) {
    return [...list].sort((a, b) => {
      const daRaw = (a as unknown as { created_at?: unknown }).created_at;
      const dbRaw = (b as unknown as { created_at?: unknown }).created_at;
      const da = new Date(
        typeof daRaw === 'string' || typeof daRaw === 'number' ? daRaw : 0
      ).getTime();
      const db = new Date(
        typeof dbRaw === 'string' || typeof dbRaw === 'number' ? dbRaw : 0
      ).getTime();
      return db - da;
    });
  }

  isCompletedPatient(p: PatientType) {
    const status = (p as unknown as { rehab_status?: unknown }).rehab_status;
    const end = (p as unknown as { rehab_end_date?: unknown }).rehab_end_date;
    return status === 'completed' || !!end;
  }

  splitCompleted(sortedFiltered: PatientType[]) {
    const active = sortedFiltered.filter((p) => !this.isCompletedPatient(p));
    const completed = sortedFiltered
      .filter((p) => this.isCompletedPatient(p))
      .sort((a, b) => {
        const eaRaw =
          (a as unknown as { rehab_end_date?: unknown; created_at?: unknown }).rehab_end_date ??
          (a as unknown as { created_at?: unknown }).created_at ??
          0;
        const ebRaw =
          (b as unknown as { rehab_end_date?: unknown; created_at?: unknown }).rehab_end_date ??
          (b as unknown as { created_at?: unknown }).created_at ??
          0;

        const ea = new Date(
          typeof eaRaw === 'string' || typeof eaRaw === 'number' ? eaRaw : 0
        ).getTime();
        const eb = new Date(
          typeof ebRaw === 'string' || typeof ebRaw === 'number' ? ebRaw : 0
        ).getTime();
        return eb - ea;
      });

    return { active, completed };
  }
}
