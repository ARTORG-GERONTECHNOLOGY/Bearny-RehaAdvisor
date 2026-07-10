import { patientUiStore } from '@/stores/patientUiStore';

describe('patientUiStore', () => {
  beforeEach(() => {
    localStorage.clear();
    patientUiStore.setViewMode('day');
    patientUiStore.setSelectedDate(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('defaults to day view mode', () => {
    expect(patientUiStore.viewMode).toBe('day');
  });

  it('sets and persists the selected date', () => {
    const date = new Date('2026-03-15T00:00:00.000Z');
    patientUiStore.setSelectedDate(date);

    expect(patientUiStore.selectedDate).toEqual(date);
    expect(localStorage.getItem('patient_selected_date')).toBe(date.toISOString());
  });

  it('ignores invalid dates', () => {
    const before = patientUiStore.selectedDate;
    patientUiStore.setSelectedDate(new Date('not-a-date'));
    expect(patientUiStore.selectedDate).toBe(before);
  });

  it('sets and persists the view mode', () => {
    patientUiStore.setViewMode('week');
    expect(patientUiStore.viewMode).toBe('week');
    expect(localStorage.getItem('patient_view_mode')).toBe('week');
  });

  it('goToday sets the selected date to now', () => {
    const now = new Date('2026-05-20T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now.getTime());

    patientUiStore.goToday();

    expect(patientUiStore.selectedDate).toEqual(now);
    jest.useRealTimers();
  });
});
