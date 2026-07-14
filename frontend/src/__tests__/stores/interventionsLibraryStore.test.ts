import { InterventionsLibraryStore } from '@/stores/interventionsLibraryStore';
import apiClient from '@/api/client';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

describe('InterventionsLibraryStore', () => {
  let store: InterventionsLibraryStore;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    store = new InterventionsLibraryStore('test-library-store');
  });

  // ------------------------------------------------------------------
  // session persistence
  // ------------------------------------------------------------------
  describe('session persistence', () => {
    it('loads items from sessionStorage on construction', () => {
      sessionStorage.setItem(
        'preloaded-key',
        JSON.stringify({ items: [{ id: '1', title: 'Cached' }] })
      );
      const preloaded = new InterventionsLibraryStore('preloaded-key');
      expect(preloaded.items).toEqual([{ id: '1', title: 'Cached' }]);
    });

    it('starts empty when there is nothing cached', () => {
      expect(store.items).toEqual([]);
    });

    it('persists items to sessionStorage whenever items change (via reaction)', () => {
      store.items = [{ id: '1' }] as any;
      const raw = sessionStorage.getItem('test-library-store');
      expect(JSON.parse(raw!).items).toEqual([{ id: '1' }]);
    });
  });

  // ------------------------------------------------------------------
  // getters
  // ------------------------------------------------------------------
  describe('getters', () => {
    it('count reflects the number of items', () => {
      store.items = [{ id: '1' }, { id: '2' }] as any;
      expect(store.count).toBe(2);
    });

    it('visibleItemsForPatient excludes private items (is_private or isPrivate)', () => {
      store.items = [
        { id: '1', is_private: true },
        { id: '2', isPrivate: true },
        { id: '3' },
      ] as any;
      expect(store.visibleItemsForPatient.map((i: any) => i.id)).toEqual(['3']);
    });

    it('visibleItemsForTherapist returns all items regardless of privacy', () => {
      store.items = [{ id: '1', is_private: true }, { id: '2' }] as any;
      expect(store.visibleItemsForTherapist).toHaveLength(2);
    });
  });

  // ------------------------------------------------------------------
  // clearError / reset
  // ------------------------------------------------------------------
  describe('clearError / reset', () => {
    it('clearError resets the error message', () => {
      store.error = 'oops';
      store.clearError();
      expect(store.error).toBe('');
    });

    it('reset clears items, loading, error, and last fetch state', () => {
      store.items = [{ id: '1' }] as any;
      store.loading = true;
      store.error = 'oops';
      store.lastMode = 'patient';
      store.lastFetch = { mode: 'patient' };

      store.reset();

      expect(store.items).toEqual([]);
      expect(store.loading).toBe(false);
      expect(store.error).toBe('');
      expect(store.lastMode).toBeNull();
      expect(store.lastFetch).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // fetchAll
  // ------------------------------------------------------------------
  describe('fetchAll', () => {
    it('is a no-op while already loading', async () => {
      store.loading = true;
      await store.fetchAll({ mode: 'therapist' });
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('hits the plain endpoint without a patientId', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      await store.fetchAll({ mode: 'therapist' });
      expect(apiClient.get).toHaveBeenCalledWith('interventions/all/', { params: {} });
    });

    it('hits the per-patient endpoint when patientId is given', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      await store.fetchAll({ mode: 'patient', patientId: 'p1' });
      expect(apiClient.get).toHaveBeenCalledWith('interventions/all/p1/', { params: {} });
    });

    it('passes lang and includePrivate as query params when provided', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      await store.fetchAll({ mode: 'therapist', lang: 'de', includePrivate: true });
      expect(apiClient.get).toHaveBeenCalledWith('interventions/all/', {
        params: { lang: 'de', includePrivate: true },
      });
    });

    it('records lastMode and lastFetch for refresh()', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      const opts = { mode: 'therapist' as const, lang: 'en' };
      await store.fetchAll(opts);
      expect(store.lastMode).toBe('therapist');
      expect(store.lastFetch).toEqual(opts);
    });

    it('normalizes a bare array response', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [{ _id: 'a1', title: 'X' }] });
      await store.fetchAll({ mode: 'therapist' });
      expect(store.items[0].id).toBe('a1');
    });

    it('normalizes a { data: [...] } envelope', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: { data: [{ id: 'b1' }] } });
      await store.fetchAll({ mode: 'therapist' });
      expect(store.items).toHaveLength(1);
    });

    it('normalizes a { results: [...] } envelope', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: { results: [{ id: 'c1' }] } });
      await store.fetchAll({ mode: 'therapist' });
      expect(store.items).toHaveLength(1);
    });

    it('falls back to an empty list for an unrecognized payload shape', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: { foo: 'bar' } });
      await store.fetchAll({ mode: 'therapist' });
      expect(store.items).toEqual([]);
    });

    it('filters out private items in patient mode', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [
          { id: 'pub', is_private: false },
          { id: 'priv', is_private: true },
        ],
      });
      await store.fetchAll({ mode: 'patient' });
      expect((store.items as any).map((i: any) => i.id)).toEqual(['pub']);
    });

    it('keeps private items in therapist mode', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [{ id: 'priv', is_private: true }],
      });
      await store.fetchAll({ mode: 'therapist' });
      expect(store.items).toHaveLength(1);
    });

    it('sets loading only when there are no items yet', async () => {
      let sawLoadingDuringFetch: boolean | undefined;
      (apiClient.get as jest.Mock).mockImplementationOnce(async () => {
        sawLoadingDuringFetch = store.loading;
        return { data: [] };
      });
      await store.fetchAll({ mode: 'therapist' });
      expect(sawLoadingDuringFetch).toBe(true);
      expect(store.loading).toBe(false);
    });

    it('does not flip loading to true when items already exist (avoids UI flicker)', async () => {
      store.items = [{ id: 'existing' }] as any;
      let sawLoadingDuringFetch: boolean | undefined;
      (apiClient.get as jest.Mock).mockImplementationOnce(async () => {
        sawLoadingDuringFetch = store.loading;
        return { data: [] };
      });
      await store.fetchAll({ mode: 'therapist' });
      expect(sawLoadingDuringFetch).toBe(false);
    });

    it('sets an error message and clears items on failure', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce({
        response: { data: { error: 'Server exploded' } },
      });
      store.items = [{ id: 'stale' }] as any;
      await store.fetchAll({ mode: 'therapist' });
      expect(store.error).toBe('Server exploded');
      expect(store.items).toEqual([]);
      expect(store.loading).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // normalizeIntervention (exercised via fetchAll)
  // ------------------------------------------------------------------
  describe('intervention normalization', () => {
    const fetchOne = async (raw: Record<string, unknown>) => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [raw] });
      await store.fetchAll({ mode: 'therapist' });
      return store.items[0] as any;
    };

    it('unifies id from _id/pk', async () => {
      expect((await fetchOne({ _id: 'from-mongo' })).id).toBe('from-mongo');
      expect((await fetchOne({ pk: 42 })).id).toBe('42');
    });

    it('unifies the private flag from isPrivate', async () => {
      expect((await fetchOne({ isPrivate: true })).is_private).toBe(true);
    });

    it('lowercases content_type from camelCase/type variants', async () => {
      expect((await fetchOne({ contentType: 'VIDEO' })).content_type).toBe('video');
      expect((await fetchOne({ type: 'Audio' })).content_type).toBe('audio');
    });

    it('defaults language to "en" when missing', async () => {
      expect((await fetchOne({})).language).toBe('en');
    });

    it('reads language from the short "lang" field', async () => {
      expect((await fetchOne({ lang: 'de' })).language).toBe('de');
    });

    it('unifies external_id and provider from camelCase/source variants', async () => {
      const item = await fetchOne({ externalId: 'ext-1', source: 'youtube' });
      expect(item.external_id).toBe('ext-1');
      expect(item.provider).toBe('youtube');
    });

    it('reads available_languages from the camelCase variant', async () => {
      const item = await fetchOne({ availableLanguages: ['en', 'de'] });
      expect(item.available_languages).toEqual(['en', 'de']);
    });

    it('defaults available_languages to [] when neither variant is an array', async () => {
      expect((await fetchOne({})).available_languages).toEqual([]);
    });

    it('reads aims from the "aim" array variant', async () => {
      expect((await fetchOne({ aim: ['Education'] })).aims).toEqual(['Education']);
    });

    it('wraps a single string "aim" into a one-item array', async () => {
      expect((await fetchOne({ aim: 'Education' })).aims).toEqual(['Education']);
    });

    it('defaults aims to [] when nothing usable is present', async () => {
      expect((await fetchOne({ aim: '   ' })).aims).toEqual([]);
    });

    it('normalizes tags, dropping non-array or falsy values', async () => {
      expect((await fetchOne({ tags: ['a', '', 'b'] })).tags).toEqual(['a', 'b']);
      expect((await fetchOne({ tags: 'not-an-array' })).tags).toEqual([]);
    });

    it('reads media from the media_items variant', async () => {
      expect((await fetchOne({ media_items: [{ url: 'x' }] })).media).toEqual([{ url: 'x' }]);
    });

    it('defaults media to [] when neither variant is an array', async () => {
      expect((await fetchOne({})).media).toEqual([]);
    });

    it('resolves preview_img through the fallback chain', async () => {
      expect((await fetchOne({ previewImage: 'a.jpg' })).preview_img).toBe('a.jpg');
      expect((await fetchOne({ img_url: 'b.jpg' })).preview_img).toBe('b.jpg');
      expect((await fetchOne({ img: 'c.jpg' })).preview_img).toBe('c.jpg');
    });

    it('reads patient_types from the camelCase variant', async () => {
      expect((await fetchOne({ patientTypes: ['Stroke'] })).patient_types).toEqual(['Stroke']);
    });

    it('defaults where/setting to [] when not arrays', async () => {
      const item = await fetchOne({ where: 'Home', setting: null });
      expect(item.where).toEqual([]);
      expect(item.setting).toEqual([]);
    });

    it('keeps numeric avg_rating and rating_count, defaulting otherwise', async () => {
      const rated = await fetchOne({ avg_rating: 4.5, rating_count: 3 });
      expect(rated.avg_rating).toBe(4.5);
      expect(rated.rating_count).toBe(3);

      const unrated = await fetchOne({});
      expect(unrated.avg_rating).toBeNull();
      expect(unrated.rating_count).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // refresh
  // ------------------------------------------------------------------
  describe('refresh', () => {
    it('does nothing when there has been no prior fetch', async () => {
      await store.refresh();
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('re-runs fetchAll with the last used options', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
      await store.fetchAll({ mode: 'patient', patientId: 'p1', lang: 'de' });
      (apiClient.get as jest.Mock).mockClear();

      await store.refresh();

      expect(apiClient.get).toHaveBeenCalledWith('interventions/all/p1/', {
        params: { lang: 'de' },
      });
    });
  });
});
