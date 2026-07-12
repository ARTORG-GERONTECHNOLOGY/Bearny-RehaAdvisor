import { HealthPageStore } from '@/stores/healthPageStore';
import apiClient from '@/api/client';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

const t = (key: string) => key;

describe('HealthPageStore', () => {
  let store: HealthPageStore;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    store = new HealthPageStore();
  });

  // ------------------------------------------------------------------
  // simple setters
  // ------------------------------------------------------------------
  describe('setters', () => {
    it('setViewMode updates viewMode', () => {
      store.setViewMode('weekly');
      expect(store.viewMode).toBe('weekly');
    });

    it('setReferenceDate updates referenceDate', () => {
      const d = new Date(2026, 0, 1);
      store.setReferenceDate(d);
      expect(store.referenceDate).toBe(d);
    });

    it('setError / clearError', () => {
      store.setError('oops');
      expect(store.error).toBe('oops');
      store.clearError();
      expect(store.error).toBe('');
    });
  });

  // ------------------------------------------------------------------
  // goPrev / goNext
  // ------------------------------------------------------------------
  describe('goPrev / goNext', () => {
    it('moves back/forward 7 days in weekly mode', () => {
      store.setViewMode('weekly');
      store.setReferenceDate(new Date(2026, 0, 15));
      store.goPrev();
      expect(store.referenceDate.toDateString()).toBe(new Date(2026, 0, 8).toDateString());

      store.goNext();
      store.goNext();
      expect(store.referenceDate.toDateString()).toBe(new Date(2026, 0, 22).toDateString());
    });

    it('moves back/forward one month in monthly mode', () => {
      store.setViewMode('monthly');
      store.setReferenceDate(new Date(2026, 0, 15));
      store.goPrev();
      expect(store.referenceDate.getMonth()).toBe(11); // December
      expect(store.referenceDate.getFullYear()).toBe(2025);

      store.goNext();
      store.goNext();
      expect(store.referenceDate.getMonth()).toBe(1); // February
      expect(store.referenceDate.getFullYear()).toBe(2026);
    });
  });

  // ------------------------------------------------------------------
  // date range getters
  // ------------------------------------------------------------------
  describe('date range getters', () => {
    it('computes a Monday-start week for weekly mode', () => {
      store.setViewMode('weekly');
      store.setReferenceDate(new Date(2026, 0, 1)); // Thursday
      expect(store.startDate.toDateString()).toBe(new Date(2025, 11, 29).toDateString());
      expect(store.endDate.toDateString()).toBe(new Date(2026, 0, 4).toDateString());
    });

    it('handles a reference date that already falls on Sunday', () => {
      store.setViewMode('weekly');
      store.setReferenceDate(new Date(2026, 0, 4)); // Sunday
      expect(store.startDate.toDateString()).toBe(new Date(2025, 11, 29).toDateString());
      expect(store.endDate.toDateString()).toBe(new Date(2026, 0, 4).toDateString());
    });

    it('computes the full calendar month for monthly mode', () => {
      store.setViewMode('monthly');
      store.setReferenceDate(new Date(2026, 0, 15));
      expect(store.startDate.toDateString()).toBe(new Date(2026, 0, 1).toDateString());
      expect(store.endDate.toDateString()).toBe(new Date(2026, 0, 31).toDateString());
    });

    it('viewStart/viewEnd alias startDate/endDate', () => {
      store.setReferenceDate(new Date(2026, 0, 15));
      expect(store.viewStart.toDateString()).toBe(store.startDate.toDateString());
      expect(store.viewEnd.toDateString()).toBe(store.endDate.toDateString());
    });
  });

  // ------------------------------------------------------------------
  // fetchThresholds
  // ------------------------------------------------------------------
  describe('fetchThresholds', () => {
    it('is a no-op without a patientId', async () => {
      await store.fetchThresholds('', t);
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('normalizes a flat thresholds response', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { steps_goal: 8000, bp_sys_green_max: 120 },
      });

      await store.fetchThresholds('p1', t);

      expect(apiClient.get).toHaveBeenCalledWith('/patients/p1/thresholds/');
      expect(store.thresholds.steps_goal).toBe(8000);
      expect(store.thresholds.bp_sys_green_max).toBe(120);
      // Unspecified fields fall back to defaults
      expect(store.thresholds.sleep_green_min).toBe(7 * 60);
      expect(store.thresholdsLoading).toBe(false);
      expect(store.thresholdsError).toBeNull();
    });

    it('normalizes a nested { thresholds: {...} } response', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { thresholds: { steps_goal: 5000 }, history: [] },
      });

      await store.fetchThresholds('p1', t);

      expect(store.thresholds.steps_goal).toBe(5000);
    });

    it('coerces numeric strings and falls back on invalid values', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { steps_goal: '12000', active_minutes_green: 'not-a-number' },
      });

      await store.fetchThresholds('p1', t);

      expect(store.thresholds.steps_goal).toBe(12000);
      expect(store.thresholds.active_minutes_green).toBe(30); // default
    });

    it('falls back to defaults for a null/undefined response body', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: null });
      await store.fetchThresholds('p1', t);
      expect(store.thresholds.steps_goal).toBe(10000);
    });

    it('sets an error message and keeps existing thresholds on failure', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce({
        response: { data: { error: 'Not found' } },
      });

      await store.fetchThresholds('p1', t);

      expect(store.thresholdsError).toBe('Not found');
      expect(store.thresholds.steps_goal).toBe(10000);
      expect(store.thresholdsLoading).toBe(false);
    });

    it('falls back to the translated default error message', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce({});
      await store.fetchThresholds('p1', t);
      expect(store.thresholdsError).toBe('Failed to load thresholds.');
    });
  });

  // ------------------------------------------------------------------
  // fetchCombinedHistoryForPatient
  // ------------------------------------------------------------------
  describe('fetchCombinedHistoryForPatient', () => {
    it('is a no-op without a patientId', async () => {
      await store.fetchCombinedHistoryForPatient('', '2026-01-01', '2026-01-31');
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('requests combined history with the from/to params', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: {} });
      await store.fetchCombinedHistoryForPatient('p1', '2026-01-01', '2026-01-31', t);
      expect(apiClient.get).toHaveBeenCalledWith('/patients/health-combined-history/p1/', {
        params: { from: '2026-01-01', to: '2026-01-31' },
      });
    });

    it('normalizes a plain array fitbit exercise shape by wrapping it in sessions', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { fitbit: [{ date: '2026-01-01', exercise: [{ id: 1 }] }] },
      });

      await store.fetchCombinedHistoryForPatient('p1', 'a', 'b', t);

      expect((store.fitbitData[0] as any).exercise).toEqual({ sessions: [{ id: 1 }] });
    });

    it('normalizes a { sessions: [...] } fitbit exercise shape', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { fitbit: [{ exercise: { sessions: [{ id: 2 }] } }] },
      });

      await store.fetchCombinedHistoryForPatient('p1', 'a', 'b', t);

      expect((store.fitbitData[0] as any).exercise).toEqual({ sessions: [{ id: 2 }] });
    });

    it('defaults exercise to empty sessions for missing/unknown shapes', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { fitbit: [{ exercise: 'garbage' }] },
      });

      await store.fetchCombinedHistoryForPatient('p1', 'a', 'b', t);

      expect((store.fitbitData[0] as any).exercise).toEqual({ sessions: [] });
    });

    it('drops non-object entries from the fitbit list', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { fitbit: [{ date: '2026-01-01' }, 'garbage', null] },
      });

      await store.fetchCombinedHistoryForPatient('p1', 'a', 'b', t);

      expect(store.fitbitData).toHaveLength(1);
    });

    it('normalizes questionnaire and adherence arrays, defaulting to [] when absent', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { questionnaire: [{ id: 'q1' }], adherence: [{ id: 'a1' }] },
      });

      await store.fetchCombinedHistoryForPatient('p1', 'a', 'b', t);

      expect(store.questionnaireData).toEqual([{ id: 'q1' }]);
      expect(store.adherenceData).toEqual([{ id: 'a1' }]);
    });

    it('defaults all three datasets to [] for a non-object payload', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: null });
      await store.fetchCombinedHistoryForPatient('p1', 'a', 'b', t);
      expect(store.fitbitData).toEqual([]);
      expect(store.questionnaireData).toEqual([]);
      expect(store.adherenceData).toEqual([]);
    });

    it('caches the normalized result in sessionStorage keyed by patient+range', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { fitbit: [{ id: 'f1' }] },
      });

      await store.fetchCombinedHistoryForPatient('p1', '2026-01-01', '2026-01-31', t);

      const raw = sessionStorage.getItem('healthPageStore');
      const parsed = JSON.parse(raw!);
      expect(parsed['p1_2026-01-01_2026-01-31'].fitbitData).toHaveLength(1);
    });

    it('serves cached data instantly (without a loading flash) while the fresh fetch is in flight', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { fitbit: [{ id: 'f1' }] },
      });
      await store.fetchCombinedHistoryForPatient('p1', '2026-01-01', '2026-01-31', t);

      const freshStore = new HealthPageStore();
      let sawLoadingDuringFetch: boolean | undefined;
      let sawFitbitDuringFetch: unknown;
      (apiClient.get as jest.Mock).mockImplementationOnce(async () => {
        sawLoadingDuringFetch = freshStore.loading;
        sawFitbitDuringFetch = freshStore.fitbitData;
        return { data: { fitbit: [{ id: 'f2' }] } };
      });

      await freshStore.fetchCombinedHistoryForPatient('p1', '2026-01-01', '2026-01-31', t);

      // Cached data is applied synchronously before the request resolves...
      expect(sawLoadingDuringFetch).toBe(false);
      expect(sawFitbitDuringFetch).toHaveLength(1);
      // ...and is then replaced by the fresh response once it lands.
      expect(freshStore.fitbitData[0]).toEqual(expect.objectContaining({ id: 'f2' }));
    });

    it('sets loading while fetching when nothing is cached', async () => {
      let sawLoadingDuringFetch: boolean | undefined;
      (apiClient.get as jest.Mock).mockImplementationOnce(async () => {
        sawLoadingDuringFetch = store.loading;
        return { data: {} };
      });

      await store.fetchCombinedHistoryForPatient('p1', 'a', 'b', t);

      expect(sawLoadingDuringFetch).toBe(true);
      expect(store.loading).toBe(false);
    });

    it('resets all datasets and sets an error message on failure', async () => {
      store.fitbitData = [{ id: 'stale' } as any];
      (apiClient.get as jest.Mock).mockRejectedValueOnce({
        response: { data: { error: 'Server exploded' } },
      });

      await store.fetchCombinedHistoryForPatient('p1', 'a', 'b', t);

      expect(store.fitbitData).toEqual([]);
      expect(store.questionnaireData).toEqual([]);
      expect(store.adherenceData).toEqual([]);
      expect(store.error).toBe('Server exploded');
      expect(store.loading).toBe(false);
    });

    it('falls back to the translated default error message', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce({});
      await store.fetchCombinedHistoryForPatient('p1', 'a', 'b', t);
      expect(store.error).toBe('Failed to load health data.');
    });

    it('uses the identity default translator when none is provided', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce({});
      await store.fetchCombinedHistoryForPatient('p1', 'a', 'b');
      expect(store.error).toBe('Failed to load health data.');
    });
  });
});
