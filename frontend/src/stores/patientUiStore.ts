// src/stores/patientUiStore.ts
import { makeAutoObservable } from 'mobx';

const SELECTED_DATE_KEY = 'patient_selected_date';
const VIEW_MODE_KEY = 'patient_view_mode';

const readSelectedDate = () => {
  const raw = localStorage.getItem(SELECTED_DATE_KEY);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const writeSelectedDate = (d: Date) => {
  try {
    localStorage.setItem(SELECTED_DATE_KEY, d.toISOString());
  } catch {
    // ignore
  }
};

const readViewMode = (): 'day' | 'week' => {
  const raw = localStorage.getItem(VIEW_MODE_KEY);
  return raw === 'week' ? 'week' : 'day';
};

const writeViewMode = (m: 'day' | 'week') => {
  try {
    localStorage.setItem(VIEW_MODE_KEY, m);
  } catch {
    // ignore
  }
};

class PatientUiStore {
  selectedDate: Date = readSelectedDate() || new Date();
  viewMode: 'day' | 'week' = readViewMode();

  constructor() {
    makeAutoObservable(this);
  }

  setSelectedDate(d: Date) {
    const nd = d instanceof Date ? d : new Date(d as any);
    if (Number.isNaN(nd.getTime())) return;
    this.selectedDate = nd;
    writeSelectedDate(nd);
  }

  setViewMode(m: 'day' | 'week') {
    this.viewMode = m;
    writeViewMode(m);
  }

  goToday() {
    this.setSelectedDate(new Date());
  }
}

export const patientUiStore = new PatientUiStore();