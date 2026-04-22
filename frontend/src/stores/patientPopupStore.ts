/* eslint-disable */
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';
import authStore from './authStore';

export type ValueSource = 'manual' | 'redcap' | 'empty';
export type SelectOption = { value: string; label: string };

// -------------------------
// Date helpers
// -------------------------
export const toDateInput = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

export const toDisplayDate = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString();
};

// datetime-local helpers (Europe/Zurich-friendly)
const pad2 = (n: number) => String(n).padStart(2, '0');
const toLocalDatetimeInput = (isoOrDate: any) => {
  if (!isoOrDate) return '';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const localDatetimeInputToISO = (v: string) => {
  // "YYYY-MM-DDTHH:mm" interpreted as local time by Date()
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

// -------------------------
// Threshold types
// -------------------------
export type PatientThresholds = {
  steps_goal: number;

  active_minutes_green: number;
  active_minutes_yellow: number;

  sleep_green_min: number;
  sleep_yellow_min: number;

  bp_sys_green_max: number;
  bp_sys_yellow_max: number;
  bp_dia_green_max: number;
  bp_dia_yellow_max: number;
};

export type ThresholdHistoryItem = {
  effective_from: string | null; // ISO
  changed_at?: string | null; // ISO (optional)
  changed_by?: string | null;
  reason?: string | null;
  thresholds: Partial<PatientThresholds>;
};

const DEFAULT_THRESHOLDS: PatientThresholds = {
  steps_goal: 10000,
  active_minutes_green: 30,
  active_minutes_yellow: 20,
  sleep_green_min: 7 * 60,
  sleep_yellow_min: 6 * 60,
  bp_sys_green_max: 129,
  bp_sys_yellow_max: 139,
  bp_dia_green_max: 84,
  bp_dia_yellow_max: 89,
};

const isEmptyValue = (v: any) =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

const deepEqualJSON = (a: any, b: any) => {
  try {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  } catch {
    return false;
  }
};

const normalizeNum = (v: any, fallback: number) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n;
};

const normalizeThresholds = (t: any): PatientThresholds => {
  const src = t || {};
  return {
    steps_goal: normalizeNum(src.steps_goal, DEFAULT_THRESHOLDS.steps_goal),

    active_minutes_green: normalizeNum(
      src.active_minutes_green,
      DEFAULT_THRESHOLDS.active_minutes_green
    ),
    active_minutes_yellow: normalizeNum(
      src.active_minutes_yellow,
      DEFAULT_THRESHOLDS.active_minutes_yellow
    ),

    sleep_green_min: normalizeNum(src.sleep_green_min, DEFAULT_THRESHOLDS.sleep_green_min),
    sleep_yellow_min: normalizeNum(src.sleep_yellow_min, DEFAULT_THRESHOLDS.sleep_yellow_min),

    bp_sys_green_max: normalizeNum(src.bp_sys_green_max, DEFAULT_THRESHOLDS.bp_sys_green_max),
    bp_sys_yellow_max: normalizeNum(src.bp_sys_yellow_max, DEFAULT_THRESHOLDS.bp_sys_yellow_max),
    bp_dia_green_max: normalizeNum(src.bp_dia_green_max, DEFAULT_THRESHOLDS.bp_dia_green_max),
    bp_dia_yellow_max: normalizeNum(src.bp_dia_yellow_max, DEFAULT_THRESHOLDS.bp_dia_yellow_max),
  };
};

const mergeThresholds = (base: PatientThresholds, patch: Partial<PatientThresholds>) => {
  const next = { ...base, ...(patch || {}) };
  return normalizeThresholds(next);
};

// -------------------------
// Profile dirty-check helpers
// -------------------------
const stripVolatileProfileFields = (obj: any) => {
  const o: any = { ...(obj || {}) };

  // server-managed / volatile
  delete o.updatedAt;
  delete o.createdAt;
  delete o.__v;

  // runtime-only
  delete o.redcapRows;
  delete o.redcapFlat;

  // keep thresholds separate (do NOT count as profile changes)
  delete o.thresholds;
  delete o.thresholds_history;
  delete o.thresholdsHistory;

  return o;
};

const stableJSON = (obj: any) => {
  try {
    return JSON.stringify(obj ?? null);
  } catch {
    return String(obj);
  }
};

const COMMA_SEPARATED_PROFILE_FIELDS = ['lifestyle', 'personal_goals', 'social_support'] as const;

export class PatientPopupStore {
  patientId: string;

  // UI
  loading = false;
  saving = false;
  error = '';
  showConfirmDelete = false;
  isEditing = false;
  activeTab: 'profile' | 'characteristics' | 'redcap' | 'thresholds' = 'profile';

  // patient data
  rawPatient: any = null;

  // manualData = what is stored in Mongo (manual / editable)
  manualData: any = {};
  // formData = editing buffer
  formData: any = {};

  // REDCap
  redcapLoading = false;
  redcapError: string | null = null;

  redcapProject: string | null = null;
  redcapIdentifier: string | null = null; // pat_id or record_id fallback (identifier)
  redcapRecordId: string | null = null;
  redcapPatId: string | null = null;
  redcapDag: string | null = null;

  // redcap rows fetched live
  redcapRows: any[] = [];
  // flattened view for table
  redcapFlat: Record<string, any> = {};

  // computed helpers for your diagnosis-specialisation logic (keep if you already use it)
  specialityDiagnosisMap: Record<string, string[]> = {};

  // -------------------------
  // Password reset (therapist → patient)
  // -------------------------
  showPasswordReset = false;
  passwordNew = '';
  passwordConfirm = '';
  passwordSaving = false;
  passwordError: string | null = null;
  passwordSuccess = false;

  // -------------------------
  // Thresholds (NEW)
  // -------------------------
  thresholdsLoading = false;
  thresholdsError: string | null = null;

  thresholds: PatientThresholds | null = null;
  thresholdsHistory: ThresholdHistoryItem[] = [];

  thresholdDraft: Partial<PatientThresholds> = {}; // edits only
  thresholdReason = '';
  thresholdEffectiveFromISO: string | null = null; // ISO (optional backdate)

  constructor(patientId: string) {
    this.patientId = patientId;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  // -------------------------
  // UI setters
  // -------------------------
  setError(v: string) {
    this.error = v;
  }

  setShowConfirmDelete(v: boolean) {
    this.showConfirmDelete = v;
  }

  setEditing(v: boolean) {
    this.isEditing = v;
    if (!v) {
      // reset editing buffer
      this.formData = { ...(this.manualData || {}) };
      // reset thresholds draft fields too
      this.thresholdDraft = {};
      this.thresholdReason = '';
      this.thresholdEffectiveFromISO = null;
    }
  }

  setActiveTab(v: 'profile' | 'characteristics' | 'redcap' | 'thresholds') {
    this.activeTab = v;
  }

  // -------------------------
  // Password reset setters
  // -------------------------
  setShowPasswordReset(v: boolean) {
    this.showPasswordReset = v;
    if (!v) {
      this.passwordNew = '';
      this.passwordConfirm = '';
      this.passwordError = null;
      this.passwordSuccess = false;
    }
  }

  setPasswordNew(v: string) {
    this.passwordNew = v;
    this.passwordError = null;
    this.passwordSuccess = false;
  }

  setPasswordConfirm(v: string) {
    this.passwordConfirm = v;
    this.passwordError = null;
    this.passwordSuccess = false;
  }

  async resetPassword(t: (k: string) => string) {
    if (!this.passwordNew) {
      this.passwordError = t('NewPasswordRequired');
      return false;
    }
    if (this.passwordNew !== this.passwordConfirm) {
      this.passwordError = t('PasswordsDoNotMatch');
      return false;
    }

    this.passwordSaving = true;
    this.passwordError = null;
    this.passwordSuccess = false;

    try {
      await apiClient.put(`/patients/${this.patientId}/reset-password/`, {
        new_password: this.passwordNew,
      });
      runInAction(() => {
        this.passwordSuccess = true;
        this.passwordNew = '';
        this.passwordConfirm = '';
      });
      return true;
    } catch (err: any) {
      const api = err?.response?.data;
      runInAction(() => {
        this.passwordError =
          api?.error || api?.message || err?.message || t('Failed to reset password.');
      });
      return false;
    } finally {
      runInAction(() => {
        this.passwordSaving = false;
      });
    }
  }

  // -------------------------
  // Dirty checks
  // -------------------------
  get profileDirty(): boolean {
    // only allow saving profile when in editing mode
    if (!this.isEditing) return false;
    const base = stripVolatileProfileFields(this.manualData);
    const curr = stripVolatileProfileFields(this.formData);
    return stableJSON(base) !== stableJSON(curr);
  }

  // -------------------------
  // Threshold setters / helpers
  // -------------------------
  setThresholdField<K extends keyof PatientThresholds>(key: K, value: number) {
    const v = Number(value);
    this.thresholdDraft = { ...(this.thresholdDraft || {}), [key]: Number.isFinite(v) ? v : value };
  }

  setThresholdReason(v: string) {
    this.thresholdReason = String(v || '').slice(0, 500);
  }

  // bind to <input type="datetime-local">
  get thresholdEffectiveFromLocal(): string {
    return toLocalDatetimeInput(this.thresholdEffectiveFromISO);
  }

  setThresholdEffectiveFromLocal(v: string) {
    this.thresholdEffectiveFromISO = localDatetimeInputToISO(v);
  }

  get mergedThresholds(): PatientThresholds {
    const base = normalizeThresholds(this.thresholds || DEFAULT_THRESHOLDS);
    return mergeThresholds(base, this.thresholdDraft || {});
  }

  get thresholdsDirty(): boolean {
    if (!this.thresholds) {
      return Object.keys(this.thresholdDraft || {}).length > 0;
    }
    return !deepEqualJSON(normalizeThresholds(this.thresholds), this.mergedThresholds);
  }

  // -------------------------
  // Field source helpers
  // -------------------------
  hasManualInfoForKey(key: string): boolean {
    const v = this.manualData?.[key];
    if (v === null || v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v.trim().length > 0;
    return true;
  }

  getValueSource(key: string): ValueSource {
    const manual = this.manualData?.[key];
    const redcap = this.redcapFlat?.[key];

    const hasManual =
      manual !== undefined &&
      manual !== null &&
      !(typeof manual === 'string' && manual.trim() === '') &&
      !(Array.isArray(manual) && manual.length === 0);

    const hasRedcap =
      redcap !== undefined &&
      redcap !== null &&
      !(typeof redcap === 'string' && String(redcap).trim() === '') &&
      !(Array.isArray(redcap) && redcap.length === 0);

    if (hasManual) return 'manual';
    if (hasRedcap) return 'redcap';
    return 'empty';
  }

  get hasManualInfo(): boolean {
    const keys = Object.keys(this.manualData || {});
    return keys.some((k) => this.hasManualInfoForKey(k));
  }

  /**
   * Manual preferred, fallback to REDCap.
   */
  getDisplayValue(key: string): any {
    const manual = this.manualData?.[key];
    const hasManual =
      manual !== undefined &&
      manual !== null &&
      !(typeof manual === 'string' && manual.trim() === '') &&
      !(Array.isArray(manual) && manual.length === 0);

    if (hasManual) return manual;
    return this.redcapFlat?.[key];
  }

  // -------------------------
  // Form editing helpers
  // -------------------------
  setField(key: string, value: any) {
    this.formData = { ...(this.formData || {}), [key]: value };
  }

  setMultiSelect(key: string, selected: SelectOption[] | null) {
    const vals = (selected || []).map((x) => x.value);
    this.formData = { ...(this.formData || {}), [key]: vals };
  }

  setCommaSeparated(key: string, v: string) {
    // Keep raw text while typing so spaces are not stripped between words.
    // We normalize to array form right before persistence in save().
    this.formData = { ...(this.formData || {}), [key]: v };
  }

  arrayToDisplay(v: any) {
    if (!v) return '';
    if (Array.isArray(v)) return v.filter(Boolean).join(', ');
    return String(v);
  }

  // -------------------------
  // Load patient (Mongo) + REDCap + Thresholds
  // -------------------------
  async fetchPatientData(t: (k: string) => string) {
    this.loading = true;
    this.error = '';
    this.redcapError = null;

    try {
      const res = await apiClient.get(`/users/${this.patientId}/profile`);
      const data = res.data || {};

      runInAction(() => {
        this.rawPatient = data;
        this.manualData = data || {};
        this.formData = { ...(data || {}) };

        this.redcapProject =
          data.redcap_project || data.redcapProject || null
            ? String(data.redcap_project || data.redcapProject)
            : null;
        this.redcapIdentifier =
          data.redcap_identifier || data.redcapIdentifier || null
            ? String(data.redcap_identifier || data.redcapIdentifier)
            : null;
        this.redcapRecordId =
          data.redcap_record_id || data.redcapRecordId || null
            ? String(data.redcap_record_id || data.redcapRecordId)
            : null;
        this.redcapPatId =
          data.redcap_pat_id || data.redcapPatId || null
            ? String(data.redcap_pat_id || data.redcapPatId)
            : null;
        this.redcapDag =
          data.redcap_dag || data.redcapDag || null
            ? String(data.redcap_dag || data.redcapDag)
            : null;

        if (!this.redcapIdentifier) {
          const pc = data.patient_code || data.patientCode || '';
          this.redcapIdentifier = pc ? String(pc) : null;
        }
      });

      await this.fetchRedcapIfPossible(t);
      await this.fetchThresholds(t);
    } catch (err: any) {
      const api = err?.response?.data;
      runInAction(() => {
        this.error = api?.error || api?.message || err?.message || t('Failed to load patient.');
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /**
   * Fetch REDCap record(s) live using:
   *   GET /api/redcap/patient/?patient_code=<identifier>&project=<optional>
   */
  async fetchRedcapIfPossible(t: (k: string) => string) {
    const identifier = (this.redcapIdentifier || '').trim();
    if (!identifier) {
      runInAction(() => {
        this.redcapRows = [];
        this.redcapFlat = {};
      });
      return;
    }

    this.redcapLoading = true;
    this.redcapError = null;

    try {
      const params: any = { patient_code: identifier, therapistUserId: authStore.id };
      if (this.redcapProject) params.project = this.redcapProject;

      const res = await apiClient.get('/redcap/patient/', { params });
      const payload = res.data || {};

      const matches = Array.isArray(payload.matches) ? payload.matches : [];
      const firstMatch = matches[0] || null;

      const rows: any[] = firstMatch?.rows && Array.isArray(firstMatch.rows) ? firstMatch.rows : [];
      const project = firstMatch?.project ? String(firstMatch.project) : this.redcapProject || null;

      const flat = rows.length ? { ...(rows[0] || {}) } : {};

      runInAction(() => {
        this.redcapProject = project;
        this.redcapRows = rows;
        this.redcapFlat = flat;

        const rec = flat?.record_id ? String(flat.record_id) : null;
        const pid = flat?.pat_id ? String(flat.pat_id) : null;

        this.redcapRecordId = rec || this.redcapRecordId;
        this.redcapPatId = pid || this.redcapPatId;
      });
    } catch (err: any) {
      const api = err?.response?.data;
      runInAction(() => {
        this.redcapRows = [];
        this.redcapFlat = {};
        const code: string | undefined = api?.code;
        this.redcapError = code
          ? t(code)
          : api?.error || api?.message || err?.message || t('redcap_fetch_failed');
      });
    } finally {
      runInAction(() => {
        this.redcapLoading = false;
      });
    }
  }

  /**
   * Threshold endpoint:
   *   GET    /api/patients/:id/thresholds/
   *   PATCH  /api/patients/:id/thresholds/
   */
  async fetchThresholds(t: (k: string) => string) {
    this.thresholdsLoading = true;
    this.thresholdsError = null;

    try {
      const res = await apiClient.get(`/patients/${this.patientId}/thresholds/`);
      const data = res.data || {};

      runInAction(() => {
        const th = data.thresholds ?? data;
        this.thresholds = normalizeThresholds(th);
        this.thresholdsHistory = Array.isArray(data.history || data.thresholds_history)
          ? data.history || data.thresholds_history
          : [];
        this.thresholdDraft = {};
        this.thresholdReason = '';
        this.thresholdEffectiveFromISO = null;
      });
    } catch (err: any) {
      const api = err?.response?.data;
      runInAction(() => {
        this.thresholds = this.thresholds || normalizeThresholds(DEFAULT_THRESHOLDS);
        this.thresholdsHistory = this.thresholdsHistory || [];
        this.thresholdsError =
          api?.error || api?.message || err?.message || t('Failed to load thresholds.');
      });
    } finally {
      runInAction(() => {
        this.thresholdsLoading = false;
      });
    }
  }

  /**
   * Save thresholds only (PATCH). No-op if nothing changed.
   */
  async saveThresholds(t: (k: string) => string) {
    if (!this.thresholdsDirty) return true;

    const alreadySaving = this.saving;
    if (!alreadySaving) this.saving = true;

    this.thresholdsError = null;

    try {
      const payload: any = { thresholds: this.mergedThresholds };
      if (this.thresholdReason && this.thresholdReason.trim())
        payload.reason = this.thresholdReason.trim();
      if (this.thresholdEffectiveFromISO) payload.effective_from = this.thresholdEffectiveFromISO;

      await apiClient.post(`/patients/${this.patientId}/thresholds/`, payload);

      await this.fetchThresholds(t);
      return true;
    } catch (err: any) {
      const api = err?.response?.data;
      runInAction(() => {
        this.thresholdsError =
          api?.error || api?.message || err?.message || t('Failed to save thresholds.');
      });
      return false;
    } finally {
      if (!alreadySaving) {
        runInAction(() => {
          this.saving = false;
        });
      }
    }
  }

  /**
   * Wrapper called by popup "SaveChanges".
   * Saves profile only if changed; thresholds only if changed.
   */
  async saveAll(t: (k: string) => string) {
    // no network calls if nothing changed
    if (!this.profileDirty && !this.thresholdsDirty) {
      this.isEditing = false;
      return true;
    }

    this.saving = true;
    this.error = '';
    this.thresholdsError = null;

    try {
      // 1) save profile ONLY if dirty
      if (this.profileDirty) {
        const okProfile = await this.save(t);
        if (!okProfile) return false;
      }

      // 2) save thresholds ONLY if dirty
      if (this.thresholdsDirty) {
        const okThresholds = await this.saveThresholds(t);
        if (!okThresholds) return false;
      }

      // if only thresholds were saved, exit edit mode here
      if (this.isEditing) this.isEditing = false;

      return true;
    } finally {
      runInAction(() => {
        this.saving = false;
      });
    }
  }

  // -------------------------
  // Save / Delete
  // -------------------------
  async save(t: (k: string) => string) {
    // If someone calls save() directly, still prevent unnecessary PUT.
    if (!this.profileDirty) return true;

    const alreadySaving = this.saving;
    if (!alreadySaving) {
      this.saving = true;
      this.error = '';
    }

    try {
      const payload = { ...(this.formData || {}) };
      COMMA_SEPARATED_PROFILE_FIELDS.forEach((fieldKey) => {
        const raw = payload[fieldKey];
        if (Array.isArray(raw)) {
          payload[fieldKey] = raw
            .map((x: unknown) => String(x ?? '').trim())
            .filter(Boolean);
          return;
        }
        if (typeof raw === 'string') {
          payload[fieldKey] = raw
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
        }
      });

      // ✅ match your existing GET (and trailing slash)
      await apiClient.put(`/users/${this.patientId}/profile/`, payload);

      // Re-fetch the full profile so the modal shows accurate server state
      const profileRes = await apiClient.get(`/users/${this.patientId}/profile`);
      const freshData = profileRes.data || {};

      runInAction(() => {
        this.manualData = freshData;
        this.formData = { ...(freshData || {}) };
        this.isEditing = false;
      });

      return true;
    } catch (err: any) {
      const api = err?.response?.data;
      runInAction(() => {
        this.error = api?.error || api?.message || err?.message || t('Failed to save patient.');
      });
      return false;
    } finally {
      if (!alreadySaving) {
        runInAction(() => {
          this.saving = false;
        });
      }
    }
  }

  async deletePatient(t: (k: string) => string) {
    this.saving = true;
    this.error = '';
    try {
      // NOTE: adjust endpoint if yours differs
      await apiClient.delete(`/patients/${this.patientId}/`);
      return true;
    } catch (err: any) {
      const api = err?.response?.data;
      runInAction(() => {
        this.error = api?.error || api?.message || err?.message || t('Failed to delete patient.');
      });
      return false;
    } finally {
      runInAction(() => {
        this.saving = false;
      });
    }
  }

  // -------------------------
  // Wearables → REDCap sync
  // -------------------------
  wearablesSyncing = false;
  wearablesSyncResult: Record<string, string> | null = null;
  wearablesSyncError: string | null = null;

  async syncWearablesToRedcap(
    t: (k: string) => string,
    eventBaseline?: string,
    eventFollowup?: string
  ) {
    this.wearablesSyncing = true;
    this.wearablesSyncResult = null;
    this.wearablesSyncError = null;
    try {
      const body: Record<string, string> = {};
      if (eventBaseline) body.event_baseline = eventBaseline;
      if (eventFollowup) body.event_followup = eventFollowup;
      const res = await apiClient.post(`/wearables/sync-to-redcap/${this.patientId}/`, body);
      runInAction(() => {
        this.wearablesSyncResult = (res.data as any)?.results ?? {};
      });
    } catch (err: any) {
      const api = err?.response?.data;
      runInAction(() => {
        const code: string | undefined = api?.code;
        this.wearablesSyncError = code
          ? t(code)
          : api?.error || api?.message || err?.message || t('wearables_sync_failed');
      });
    } finally {
      runInAction(() => {
        this.wearablesSyncing = false;
      });
    }
  }

  // -------------------------
  // Optional helper: copy missing values from REDCap
  // -------------------------
  copyRedcapIntoManual() {
    const next = { ...(this.formData || {}) };

    Object.entries(this.redcapFlat || {}).forEach(([k, v]) => {
      const cur = next[k];
      const empty = isEmptyValue(cur);
      const redcapEmpty = isEmptyValue(v);

      if (empty && !redcapEmpty) next[k] = v;
    });

    this.formData = next;
  }
}
