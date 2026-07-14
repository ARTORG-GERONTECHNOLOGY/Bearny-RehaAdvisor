import { PatientInterventionsStore } from '@/stores/patientInterventionsStore';
import apiClient from '@/api/client';
import { translateText } from '@/utils/translate';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
jest.mock('@/utils/translate', () => ({
  translateText: jest.fn((text: string) =>
    Promise.resolve({ translatedText: text, detectedSourceLanguage: 'en' })
  ),
}));

describe('PatientInterventionsStore', () => {
  let store: PatientInterventionsStore;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
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
      expect(rec.titleLang).toBe('en');
      expect(rec.descLang).toBe('en');
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
});
