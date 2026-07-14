import { makeAutoObservable, runInAction } from 'mobx';
import * as Sentry from '@sentry/react';
import apiClient from '@/api/client';
import { toLocalYMD } from '@/utils/dateFormat';
import { getApiErrorMessage } from '@/utils/apiErrorMessages';

type ExistsResp = { exists: boolean };

class PatientVitalsStore {
  loading = false;
  exists = false;
  error = '';
  successMsg = '';
  posting = false;

  today = toLocalYMD(new Date());

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
        this.error = "Failed to check today's vitals.";
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async submit(
    userId: string,
    payload: { weight_kg?: number | null; bp_sys?: number | null; bp_dia?: number | null },
    date?: string
  ) {
    this.posting = true;
    this.clearMessages();
    try {
      await apiClient.post(`/patients/vitals/manual/${userId}/`, {
        date: date ? new Date(date).toISOString() : new Date().toISOString(),
        weight_kg: payload.weight_kg ?? null,
        bp_sys: payload.bp_sys ?? null,
        bp_dia: payload.bp_dia ?? null,
      });

      runInAction(() => {
        this.successMsg = "Today's vitals were saved successfully.";
        this.exists = true; // hide prompt after saving
      });
    } catch (e: any) {
      Sentry.captureException(e, { extra: { context: 'patientVitalsStore.submit', userId } });
      runInAction(() => {
        this.error = getApiErrorMessage(e, "Failed to save today's vitals. Please try again.");
      });
    } finally {
      runInAction(() => {
        this.posting = false;
      });
    }
  }
}

export const patientVitalsStore = new PatientVitalsStore();
