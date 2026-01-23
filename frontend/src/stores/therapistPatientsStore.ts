import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';
import authStore from './authStore';
import { PatientType } from '../types';

export type SortKey =
  | 'ampel'
  | 'created'
  | 'last_login'
  | 'adherence'
  | 'health'
  | 'feedback';

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
  // Data loading
  // -------------------------
  async fetchPatients(t: (key: string) => string) {
    this.loading = true;
    this.error = '';
    this.errorDetails = null;
    this.showErrorDetails = false;

    try {
      const res = await apiClient.get<any>(`therapists/${authStore.id}/patients`);
      const payload = res.data ?? {};

      if (payload && payload.success === false) {
        const fieldErrors = payload.field_errors || {};
        const nonField =
          Array.isArray(payload.non_field_errors) && payload.non_field_errors.length
            ? payload.non_field_errors.join(' ')
            : '';

        const fieldText = fieldErrors
          ? Object.entries(fieldErrors)
              .map(([k, v]) => {
                const text =
                  Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : JSON.stringify(v);
                return `${k}: ${text}`;
              })
              .join(' | ')
          : '';

        const message =
          payload.message ||
          payload.error ||
          nonField ||
          t('Failed to fetch patients. Please try again later.');

        runInAction(() => {
          this.error = message;
          this.errorDetails = payload.details || fieldText || null;
          this.patients = [];
        });
        return;
      }

      const list: PatientType[] = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.data)
        ? payload.data
        : [];

      const sorted = this.sortByCreatedDesc(list);

      runInAction(() => {
        this.patients = sorted;
      });
    } catch (err: any) {
      const api = err?.response?.data;

      const fieldErrors = api?.field_errors || {};
      const nonField =
        Array.isArray(api?.non_field_errors) && api.non_field_errors.length
          ? api.non_field_errors.join(' ')
          : '';

      const fieldText = fieldErrors
        ? Object.entries(fieldErrors)
            .map(([k, v]) => {
              const text =
                Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : JSON.stringify(v);
              return `${k}: ${text}`;
            })
            .join(' | ')
        : '';

      const message =
        api?.message ||
        api?.error ||
        nonField ||
        err?.message ||
        t('Failed to fetch patients. Please try again later.');

      runInAction(() => {
        this.error = message;
        this.errorDetails = api?.details || fieldText || null;
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

    if (this.sexFilter) {
      filtered = filtered.filter((p) => p.sex === this.sexFilter);
    }

    if (this.durationFilter) {
      filtered = filtered.filter((p) => {
        const d = (p as any).duration as number;
        if (this.durationFilter === '< 30 days') return d < 30;
        if (this.durationFilter === '30-60 days') return d >= 30 && d <= 60;
        if (this.durationFilter === '60-90 days') return d > 60 && d <= 90;
        return d > 90;
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
        const username = (p as any).username ? String((p as any).username).toLowerCase() : '';
        const pid = String((p as any)._id || '').toLowerCase();
        const pcode = (p as any).patient_code ? String((p as any).patient_code).toLowerCase() : '';
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
      filtered = filtered.filter(
        (p) => String((p as any).age).slice(0, 10) === this.birthdateFilter
      );
    }

    return filtered;
  }

  // IMPORTANT: Ampel “math” remains in component (because it needs translation + tooltips).
  // Here we only apply non-ampel sorts. Ampel sort can still be applied in the component.
  sortByCreatedDesc(list: PatientType[]) {
    return [...list].sort((a, b) => {
      const da = new Date((a as any).created_at ?? 0).getTime();
      const db = new Date((b as any).created_at ?? 0).getTime();
      return db - da;
    });
  }

  isCompletedPatient(p: PatientType) {
    const status = (p as any).rehab_status;
    const end = (p as any).rehab_end_date;
    return status === 'completed' || !!end;
  }

  splitCompleted(sortedFiltered: PatientType[]) {
    const active = sortedFiltered.filter((p) => !this.isCompletedPatient(p));
    const completed = sortedFiltered
      .filter((p) => this.isCompletedPatient(p))
      .sort((a, b) => {
        const ea = new Date((a as any).rehab_end_date ?? (a as any).created_at ?? 0).getTime();
        const eb = new Date((b as any).rehab_end_date ?? (b as any).created_at ?? 0).getTime();
        return eb - ea;
      });

    return { active, completed };
  }
}
