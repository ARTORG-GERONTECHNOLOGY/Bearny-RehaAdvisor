/* eslint-disable */
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';
import authStore from './authStore';
import config from '../config/config.json';

export type SelectOption = { value: string; label: string };

export const toDateInput = (v?: any) => {
  if (!v) return '';
  // already yyyy-mm-dd
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // ISO string -> yyyy-mm-dd
  if (typeof v === 'string' && v.includes('T')) return v.split('T')[0];
  // Date object
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().split('T')[0];
  // fallback
  return String(v).slice(0, 10);
};

export const toDisplayDate = (v?: any) => {
  if (!v) return '';
  try {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch {}
  return String(v);
};

const isMeaningful = (v: any) => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '' && v.trim() !== '—';
  if (Array.isArray(v)) return v.filter(x => isMeaningful(x)).length > 0;
  return true;
};

const normalizeKey = (k: string) => (k || '').trim();

const safeString = (v: any) => {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

type RedcapResponse = {
  ok: boolean;
  project: string;
  patient_code: string;
  count: number;
  rows: Record<string, any>[];
};

export class PatientPopupStore {
  patientId: string;

  loading = true;
  saving = false;
  error = '';

  isEditing = false;
  activeTab: 'profile' | 'characteristics' | 'redcap' = 'profile';

  showConfirmDelete = false;

  // manual data from MongoDB (platform)
  manualData: Record<string, any> = {};
  // the data used by your existing form bindings (edit target)
  formData: Record<string, any> = {};

  // REDCap live data
  redcapLoading = false;
  redcapError: string | null = null;
  redcapProject: string | null = null;
  redcapRows: Record<string, any>[] = [];

  // ---- maps you already had
  specialityDiagnosisMap: Record<string, string[]> = {};

  constructor(patientId: string) {
    this.patientId = patientId;
    makeAutoObservable(this, {}, { autoBind: true });

    // keep your existing specialty->diagnosis map if you already populate it elsewhere
    // (left empty here intentionally)
  }

  setError(v: string) {
    this.error = v;
  }

  setEditing(v: boolean) {
    this.isEditing = v;

    // optional convenience: if entering edit mode and manual fields are empty but REDCap has values,
    // you can keep them as placeholders (display-only). We do NOT auto-copy into manual by default.
  }

  setActiveTab(v: any) {
    this.activeTab = v;
  }

  setShowConfirmDelete(v: boolean) {
    this.showConfirmDelete = v;
  }

  setField(key: string, value: any) {
    this.formData = { ...this.formData, [key]: value };
  }

  setMultiSelect(key: string, selected: SelectOption[] | null) {
    const values = (selected || []).map(s => s.value);
    this.setField(key, values);
  }

  arrayToDisplay(arr?: any[]) {
    if (!arr || !Array.isArray(arr)) return '';
    return arr.filter(x => isMeaningful(x)).join(', ');
  }

  setCommaSeparated(key: string, input: string) {
    const values = (input || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    this.setField(key, values);
  }

  // --------- SOURCE SELECTION / FALLBACK ---------

  /** True if manual has ANY useful patient info besides identifiers */
  get hasManualInfo() {
    // ignore these when deciding whether manual is “filled”
    const ignore = new Set([
      'patient_code',
      'clinic',
      'last_online',
      'last_online_contact',
      'userId',
      'id',
      '_id',
      'therapist',
      'username',
      'email',
      'phone',
      'createdAt',
      'updatedAt',
    ]);

    return Object.entries(this.manualData || {}).some(([k, v]) => {
      if (ignore.has(k)) return false;
      return isMeaningful(v);
    });
  }

  /** Choose which value to display (manual preferred; otherwise REDCap fallback if present) */
  getDisplayValue(key: string): any {
    const k = normalizeKey(key);
    const manualVal = this.manualData?.[k];

    if (isMeaningful(manualVal)) return manualVal;

    // fallback to REDCap-derived
    const rcVal = this.redcapDerived?.[k];
    if (isMeaningful(rcVal)) return rcVal;

    return manualVal ?? '';
  }

  /** Returns where the displayed value came from */
  getValueSource(key: string): 'manual' | 'redcap' | 'empty' {
    const k = normalizeKey(key);
    const manualVal = this.manualData?.[k];
    if (isMeaningful(manualVal)) return 'manual';

    const rcVal = this.redcapDerived?.[k];
    if (isMeaningful(rcVal)) return 'redcap';

    return 'empty';
  }

  /** Flatten “best” REDCap row into a simple object */
  get redcapFlat(): Record<string, any> {
    if (!this.redcapRows?.length) return {};
    // pick first row; you can improve later (e.g., pick latest event)
    return this.redcapRows[0] || {};
  }

  /**
   * REDCap -> platform-like keys (light mapping).
   * You said connector is pat_id (patient_code), and you do NOT want to store RC details in Mongo.
   * Here we only map a few “nice to show” fields if present.
   */
  get redcapDerived(): Record<string, any> {
    const rc = this.redcapFlat;
    if (!rc || !Object.keys(rc).length) return {};

    // Common field names in BOTH projects include pat_id and rehab_end (per codebooks).
    // Keep this conservative and safe:
    const out: Record<string, any> = {};

    // connector
    if (isMeaningful(rc.pat_id)) out.patient_code = rc.pat_id;

    // rehab dates (strings, not saved unless user chooses to copy)
    if (isMeaningful(rc.rehab_start)) out.rehab_start = rc.rehab_start;
    if (isMeaningful(rc.rehab_end)) out.reha_end_date = rc.rehab_end; // use your platform key for display

    // Example: sometimes you may have age/sex etc in RC; only map if present
    if (isMeaningful(rc.age)) out.age = rc.age;
    if (isMeaningful(rc.sex)) out.sex = rc.sex;

    // You can extend mapping later:
    // out.first_name = rc.firstname || rc.first_name || ...
    // out.name = rc.lastname || rc.name || ...

    return out;
  }

  // --------- PROJECT SELECTION (clinic -> project) ---------

  /** get a recommended project for this patient based on clinic_projects mapping */
  getProjectForClinic(clinic?: string): string | null {
    const clinicProjects = (config as any)?.clinic_projects || {};
    const projects: string[] = clinic && clinicProjects[clinic] ? clinicProjects[clinic] : [];
    if (projects?.length) return projects[0];

    // fallback: if config.projects exists
    const allProjects: string[] = (config as any)?.projects || [];
    return allProjects[0] || null;
  }

  // --------- FETCHING ---------

  async fetchPatientData(t: (k: string) => string) {
    this.loading = true;
    this.error = '';
    this.redcapError = null;

    try {
      // 1) Manual platform patient info (MongoDB)
      // Adjust endpoint if yours is different:
      const res = await apiClient.get(`/profile/${this.patientId}`);

      runInAction(() => {
        this.manualData = res.data || {};
        // Keep your existing edit bindings:
        this.formData = { ...(res.data || {}) };
      });

      // 2) Decide whether to fetch REDCap:
      // - fetch if manual is empty OR you want to always show RC tab
      // I recommend: always fetch, but don’t block UI if RC fails.
      await this.fetchRedcapIfPossible(t);

    } catch (e: any) {
      runInAction(() => {
        this.error = t('Failed to load patient data.');
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async fetchRedcapIfPossible(t: (k: string) => string) {
    this.redcapLoading = true;
    this.redcapError = null;

    try {
      const patientCode =
        (this.manualData?.patient_code || this.manualData?.username || '').toString().trim();

      if (!patientCode) {
        runInAction(() => {
          this.redcapRows = [];
          this.redcapProject = null;
          this.redcapError = t('No patient_code available to query REDCap.');
        });
        return;
      }

      const clinic = (this.manualData?.clinic || '').toString().trim();
      const project = this.getProjectForClinic(clinic);

      if (!project) {
        runInAction(() => {
          this.redcapRows = [];
          this.redcapProject = null;
          this.redcapError = t('No REDCap project configured for this clinic.');
        });
        return;
      }

      runInAction(() => {
        this.redcapProject = project;
      });

      const rcRes = await apiClient.get<RedcapResponse>(
        `/redcap/patient/?patient_code=${encodeURIComponent(patientCode)}&project=${encodeURIComponent(project)}`
      );

      runInAction(() => {
        this.redcapRows = rcRes.data?.rows || [];
        this.redcapError = null;
      });

    } catch (e: any) {
      runInAction(() => {
        this.redcapRows = [];
        this.redcapError = t('Failed to load REDCap data.');
      });
    } finally {
      runInAction(() => {
        this.redcapLoading = false;
      });
    }
  }

  // --------- ACTIONS ---------

  /** Copy currently derived REDCap values into manual form fields (does NOT save yet) */
  copyRedcapIntoManual() {
    const derived = this.redcapDerived || {};
    if (!Object.keys(derived).length) return;

    // only copy into fields that are currently empty in formData
    const next = { ...this.formData };
    Object.entries(derived).forEach(([k, v]) => {
      if (!isMeaningful(next[k]) && isMeaningful(v)) next[k] = v;
    });

    this.formData = next;
    this.isEditing = true;
  }

  async save(t: (k: string) => string) {
    this.saving = true;
    this.error = '';

    try {
      // PUT to your existing profile endpoint
      await apiClient.put(`/profile/${this.patientId}`, this.formData);

      runInAction(() => {
        this.manualData = { ...this.formData };
        this.isEditing = false;
      });

      return true;
    } catch (e: any) {
      runInAction(() => {
        this.error = t('Failed to save changes.');
      });
      return false;
    } finally {
      runInAction(() => {
        this.saving = false;
      });
    }
  }

  async deletePatient(t: (k: string) => string) {
    this.saving = true;
    this.error = '';

    try {
      await apiClient.delete(`/profile/${this.patientId}`);
      return true;
    } catch (e: any) {
      runInAction(() => {
        this.error = t('Failed to delete patient.');
      });
      return false;
    } finally {
      runInAction(() => {
        this.saving = false;
      });
    }
  }
}
