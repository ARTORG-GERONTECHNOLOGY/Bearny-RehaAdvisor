import i18next from 'i18next';
import { PatientInterventionsStore } from '@/stores/patientInterventionsStore';
import apiClient from '@/api/client';
import { translateText } from '@/utils/translate';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
jest.mock('@/utils/translate', () => ({
  translateText: jest.fn((text: string) =>
    Promise.resolve({ translatedText: text, detectedSourceLanguage: 'en' })
  ),
}));

const flushMicrotasks = async (times = 10) => {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
};

describe('PatientInterventionsStore', () => {
  let store: PatientInterventionsStore;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    // Translations are stamped with the language translateText renders into, i.e. i18next's.
    i18next.language = 'en';
    store = new PatientInterventionsStore();
    (translateText as jest.Mock).mockImplementation((text: string) =>
      Promise.resolve({ translatedText: text, detectedSourceLanguage: 'en' })
    );
  });

  // ------------------------------------------------------------------
  // clearError / setAssistanceMode
  // ------------------------------------------------------------------
  describe('clearError', () => {
    it('clears both error and errorDetails', () => {
      store.error = 'oops';
      store.errorDetails = 'details';
      store.clearError();
      expect(store.error).toBeNull();
      expect(store.errorDetails).toBeNull();
    });
  });

  describe('setAssistanceMode', () => {
    it('sets the assistance mode', () => {
      store.setAssistanceMode('with_help');
      expect(store.assistanceMode).toBe('with_help');
    });
  });

  // ------------------------------------------------------------------
  // isCompletedOn
  // ------------------------------------------------------------------
  describe('isCompletedOn', () => {
    it('is true when a completion date matches (prefix match)', () => {
      const rec = { completion_dates: ['2026-01-05T10:00:00Z'] } as any;
      expect(store.isCompletedOn(rec, new Date('2026-01-05T00:00:00Z'))).toBe(true);
    });

    it('is false when there is no matching completion date', () => {
      const rec = { completion_dates: ['2026-01-04T10:00:00Z'] } as any;
      expect(store.isCompletedOn(rec, new Date('2026-01-05T00:00:00Z'))).toBe(false);
    });

    it('is false when completion_dates is missing', () => {
      const rec = {} as any;
      expect(store.isCompletedOn(rec, new Date('2026-01-05T00:00:00Z'))).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // fetchPlan
  // ------------------------------------------------------------------
  describe('fetchPlan', () => {
    it('requests the plan with a 2-letter language code', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      await store.fetchPlan('patient-1', 'de-CH');
      expect(apiClient.get).toHaveBeenCalledWith(
        '/patients/rehabilitation-plan/patient/patient-1/',
        { params: { lang: 'de' } }
      );
    });

    it('defaults to "en" when no uiLang is given', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      await store.fetchPlan('patient-1', '');
      expect(apiClient.get).toHaveBeenCalledWith(expect.any(String), {
        params: { lang: 'en' },
      });
    });

    it('builds a translated PatientRec for each row', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [
          {
            intervention_id: 'int-1',
            intervention_title: 'Breathing',
            description: 'Breathe deeply',
            dates: ['2026-01-01'],
            completion_dates: ['2026-01-01'],
            frequency: 'daily',
            notes: 'be careful',
            require_video_feedback: true,
            duration: 10,
            preview_img: 'img.jpg',
            media: [{ url: 'x' }],
          },
        ],
      });

      await store.fetchPlan('patient-1', 'en');

      expect(store.items).toHaveLength(1);
      const rec = store.items[0];
      expect(rec.intervention_id).toBe('int-1');
      expect(rec.intervention_title).toBe('Breathing');
      expect(rec.description).toBe('Breathe deeply');
      expect(rec.dates).toEqual(['2026-01-01']);
      expect(rec.frequency).toBe('daily');
      expect(rec.notes).toBe('be careful');
      expect(rec.require_video_feedback).toBe(true);
      expect(rec.duration).toBe(10);
      expect(rec.preview_img).toBe('img.jpg');
      expect(rec.media).toEqual([{ url: 'x' }]);
      expect(rec.translated_title).toBe('Breathing');
      expect(rec.translated_description).toBe('Breathe deeply');
      // The description is translated here to warm the cache for PatientInterventionDetail.
      expect(translateText).toHaveBeenCalledWith('Breathe deeply');
    });

    it('falls back to the nested intervention meta for title/description/id/preview/media', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [
          {
            intervention: {
              _id: 'meta-1',
              title: 'Meta Title',
              description: 'Meta Desc',
              preview_img: 'meta.jpg',
              media: [{ url: 'meta' }],
            },
          },
        ],
      });

      await store.fetchPlan('patient-1', 'en');

      const rec = store.items[0];
      expect(rec.intervention_id).toBe('meta-1');
      expect(rec.intervention_title).toBe('Meta Title');
      expect(rec.description).toBe('Meta Desc');
      expect(rec.preview_img).toBe('meta.jpg');
      expect(rec.media).toEqual([{ url: 'meta' }]);
    });

    it('defaults duration to undefined when not a number', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [{ intervention_id: 'i1', duration: 'not-a-number' }],
      });
      await store.fetchPlan('patient-1', 'en');
      expect(store.items[0].duration).toBeUndefined();
    });

    it('accepts a non-array response body by treating it as an empty list', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: { unexpected: true } });
      await store.fetchPlan('patient-1', 'en');
      expect(store.items).toEqual([]);
    });

    it('loads cached items from sessionStorage before the request resolves', async () => {
      const cachedItems = [{ intervention_id: 'cached-1', intervention_title: 'Cached' }];
      sessionStorage.setItem(
        'patientInterventionsStore',
        JSON.stringify({ 'patient-1': cachedItems })
      );

      let sawDuringFetch: any;
      (apiClient.get as jest.Mock).mockImplementationOnce(async () => {
        sawDuringFetch = store.items;
        return { data: [] };
      });

      await store.fetchPlan('patient-1', 'en');

      expect(sawDuringFetch).toEqual(cachedItems);
    });

    it('does not show a loading state when cached items already exist', async () => {
      sessionStorage.setItem(
        'patientInterventionsStore',
        JSON.stringify({ 'patient-1': [{ intervention_id: 'cached-1' }] })
      );

      let sawLoadingDuringFetch: boolean | undefined;
      (apiClient.get as jest.Mock).mockImplementationOnce(async () => {
        sawLoadingDuringFetch = store.loading;
        return { data: [] };
      });

      await store.fetchPlan('patient-1', 'en');

      expect(sawLoadingDuringFetch).toBe(false);
    });

    it('shows a loading state when there is nothing cached', async () => {
      let sawLoadingDuringFetch: boolean | undefined;
      (apiClient.get as jest.Mock).mockImplementationOnce(async () => {
        sawLoadingDuringFetch = store.loading;
        return { data: [] };
      });

      await store.fetchPlan('patient-1', 'en');

      expect(sawLoadingDuringFetch).toBe(true);
      expect(store.loading).toBe(false);
    });

    it('persists items to sessionStorage after a successful fetch', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [{ intervention_id: 'i1', intervention_title: 'X' }],
      });

      await store.fetchPlan('patient-1', 'en');

      const raw = sessionStorage.getItem('patientInterventionsStore');
      const parsed = JSON.parse(raw!);
      expect(parsed['patient-1']).toHaveLength(1);
    });

    it('renders items with the original text before translations resolve', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [{ intervention_id: 'int-1', intervention_title: 'Breathing', description: 'Deep' }],
      });

      const resolvers: Array<(value: unknown) => void> = [];
      (translateText as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvers.push(resolve);
          })
      );

      const fetchPromise = store.fetchPlan('patient-1', 'en');

      // Let the raw-item assignment happen without waiting for translateText.
      await Promise.resolve();
      await Promise.resolve();

      expect(store.items).toHaveLength(1);
      expect(store.items[0].intervention_title).toBe('Breathing');
      expect(store.items[0].translated_title).toBeUndefined();
      expect(store.loading).toBe(false);

      // Resolves title and description translation calls, in order.
      resolvers[0]({ translatedText: 'Atmung', detectedSourceLanguage: 'de' });
      resolvers[1]({ translatedText: 'Tief', detectedSourceLanguage: 'de' });
      await fetchPromise;

      expect(store.items[0].translated_title).toBe('Atmung');
    });

    it('patches translations in as a single batch, not one item at a time', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [
          { intervention_id: 'int-1', intervention_title: 'Breathing', description: 'Deep' },
          { intervention_id: 'int-2', intervention_title: 'Walking', description: 'Slow' },
        ],
      });

      const resolvers: Array<(value: unknown) => void> = [];
      (translateText as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvers.push(resolve);
          })
      );

      const fetchPromise = store.fetchPlan('patient-1', 'en');
      await flushMicrotasks();

      const itemsBeforeAnyResolve = store.items;

      // Resolve only int-1's title+desc; int-2's stays pending.
      resolvers[0]({ translatedText: 'Atmung', detectedSourceLanguage: 'de' });
      resolvers[1]({ translatedText: 'Tief', detectedSourceLanguage: 'de' });
      await flushMicrotasks();

      // No commit yet: the batch is still waiting on int-2's translation.
      expect(store.items).toBe(itemsBeforeAnyResolve);
      expect(
        store.items.find((r) => r.intervention_id === 'int-1')!.translated_title
      ).toBeUndefined();

      resolvers[2]({ translatedText: 'Gehen', detectedSourceLanguage: 'de' });
      resolvers[3]({ translatedText: 'Langsam', detectedSourceLanguage: 'de' });
      await fetchPromise;

      expect(store.items.find((r) => r.intervention_id === 'int-1')!.translated_title).toBe(
        'Atmung'
      );
      expect(store.items.find((r) => r.intervention_id === 'int-2')!.translated_title).toBe(
        'Gehen'
      );
    });

    it("does not apply a stale fetch's translations after a newer fetchPlan call for another patient", async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [{ intervention_id: 'int-1', intervention_title: 'Breathing', description: 'Deep' }],
      });

      let resolveTranslate: (value: unknown) => void;
      (translateText as jest.Mock).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveTranslate = resolve;
          })
      );

      const stalePromise = store.fetchPlan('patient-1', 'en');
      await Promise.resolve();
      await Promise.resolve();

      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [] });
      await store.fetchPlan('patient-2', 'en');

      resolveTranslate!({ translatedText: 'Atmung', detectedSourceLanguage: 'de' });
      await stalePromise;

      expect(store.items).toEqual([]);
    });

    it('keeps a previous translation on screen while a refetch re-resolves it', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [{ intervention_id: 'int-1', intervention_title: 'Breathing', description: 'Deep' }],
      });
      (translateText as jest.Mock).mockImplementation((text: string) =>
        Promise.resolve({ translatedText: `${text}-de`, detectedSourceLanguage: 'en' })
      );
      await store.fetchPlan('patient-1', 'de');
      expect(store.items[0].translated_title).toBe('Breathing-de');

      // Leave translations pending so we can observe the window before they land.
      const resolvers: Array<(value: unknown) => void> = [];
      (translateText as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvers.push(resolve);
          })
      );
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [{ intervention_id: 'int-1', intervention_title: 'Breathing', description: 'Deep' }],
      });
      const refetch = store.fetchPlan('patient-1', 'de');
      await flushMicrotasks();

      // Without carry-over this is undefined and the UI flashes back to the source text.
      expect(store.items[0].translated_title).toBe('Breathing-de');

      resolvers.forEach((resolve) =>
        resolve({ translatedText: 'Atmung', detectedSourceLanguage: 'de' })
      );
      await refetch;
    });

    it('drops the patch when the UI language switches mid-fetch instead of mis-stamping it', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [{ intervention_id: 'int-1', intervention_title: 'Breathing', description: 'Deep' }],
      });
      const resolvers: Array<(value: unknown) => void> = [];
      (translateText as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvers.push(resolve);
          })
      );

      const fetchPromise = store.fetchPlan('patient-1', 'de');
      await flushMicrotasks();

      // On the detail route nothing re-issues fetchPlan, so the generation guard won't fire.
      i18next.language = 'fr';
      resolvers.forEach((resolve) =>
        resolve({ translatedText: 'Respiration', detectedSourceLanguage: 'en' })
      );
      await fetchPromise;

      // Stamping French text as English would let a later English fetch reuse it.
      expect(store.items[0].translated_title).toBeUndefined();
      expect(store.items[0].translatedForLang).toBeUndefined();
    });

    it('retranslates an unchanged row when the target language changes instead of reusing the stale-language text', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [{ intervention_id: 'int-1', intervention_title: 'Breathing', description: 'Deep' }],
      });
      (translateText as jest.Mock).mockImplementation((text: string) =>
        Promise.resolve({ translatedText: `${text}-de`, detectedSourceLanguage: 'en' })
      );
      i18next.language = 'de';
      await store.fetchPlan('patient-1', 'de');
      expect(store.items[0].translated_title).toBe('Breathing-de');

      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [{ intervention_id: 'int-1', intervention_title: 'Breathing', description: 'Deep' }],
      });
      (translateText as jest.Mock).mockImplementation((text: string) =>
        Promise.resolve({ translatedText: `${text}-fr`, detectedSourceLanguage: 'en' })
      );

      i18next.language = 'fr';
      await store.fetchPlan('patient-1', 'fr');

      expect(store.items[0].translated_title).toBe('Breathing-fr');
    });

    it('does not collide two rows that share an empty intervention_id when patching translations', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [
          { intervention_title: 'Breathing', description: 'Deep' },
          { intervention_title: 'Walking', description: 'Slow' },
        ],
      });
      (translateText as jest.Mock).mockImplementation((text: string) =>
        Promise.resolve({ translatedText: `${text}-de`, detectedSourceLanguage: 'en' })
      );

      await store.fetchPlan('patient-1', 'de');

      expect(store.items[0].intervention_id).toBe('');
      expect(store.items[1].intervention_id).toBe('');
      expect(store.items[0].translated_title).toBe('Breathing-de');
      expect(store.items[1].translated_title).toBe('Walking-de');
    });

    it('retries a failed translation on the next fetch instead of pinning the untranslated text', async () => {
      const row = {
        intervention_id: 'int-1',
        intervention_title: 'Breathing',
        description: 'Deep',
      };
      i18next.language = 'de';
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [row] });
      // How translateText reports a 504: original text back, language 'error'.
      (translateText as jest.Mock).mockImplementation((text: string) =>
        Promise.resolve({ translatedText: text, detectedSourceLanguage: 'error' })
      );

      await store.fetchPlan('patient-1', 'de');

      expect(store.items[0].translated_title).toBe('Breathing');
      expect(store.items[0].translatedForLang).toBeUndefined();

      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [row] });
      (translateText as jest.Mock).mockImplementation((text: string) =>
        Promise.resolve({ translatedText: `${text}-de`, detectedSourceLanguage: 'en' })
      );

      await store.fetchPlan('patient-1', 'de');

      expect(store.items[0].translated_title).toBe('Breathing-de');
      expect(store.items[0].translatedForLang).toBe('de');
    });

    it('sets an error from the backend payload on failure', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce({
        response: { data: { error: 'Plan not found', details: 'no plan for patient' } },
      });

      await store.fetchPlan('patient-1', 'en');

      expect(store.error).toBe('Plan not found');
      expect(store.errorDetails).toBe('no plan for patient');
      expect(store.loading).toBe(false);
    });

    it('falls back to err.message, then a generic message', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));
      await store.fetchPlan('patient-1', 'en');
      expect(store.error).toBe('Network Error');

      (apiClient.get as jest.Mock).mockRejectedValueOnce({});
      await store.fetchPlan('patient-1', 'en');
      expect(store.error).toBe('An unexpected error occurred.');
    });
  });

  // ------------------------------------------------------------------
  // toggleCompleted
  // ------------------------------------------------------------------
  describe('toggleCompleted', () => {
    const rec = { intervention_id: 'int-1', completion_dates: [] as string[] } as any;

    it('marks an incomplete date as complete', async () => {
      store.items = [rec];
      (apiClient.post as jest.Mock).mockResolvedValueOnce({});

      const result = await store.toggleCompleted('patient-1', rec, new Date('2026-01-05'));

      expect(apiClient.post).toHaveBeenCalledWith('interventions/complete/', {
        patient_id: 'patient-1',
        intervention_id: 'int-1',
        date: '2026-01-05',
      });
      expect(result).toEqual({ completed: true, dateKey: '2026-01-05' });
      expect(store.items[0].completion_dates).toContain('2026-01-05');
    });

    it('includes the assistance mode in the complete payload when set', async () => {
      store.items = [rec];
      store.setAssistanceMode('alone');
      (apiClient.post as jest.Mock).mockResolvedValueOnce({});

      await store.toggleCompleted('patient-1', rec, new Date('2026-01-05'));

      expect(apiClient.post).toHaveBeenCalledWith(
        'interventions/complete/',
        expect.objectContaining({ assistance: 'alone' })
      );
    });

    it('adds a completion date alongside existing dates for other days', async () => {
      const recWithDate = {
        intervention_id: 'int-1',
        completion_dates: ['2026-01-01T08:00:00Z'],
      } as any;
      store.items = [recWithDate];
      (apiClient.post as jest.Mock).mockResolvedValueOnce({});

      await store.toggleCompleted('patient-1', recWithDate, new Date('2026-01-05'));

      const dates = store.items[0].completion_dates!;
      expect(dates).toContain('2026-01-01T08:00:00Z');
      expect(dates.filter((d) => d.startsWith('2026-01-05'))).toHaveLength(1);
    });

    it('marks a completed date as uncomplete', async () => {
      const completedRec = {
        intervention_id: 'int-1',
        completion_dates: ['2026-01-05'],
      } as any;
      store.items = [completedRec];
      (apiClient.post as jest.Mock).mockResolvedValueOnce({});

      const result = await store.toggleCompleted('patient-1', completedRec, new Date('2026-01-05'));

      expect(apiClient.post).toHaveBeenCalledWith('interventions/uncomplete/', {
        patient_id: 'patient-1',
        intervention_id: 'int-1',
        date: '2026-01-05',
      });
      expect(result).toEqual({ completed: false, dateKey: '2026-01-05' });
      expect(store.items[0].completion_dates).toEqual([]);
    });

    it('only updates the matching record, leaving others untouched', async () => {
      const other = { intervention_id: 'other', completion_dates: ['2026-01-01'] } as any;
      store.items = [rec, other];
      (apiClient.post as jest.Mock).mockResolvedValueOnce({});

      await store.toggleCompleted('patient-1', rec, new Date('2026-01-05'));

      expect(store.items.find((r) => r.intervention_id === 'other')!.completion_dates).toEqual([
        '2026-01-01',
      ]);
    });
  });

  // ------------------------------------------------------------------
  // rescheduleOccurrence
  // ------------------------------------------------------------------
  describe('rescheduleOccurrence', () => {
    const rec = {
      intervention_id: 'int-1',
      dates: ['2026-01-05T18:00:00+00:00', '2026-01-06T18:00:00+00:00'],
    } as any;

    it('posts the reschedule request with the camelCase payload the backend expects', async () => {
      store.items = [rec];
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { newDatetime: '2026-01-10T18:00:00+00:00' },
      });

      const newDate = new Date('2026-01-10T18:00:00+00:00');
      await store.rescheduleOccurrence('patient-1', rec, '2026-01-05T18:00:00+00:00', newDate);

      expect(apiClient.post).toHaveBeenCalledWith('interventions/reschedule-date/', {
        patientId: 'patient-1',
        interventionId: 'int-1',
        oldDatetime: '2026-01-05T18:00:00+00:00',
        newDatetime: newDate.toISOString(),
      });
    });

    it('replaces only the rescheduled occurrence with the backend-confirmed datetime', async () => {
      store.items = [rec];
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { newDatetime: '2026-01-10T18:00:00+00:00' },
      });

      await store.rescheduleOccurrence(
        'patient-1',
        rec,
        '2026-01-05T18:00:00+00:00',
        new Date('2026-01-10T18:00:00+00:00')
      );

      expect(store.items[0].dates).toEqual([
        '2026-01-10T18:00:00+00:00',
        '2026-01-06T18:00:00+00:00',
      ]);
    });

    it('falls back to the requested date when the backend response has no newDatetime', async () => {
      store.items = [rec];
      (apiClient.post as jest.Mock).mockResolvedValueOnce({ data: {} });

      const newDate = new Date('2026-01-10T18:00:00+00:00');
      const result = await store.rescheduleOccurrence(
        'patient-1',
        rec,
        '2026-01-05T18:00:00+00:00',
        newDate
      );

      expect(result).toBe(newDate.toISOString());
      expect(store.items[0].dates).toContain(newDate.toISOString());
    });

    it('only updates the matching record, leaving others untouched', async () => {
      const other = { intervention_id: 'other', dates: ['2026-01-05T09:00:00+00:00'] } as any;
      store.items = [rec, other];
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { newDatetime: '2026-01-10T18:00:00+00:00' },
      });

      await store.rescheduleOccurrence(
        'patient-1',
        rec,
        '2026-01-05T18:00:00+00:00',
        new Date('2026-01-10T18:00:00+00:00')
      );

      expect(store.items.find((r) => r.intervention_id === 'other')!.dates).toEqual([
        '2026-01-05T09:00:00+00:00',
      ]);
    });
  });
});
