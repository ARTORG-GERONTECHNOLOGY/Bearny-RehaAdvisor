import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';
import config from '../config/config.json';

export interface SelectOption {
  value: string;
  label: string;
}

// ---- date helpers ----
export const toDateInput = (v: any) => {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export const toDisplayDate = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString();
};

// ---- FE sanitization ----
const sanitize = (v: any): any => {
  if (typeof v === 'string') {
    const cleaned = v.replace(/[<>]/g, '').trim();
    return cleaned.slice(0, 500);
  }
  if (Array.isArray(v)) {
    return v
      .map((item) => (typeof item === 'string' ? sanitize(item) : item))
      .filter((item) => item !== '' && item !== null && item !== undefined);
  }
  return v;
};

const FORBIDDEN_KEYS = [
  'pwdhash',
  'access_word',
  'userId',
  'therapist',
  'role',
  'createdAt',
  'updatedAt',
  'id',
  '_id',
  'last_online',
  'last_online_contact',
];

export type PatientPopupTab = 'profile' | 'characteristics';

export class PatientPopupStore {
  patientId: string;

  loading = true;
  isEditing = false;

  formData: Record<string, any> = {};
  error = '';

  showConfirmDelete = false;
  activeTab: PatientPopupTab = 'profile';

  specialityDiagnosisMap: Record<string, string[]> = (config as any).patientInfo.functionPat || {};

  constructor(patientId: string) {
    this.patientId = patientId;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setActiveTab(tab: PatientPopupTab) {
    this.activeTab = tab;
  }

  setEditing(v: boolean) {
    this.isEditing = v;
    if (!v) this.error = '';
  }

  setError(v: string) {
    this.error = v;
  }

  setShowConfirmDelete(v: boolean) {
    this.showConfirmDelete = v;
  }

  setField(id: string, value: any) {
    this.formData = { ...this.formData, [id]: value };
  }

  setMultiSelect(fieldName: string, selectedOptions: readonly SelectOption[] | null) {
    const selectedValues = selectedOptions?.map((option) => option.value) || [];
    this.formData = { ...this.formData, [fieldName]: selectedValues };
  }

  setCommaSeparated(id: string, value: string) {
    const list = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    this.formData = { ...this.formData, [id]: list };
  }

  arrayToDisplay(arr: any) {
    return Array.isArray(arr) ? arr.join(', ') : '';
  }

  async fetchPatientData(t: (key: string) => string) {
    try {
      this.loading = true;
      const response = await apiClient.get(`users/${this.patientId}/profile/`);
      const fetchedData = response.data || {};
      const normalizedData: Record<string, any> = {};

      (config as any).PatientForm.forEach((section: any) =>
        section.fields.forEach((field: any) => {
          const key = field.be_name;
          const defaultValue = field.type === 'multi-select' ? [] : '';
          normalizedData[key] = fetchedData[key] !== undefined ? fetchedData[key] : defaultValue;
        })
      );

      const withExtras = {
        ...normalizedData,
        ...fetchedData,
        clinic: fetchedData.clinic ?? '',
        last_clinic_visit: fetchedData.last_clinic_visit ?? '',
        last_online_contact: fetchedData.last_online ?? '',
        level_of_education: fetchedData.level_of_education ?? '',
        professional_status: fetchedData.professional_status ?? '',
        marital_status: fetchedData.marital_status ?? '',
        lifestyle: Array.isArray(fetchedData.lifestyle) ? fetchedData.lifestyle : [],
        personal_goals: Array.isArray(fetchedData.personal_goals) ? fetchedData.personal_goals : [],
        social_support: Array.isArray(fetchedData.social_support) ? fetchedData.social_support : [],
      };

      runInAction(() => {
        this.formData = withExtras;
        this.error = '';
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error fetching patient data:', err);
      runInAction(() => {
        this.error = t('Failed to fetch patient data. Please try again later.');
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  validateInputs(t: (key: string, opts?: any) => string): boolean {
    const d = this.formData;

    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
      this.error = t('Invalid email format.');
      return false;
    }

    if (d.phone && !/^\+?[0-9]{7,15}$/.test(d.phone)) {
      this.error = t('Invalid phone number format.');
      return false;
    }

    if (d.birthdate) {
      const bd = new Date(d.birthdate);
      if (Number.isNaN(bd.getTime())) {
        this.error = t('Invalid birthdate format.');
        return false;
      }
      if (bd > new Date()) {
        this.error = t('Birthdate cannot be in the future.');
        return false;
      }
    }

    const numericFields = ['height', 'weight', 'bmi'];
    for (const key of numericFields) {
      if (d[key] !== undefined && d[key] !== null && d[key] !== '') {
        if (Number.isNaN(Number(d[key]))) {
          this.error = t('Invalid number entered.');
          return false;
        }
      }
    }

    const maxLengths: Record<string, number> = {
      first_name: 100,
      name: 100,
      clinic: 200,
      level_of_education: 200,
      professional_status: 200,
      marital_status: 200,
      restrictions: 2000,
    };

    for (const [key, maxLen] of Object.entries(maxLengths)) {
      const v = d[key];
      if (typeof v === 'string' && v.length > maxLen) {
        this.error = t('Text is too long for field {{field}}', { field: t(key) });
        return false;
      }
    }

    for (const key of Object.keys(d)) {
      if (Array.isArray(d[key])) {
        const arr = d[key] as any[];
        if (arr.some((v) => v === '' || v === null || v === undefined)) {
          this.error = t('Multi-select fields contain invalid or empty entries.');
          return false;
        }
      }
    }

    this.error = '';
    return true;
  }

  async save(t: (key: string) => string) {
    if (!this.validateInputs(t as any)) return;

    try {
      const rawPayload: Record<string, any> = { ...this.formData };
      FORBIDDEN_KEYS.forEach((k) => delete rawPayload[k]);

      const payload: Record<string, any> = {};
      Object.keys(rawPayload).forEach((k) => {
        payload[k] = sanitize(rawPayload[k]);
      });

      await apiClient.put(`users/${this.patientId}/profile/`, payload);

      runInAction(() => {
        this.isEditing = false;
      });

      await this.fetchPatientData(t);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error updating patient data:', err);
      runInAction(() => {
        this.error = t('Failed to update patient data. Please try again.');
      });
    }
  }

  async deletePatient(t: (key: string) => string) {
    try {
      await apiClient.delete(`users/${this.patientId}/profile/`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error deleting patient:', err);
      runInAction(() => {
        this.error = t('Failed to delete patient. Please try again.');
      });
      return false;
    }
    return true;
  }
}
