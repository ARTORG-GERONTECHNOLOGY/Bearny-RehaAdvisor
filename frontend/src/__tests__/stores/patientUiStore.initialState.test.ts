// patientUiStore's `selectedDate`/`viewMode` fields are initialized once, at module import
// time, from localStorage. The main test file always imports the (already-constructed)
// singleton, so it can never exercise the "localStorage already has a valid saved value"
// branches of readSelectedDate/readViewMode. Pre-populating localStorage before a delayed
// `require()` (module imports are hoisted, so a normal `import` would run too early) lets
// this file cover those constructor-time code paths.
describe('patientUiStore initial state read from localStorage', () => {
  afterEach(() => {
    localStorage.clear();
    jest.resetModules();
  });

  it('restores a previously saved valid selected date and week view mode', () => {
    localStorage.setItem('patient_selected_date', '2026-02-14T00:00:00.000Z');
    localStorage.setItem('patient_view_mode', 'week');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { patientUiStore } = require('@/stores/patientUiStore');

    expect(patientUiStore.selectedDate).toEqual(new Date('2026-02-14T00:00:00.000Z'));
    expect(patientUiStore.viewMode).toBe('week');
  });

  it('falls back to now when the saved selected date is invalid', () => {
    localStorage.setItem('patient_selected_date', 'not-a-date');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { patientUiStore } = require('@/stores/patientUiStore');

    expect(patientUiStore.selectedDate).toBeInstanceOf(Date);
    expect(Number.isNaN(patientUiStore.selectedDate.getTime())).toBe(false);
  });
});
