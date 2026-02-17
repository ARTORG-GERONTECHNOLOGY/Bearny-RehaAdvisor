import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';

type ExistsResp = { exists: boolean };

function isoLocalDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

class PatientVitalsStore {
  loading = false;
  exists = false;
  error = '';
  successMsg = '';
  posting = false;

  today = isoLocalDate();

  constructor() {
    makeAutoObservable(this);
  }

  clearMessages() {
    this.error = '';
    this.successMsg = '';
  }

  async checkExists(userId: string) {
    this.loading = true;
    this.clearMessages();

    try {
      const r = await apiClient.get<ExistsResp>(`/patients/vitals/exists/${userId}/`, {
        params: { date: this.today },
      });
      runInAction(() => {
        this.exists = !!r.data?.exists;
      });
    } catch {
      runInAction(() => {
        this.error = 'Failed to check today’s vitals.';
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async submit(
    userId: string,
    payload: { weight_kg?: number | null; bp_sys?: number | null; bp_dia?: number | null }
  ) {
    this.posting = true;
    this.clearMessages();
    try {
      await apiClient.post(`/patients/vitals/manual/${userId}/`, {
        date: new Date().toISOString(),
        weight_kg: payload.weight_kg ?? null,
        bp_sys: payload.bp_sys ?? null,
        bp_dia: payload.bp_dia ?? null,
      });

      runInAction(() => {
        this.successMsg = 'Today’s vitals were saved successfully.';
        this.exists = true; // hide prompt after saving
      });
    } catch (e: any) {
      runInAction(() => {
        this.error = e?.response?.data?.error || 'Failed to save today’s vitals. Please try again.';
      });
    } finally {
      runInAction(() => {
        this.posting = false;
      });
    }
  }
}

export const patientVitalsStore = new PatientVitalsStore();
