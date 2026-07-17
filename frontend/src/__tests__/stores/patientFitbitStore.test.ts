import { patientFitbitStore, mergeThresholds } from '@/stores/patientFitbitStore';
import apiClient from '@/api/client';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

describe('mergeThresholds', () => {
  it('fills in defaults for missing fields', () => {
    const merged = mergeThresholds({ steps_goal: 5000 });
    expect(merged.steps_goal).toBe(5000);
    expect(merged.sleep_green_min).toBe(7 * 60);
  });

  it('returns all defaults when given nothing', () => {
    const merged = mergeThresholds();
    expect(merged.steps_goal).toBe(10000);
    expect(merged.bp_dia_yellow_max).toBe(89);
  });
});

describe('patientFitbitStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    patientFitbitStore.connected = null;
    patientFitbitStore.statusLoading = false;
    patientFitbitStore.summary = null;
    patientFitbitStore.summaryLoading = false;
    patientFitbitStore.error = '';
    (patientFitbitStore as any).needsReconnect = false;
    (patientFitbitStore as any).daysUntilExpiry = null;
  });

  // ------------------------------------------------------------------
  // clearError
  // ------------------------------------------------------------------
  describe('clearError', () => {
    it('resets the error message', () => {
      patientFitbitStore.error = 'oops';
      patientFitbitStore.clearError();
      expect(patientFitbitStore.error).toBe('');
    });
  });

  // ------------------------------------------------------------------
  // fetchStatus
  // ------------------------------------------------------------------
  describe('fetchStatus', () => {
    it('requests and stores the connected status', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: { connected: true } });
      await patientFitbitStore.fetchStatus('p1');
      expect(apiClient.get).toHaveBeenCalledWith('/google-health/status/p1/');
      expect(patientFitbitStore.connected).toBe(true);
      expect(patientFitbitStore.statusLoading).toBe(false);
    });

    it('coerces a missing/falsy connected field to false', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: {} });
      await patientFitbitStore.fetchStatus('p1');
      expect(patientFitbitStore.connected).toBe(false);
    });

    it('sets statusLoading only when connected is unknown', async () => {
      let sawLoadingDuringFetch: boolean | undefined;
      (apiClient.get as jest.Mock).mockImplementationOnce(async () => {
        sawLoadingDuringFetch = patientFitbitStore.statusLoading;
        return { data: { connected: true } };
      });
      await patientFitbitStore.fetchStatus('p1');
      expect(sawLoadingDuringFetch).toBe(true);
    });

    it('does not show a loading state when connected is already known', async () => {
      patientFitbitStore.connected = true;
      let sawLoadingDuringFetch: boolean | undefined;
      (apiClient.get as jest.Mock).mockImplementationOnce(async () => {
        sawLoadingDuringFetch = patientFitbitStore.statusLoading;
        return { data: { connected: true } };
      });
      await patientFitbitStore.fetchStatus('p1');
      expect(sawLoadingDuringFetch).toBe(false);
    });

    it('treats a failed request as disconnected', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      await patientFitbitStore.fetchStatus('p1');
      expect(patientFitbitStore.connected).toBe(false);
      expect(patientFitbitStore.statusLoading).toBe(false);
    });

    // reconnect-banner fields
    it('sets needsReconnect=false and daysUntilExpiry=7 for a fresh connection', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { connected: true, needs_reconnect: false, days_until_expiry: 7 },
      });
      await patientFitbitStore.fetchStatus('p1');
      expect(patientFitbitStore.needsReconnect).toBe(false);
      expect(patientFitbitStore.daysUntilExpiry).toBe(7);
    });

    it('sets needsReconnect=true and daysUntilExpiry=1 at day 6', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { connected: true, needs_reconnect: true, days_until_expiry: 1 },
      });
      await patientFitbitStore.fetchStatus('p1');
      expect(patientFitbitStore.needsReconnect).toBe(true);
      expect(patientFitbitStore.daysUntilExpiry).toBe(1);
    });

    it('sets daysUntilExpiry=0 when token has expired', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { connected: true, needs_reconnect: true, days_until_expiry: 0 },
      });
      await patientFitbitStore.fetchStatus('p1');
      expect(patientFitbitStore.needsReconnect).toBe(true);
      expect(patientFitbitStore.daysUntilExpiry).toBe(0);
    });

    it('sets daysUntilExpiry=null when API omits the field (legacy token)', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { connected: true, needs_reconnect: false },
      });
      await patientFitbitStore.fetchStatus('p1');
      expect(patientFitbitStore.needsReconnect).toBe(false);
      expect(patientFitbitStore.daysUntilExpiry).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // fetchSummary
  // ------------------------------------------------------------------
  describe('fetchSummary', () => {
    const summaryPayload = { connected: true, last_sync: null, period: { days: 7, daily: [] } };

    it('requests the summary with the given day count', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: summaryPayload });
      await patientFitbitStore.fetchSummary('p1', 14);
      expect(apiClient.get).toHaveBeenCalledWith('/google-health/summary/p1/', { params: { days: 14 } });
      expect(patientFitbitStore.summary).toEqual(summaryPayload);
    });

    it('defaults to 7 days', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: summaryPayload });
      await patientFitbitStore.fetchSummary('p1');
      expect(apiClient.get).toHaveBeenCalledWith('/google-health/summary/p1/', { params: { days: 7 } });
    });

    it('caches the summary in sessionStorage after a successful fetch', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: summaryPayload });
      await patientFitbitStore.fetchSummary('p1', 7);

      const raw = sessionStorage.getItem('patientFitbitStore');
      const parsed = JSON.parse(raw!);
      expect(parsed['p1_7']).toEqual(summaryPayload);
    });

    it('serves cached data immediately, then replaces it with the fresh response', async () => {
      sessionStorage.setItem(
        'patientFitbitStore',
        JSON.stringify({ p1_7: { ...summaryPayload, last_sync: 'cached' } })
      );

      let sawDuringFetch: any;
      (apiClient.get as jest.Mock).mockImplementationOnce(async () => {
        sawDuringFetch = patientFitbitStore.summary;
        return { data: { ...summaryPayload, last_sync: 'fresh' } };
      });

      await patientFitbitStore.fetchSummary('p1', 7);

      expect(sawDuringFetch).toEqual(expect.objectContaining({ last_sync: 'cached' }));
      expect(patientFitbitStore.summary).toEqual(expect.objectContaining({ last_sync: 'fresh' }));
    });

    it('does not show a loading state when serving cached data (and not forcing)', async () => {
      sessionStorage.setItem('patientFitbitStore', JSON.stringify({ p1_7: summaryPayload }));

      let sawLoadingDuringFetch: boolean | undefined;
      (apiClient.get as jest.Mock).mockImplementationOnce(async () => {
        sawLoadingDuringFetch = patientFitbitStore.summaryLoading;
        return { data: summaryPayload };
      });

      await patientFitbitStore.fetchSummary('p1', 7);

      expect(sawLoadingDuringFetch).toBe(false);
    });

    it('shows a loading state when forcing a refresh even if cached data exists', async () => {
      sessionStorage.setItem('patientFitbitStore', JSON.stringify({ p1_7: summaryPayload }));

      let sawLoadingDuringFetch: boolean | undefined;
      (apiClient.get as jest.Mock).mockImplementationOnce(async () => {
        sawLoadingDuringFetch = patientFitbitStore.summaryLoading;
        return { data: summaryPayload };
      });

      await patientFitbitStore.fetchSummary('p1', 7, true);

      expect(sawLoadingDuringFetch).toBe(true);
    });

    it('sets a generic error and clears the summary on failure when nothing was cached', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      await patientFitbitStore.fetchSummary('p1', 7);
      expect(patientFitbitStore.summary).toBeNull();
      expect(patientFitbitStore.error).toBe('error_f');
      expect(patientFitbitStore.summaryLoading).toBe(false);
    });

    it('keeps serving cached data on failure without setting an error', async () => {
      sessionStorage.setItem('patientFitbitStore', JSON.stringify({ p1_7: summaryPayload }));
      (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      await patientFitbitStore.fetchSummary('p1', 7);

      expect(patientFitbitStore.summary).toEqual(summaryPayload);
      expect(patientFitbitStore.error).toBe('');
    });
  });

  // ------------------------------------------------------------------
  // refresh
  // ------------------------------------------------------------------
  describe('refresh', () => {
    it('fetches status first when connected is unknown, then the summary', async () => {
      (apiClient.get as jest.Mock)
        .mockResolvedValueOnce({ data: { connected: true } }) // status
        .mockResolvedValueOnce({ data: { period: { days: 7, daily: [] } } }); // summary

      await patientFitbitStore.refresh('p1');

      expect(apiClient.get).toHaveBeenNthCalledWith(1, '/google-health/status/p1/');
      expect(apiClient.get).toHaveBeenNthCalledWith(2, '/google-health/summary/p1/', {
        params: { days: 7 },
      });
    });

    it('skips fetchStatus when connected is already known', async () => {
      patientFitbitStore.connected = true;
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { period: { days: 7, daily: [] } },
      });

      await patientFitbitStore.refresh('p1');

      expect(apiClient.get).toHaveBeenCalledTimes(1);
      expect(apiClient.get).toHaveBeenCalledWith('/google-health/summary/p1/', { params: { days: 7 } });
    });
  });

  // ------------------------------------------------------------------
  // submitManualSteps
  // ------------------------------------------------------------------
  describe('submitManualSteps', () => {
    it('posts the manual step entry and force-refreshes the summary', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({});
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { period: { days: 7, daily: [] } },
      });

      await patientFitbitStore.submitManualSteps('p1', '2026-01-05', 4200);

      expect(apiClient.post).toHaveBeenCalledWith('/google-health/manual_steps/p1/', {
        date: '2026-01-05',
        steps: 4200,
      });
      expect(apiClient.get).toHaveBeenCalledWith('/google-health/summary/p1/', { params: { days: 7 } });
    });

    it('clears any existing error before submitting', async () => {
      patientFitbitStore.error = 'stale';
      (apiClient.post as jest.Mock).mockResolvedValueOnce({});
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: {} });

      const submitPromise = patientFitbitStore.submitManualSteps('p1', '2026-01-05', 100);
      expect(patientFitbitStore.error).toBe('');
      await submitPromise;
    });
  });

  // ------------------------------------------------------------------
  // disconnect
  // ------------------------------------------------------------------
  describe('disconnect', () => {
    it('calls DELETE /fitbit/disconnect/', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValueOnce({});
      await patientFitbitStore.disconnect();
      expect(apiClient.delete).toHaveBeenCalledWith('/fitbit/disconnect/');
    });

    it('sets connected to false after a successful disconnect', async () => {
      patientFitbitStore.connected = true;
      (apiClient.delete as jest.Mock).mockResolvedValueOnce({});
      await patientFitbitStore.disconnect();
      expect(patientFitbitStore.connected).toBe(false);
    });

    it('clears the cached summary after a successful disconnect', async () => {
      patientFitbitStore.summary = {
        connected: true,
        last_sync: null,
        period: { days: 7, daily: [] },
      };
      (apiClient.delete as jest.Mock).mockResolvedValueOnce({});
      await patientFitbitStore.disconnect();
      expect(patientFitbitStore.summary).toBeNull();
    });

    it('clears any existing error before the request', async () => {
      patientFitbitStore.error = 'stale';
      (apiClient.delete as jest.Mock).mockResolvedValueOnce({});
      const p = patientFitbitStore.disconnect();
      expect(patientFitbitStore.error).toBe('');
      await p;
    });

    it('propagates errors so the caller can handle them', async () => {
      (apiClient.delete as jest.Mock).mockRejectedValueOnce(new Error('network'));
      await expect(patientFitbitStore.disconnect()).rejects.toThrow('network');
    });
  });
});
