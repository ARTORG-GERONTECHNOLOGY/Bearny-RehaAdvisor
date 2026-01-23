import { makeAutoObservable, runInAction } from 'mobx';
import authStore from './authStore';

const SELECTED_DATE_KEY = 'patient_selected_date';

const readSelectedDate = () => {
  const raw = localStorage.getItem(SELECTED_DATE_KEY);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const writeSelectedDate = (d: Date) => {
  try {
    localStorage.setItem(SELECTED_DATE_KEY, d.toISOString());
  } catch {}
};

class PatientViewStore {
  loading = true;
  error = '';
  selectedDate: Date = new Date();

  constructor() {
    makeAutoObservable(this);

    const stored = readSelectedDate();
    if (stored) this.selectedDate = stored;
  }

  setSelectedDate = (d: Date) => {
    this.selectedDate = d;
    writeSelectedDate(d);
  };

  setError = (msg: string) => {
    this.error = msg;
  };

  clearError = () => {
    this.error = '';
  };

  init = async (opts: { fitbitStatus?: string | null; navigate: (to: string) => void }) => {
    this.loading = true;
    this.clearError();

    try {
      await authStore.checkAuthentication();

      if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
        opts.navigate('/');
        return;
      }

      if (opts.fitbitStatus === 'error') {
        this.setError('Fitbit connection failed.');
      }
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  };
}

const patientViewStore = new PatientViewStore();
export default patientViewStore;
