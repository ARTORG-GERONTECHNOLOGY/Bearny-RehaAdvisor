import { makeAutoObservable } from 'mobx';

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
  } catch (_e) {
    // ignore storage write failures (e.g., privacy mode, quota exceeded)
  }
};

class PatientUiStore {
  selectedDate: Date = readSelectedDate() || new Date();
  viewMode: 'day' | 'week' = 'day';

  constructor() {
    makeAutoObservable(this);
  }

  setSelectedDate(d: Date) {
    this.selectedDate = d;
    writeSelectedDate(d);
  }

  setViewMode(m: 'day' | 'week') {
    this.viewMode = m;
  }

  goToday() {
    this.setSelectedDate(new Date());
  }
}

export const patientUiStore = new PatientUiStore();
