/**
 * patientQuestionnairesStore — telemetry tests
 *
 * Verifies that Sentry.captureException is called (with context) whenever
 * API calls fail inside the questionnaire store, so soft errors are
 * surfaced in the error-tracking dashboard even though they don't crash
 * the UI.
 */
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';

// ---- mocks ----------------------------------------------------------------

const mockGet = jest.fn();

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

const mockCaptureException = jest.fn();

jest.mock('@sentry/react', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

// ---- helpers ---------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  (patientQuestionnairesStore as any).showFeedbackPopup = false;
  (patientQuestionnairesStore as any).feedbackQuestions = [];
  (patientQuestionnairesStore as any).feedbackError = '';
  (patientQuestionnairesStore as any).healthQuestions = [];
  (patientQuestionnairesStore as any).healthDescription = '';
  (patientQuestionnairesStore as any).showHealthPopup = false;
  (patientQuestionnairesStore as any).showInitialPopup = false;
});

// ---- tests -----------------------------------------------------------------

describe('patientQuestionnairesStore — Sentry capture', () => {
  describe('openInterventionFeedback', () => {
    it('captures exception with context on API failure', async () => {
      const err = new Error('API down');
      mockGet.mockRejectedValueOnce(err);

      await patientQuestionnairesStore.openInterventionFeedback('p1', 'int-1', '2026-03-21', 'en');

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [captured, opts] = mockCaptureException.mock.calls[0];
      expect(captured).toBe(err);
      expect(opts?.extra?.context).toBe('openInterventionFeedback');
      expect(opts?.extra?.patientId).toBe('p1');
    });

    it('still opens popup (with error state) when API fails', async () => {
      mockGet.mockRejectedValueOnce(new Error('timeout'));

      await patientQuestionnairesStore.openInterventionFeedback('p1', 'int-1', '2026-03-21', 'en');

      expect(patientQuestionnairesStore.showFeedbackPopup).toBe(true);
      expect(patientQuestionnairesStore.feedbackError).toBeTruthy();
    });

    it('does NOT call Sentry on successful load', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          questions: [
            { questionKey: 'q1', answerType: 'text', translations: [], possibleAnswers: [] },
          ],
        },
      });

      await patientQuestionnairesStore.openInterventionFeedback('p1', 'int-1', '2026-03-21', 'en');

      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });

  describe('loadHealthQuestionnaire', () => {
    it('opens health popup when due health questions are returned', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          questions: [
            { questionKey: 'hq_1', answerType: 'text', translations: [], possibleAnswers: [] },
          ],
        },
      });

      await patientQuestionnairesStore.loadHealthQuestionnaire('p2', 'de');

      expect(patientQuestionnairesStore.healthQuestions).toHaveLength(1);
      expect(patientQuestionnairesStore.showHealthPopup).toBe(true);
    });

    it('stores healthDescription when response includes description', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          questions: [
            { questionKey: 'hq_1', answerType: 'text', translations: [], possibleAnswers: [] },
          ],
          description: 'Please read before answering.',
        },
      });

      await patientQuestionnairesStore.loadHealthQuestionnaire('p2', 'de');

      expect(patientQuestionnairesStore.healthDescription).toBe('Please read before answering.');
    });

    it('stores empty string when response has no description field', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          questions: [
            { questionKey: 'hq_1', answerType: 'text', translations: [], possibleAnswers: [] },
          ],
        },
      });

      await patientQuestionnairesStore.loadHealthQuestionnaire('p2', 'de');

      expect(patientQuestionnairesStore.healthDescription).toBe('');
    });

    it('resets healthDescription on closeHealth', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          questions: [
            { questionKey: 'hq_1', answerType: 'text', translations: [], possibleAnswers: [] },
          ],
          description: 'Some description',
        },
      });

      await patientQuestionnairesStore.loadHealthQuestionnaire('p2', 'de');
      expect(patientQuestionnairesStore.healthDescription).toBe('Some description');

      patientQuestionnairesStore.closeHealth();

      expect(patientQuestionnairesStore.healthDescription).toBe('');
      expect(patientQuestionnairesStore.showHealthPopup).toBe(false);
    });

    it('captures exception with patientId context on failure', async () => {
      const err = new Error('500');
      mockGet.mockRejectedValueOnce(err);

      await patientQuestionnairesStore.loadHealthQuestionnaire('p2', 'de');

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [, opts] = mockCaptureException.mock.calls[0];
      expect(opts?.extra?.context).toBe('loadHealthQuestionnaire');
      expect(opts?.extra?.patientId).toBe('p2');
    });
  });

  describe('checkInitialQuestionnaire', () => {
    it('captures exception with patientId context on failure', async () => {
      const err = new Error('403');
      mockGet.mockRejectedValueOnce(err);

      await patientQuestionnairesStore.checkInitialQuestionnaire('p3');

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [, opts] = mockCaptureException.mock.calls[0];
      expect(opts?.extra?.context).toBe('checkInitialQuestionnaire');
      expect(opts?.extra?.patientId).toBe('p3');
    });

    it('sets showInitialPopup=true when the backend requires it', async () => {
      mockGet.mockResolvedValueOnce({ data: { requires_questionnaire: true } });

      await patientQuestionnairesStore.checkInitialQuestionnaire('p3');

      expect(patientQuestionnairesStore.showInitialPopup).toBe(true);
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('sets showInitialPopup=false when the backend does not require it', async () => {
      mockGet.mockResolvedValueOnce({ data: { requires_questionnaire: false } });

      await patientQuestionnairesStore.checkInitialQuestionnaire('p3');

      expect(patientQuestionnairesStore.showInitialPopup).toBe(false);
    });
  });

  describe('close* methods', () => {
    it('closeFeedback resets all feedback-related state', () => {
      patientQuestionnairesStore.showFeedbackPopup = true;
      (patientQuestionnairesStore as any).feedbackInterventionId = 'int-1';
      (patientQuestionnairesStore as any).feedbackDateKey = '2026-03-21';
      patientQuestionnairesStore.feedbackQuestions = [
        { questionKey: 'q1', answerType: 'text', translations: [], possibleAnswers: [] },
      ];
      (patientQuestionnairesStore as any).loadingFeedback = true;
      patientQuestionnairesStore.feedbackError = 'boom';

      patientQuestionnairesStore.closeFeedback();

      expect(patientQuestionnairesStore.showFeedbackPopup).toBe(false);
      expect((patientQuestionnairesStore as any).feedbackInterventionId).toBe('');
      expect((patientQuestionnairesStore as any).feedbackDateKey).toBe('');
      expect(patientQuestionnairesStore.feedbackQuestions).toEqual([]);
      expect((patientQuestionnairesStore as any).loadingFeedback).toBe(false);
      expect(patientQuestionnairesStore.feedbackError).toBe('');
    });

    it('closeInitial hides the initial-questionnaire popup', () => {
      patientQuestionnairesStore.showInitialPopup = true;
      patientQuestionnairesStore.closeInitial();
      expect(patientQuestionnairesStore.showInitialPopup).toBe(false);
    });
  });

  describe('question normalization', () => {
    it('normalizes answerType variants (select/dropdown, multi-select/multiselect, video, unknown->text)', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          questions: [
            { questionKey: 'q_select', answerType: 'select' },
            { questionKey: 'q_dropdown', answerType: 'DROPDOWN' },
            { questionKey: 'q_multi', answerType: 'multi-select' },
            { questionKey: 'q_multiselect', answer_type: 'multiselect' },
            { questionKey: 'q_video', answerType: 'video' },
            { questionKey: 'q_unknown', answerType: 'something-else' },
            { questionKey: 'q_none' },
          ],
        },
      });

      await patientQuestionnairesStore.openInterventionFeedback('p1', 'int-1', '2026-03-21', 'en');

      const byKey = Object.fromEntries(
        patientQuestionnairesStore.feedbackQuestions.map((q) => [q.questionKey, q.answerType])
      );
      expect(byKey.q_select).toBe('dropdown');
      expect(byKey.q_dropdown).toBe('dropdown');
      expect(byKey.q_multi).toBe('multi-select');
      expect(byKey.q_multiselect).toBe('multi-select');
      expect(byKey.q_video).toBe('video');
      expect(byKey.q_unknown).toBe('text');
      expect(byKey.q_none).toBe('text');
    });

    it('filters out questions with no questionKey', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          questions: [{ questionKey: '' }, { questionKey: 123 }, { questionKey: 'valid' }],
        },
      });

      await patientQuestionnairesStore.openInterventionFeedback('p1', 'int-1', '2026-03-21', 'en');

      expect(patientQuestionnairesStore.feedbackQuestions).toHaveLength(1);
      expect(patientQuestionnairesStore.feedbackQuestions[0].questionKey).toBe('valid');
    });

    it('normalizes translations, defaulting language and dropping empty text entries', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          questions: [
            {
              questionKey: 'q1',
              answerType: 'text',
              translations: [
                { language: 'de', text: 'Wie geht es dir?' },
                { text: 'no language field' },
                { language: 'fr', text: '' },
                { language: 'it' },
              ],
            },
          ],
        },
      });

      await patientQuestionnairesStore.openInterventionFeedback('p1', 'int-1', '2026-03-21', 'en');

      const translations = patientQuestionnairesStore.feedbackQuestions[0].translations;
      expect(translations).toEqual([
        { language: 'de', text: 'Wie geht es dir?' },
        { language: 'en', text: 'no language field' },
      ]);
    });

    it('normalizes possibleAnswers, stringifying non-string keys and dropping empty ones', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          questions: [
            {
              questionKey: 'q1',
              answerType: 'dropdown',
              possibleAnswers: [
                { key: 'a', translations: [{ language: 'en', text: 'Option A' }] },
                { key: 2, translations: [] },
                { key: '', translations: [] },
                { key: undefined, translations: [] },
              ],
            },
          ],
        },
      });

      await patientQuestionnairesStore.openInterventionFeedback('p1', 'int-1', '2026-03-21', 'en');

      const options = patientQuestionnairesStore.feedbackQuestions[0].possibleAnswers;
      expect(options.map((o) => o.key)).toEqual(['a', '2']);
    });

    it('accepts a bare array response body (no {questions: [...]} wrapper)', async () => {
      mockGet.mockResolvedValueOnce({
        data: [{ questionKey: 'bare_q', answerType: 'text' }],
      });

      await patientQuestionnairesStore.openInterventionFeedback('p1', 'int-1', '2026-03-21', 'en');

      expect(patientQuestionnairesStore.feedbackQuestions).toHaveLength(1);
      expect(patientQuestionnairesStore.feedbackQuestions[0].questionKey).toBe('bare_q');
    });

    it('defaults to an empty question list when the response shape is unrecognized', async () => {
      mockGet.mockResolvedValueOnce({ data: { unexpected: 'shape' } });

      await patientQuestionnairesStore.openInterventionFeedback('p1', 'int-1', '2026-03-21', 'en');

      expect(patientQuestionnairesStore.feedbackQuestions).toEqual([]);
    });

    it('falls back to empty interventionId/dateKey and omits Accept-Language when unset', async () => {
      mockGet.mockResolvedValueOnce({ data: { questions: [] } });

      await patientQuestionnairesStore.openInterventionFeedback('p1', '', '', '');

      expect((patientQuestionnairesStore as any).feedbackInterventionId).toBe('');
      expect((patientQuestionnairesStore as any).feedbackDateKey).toBe('');
      expect(mockGet).toHaveBeenCalledWith(expect.any(String), {
        params: { interventionId: '' },
        headers: undefined,
      });
    });

    it('tolerates a response with no data field at all', async () => {
      mockGet.mockResolvedValueOnce(undefined);

      await patientQuestionnairesStore.openInterventionFeedback('p1', 'int-1', '2026-03-21', 'en');

      expect(patientQuestionnairesStore.feedbackQuestions).toEqual([]);
      expect(patientQuestionnairesStore.showFeedbackPopup).toBe(true);
    });
  });

  describe('loadHealthQuestionnaire — extra branch coverage', () => {
    it('omits Accept-Language when lang is falsy', async () => {
      mockGet.mockResolvedValueOnce({ data: { questions: [] } });

      await patientQuestionnairesStore.loadHealthQuestionnaire('p2', '');

      expect(mockGet).toHaveBeenCalledWith(expect.any(String), { headers: undefined });
    });

    it('defaults to an empty question list for an unrecognized response shape', async () => {
      mockGet.mockResolvedValueOnce({ data: { unexpected: 'shape' } });

      await patientQuestionnairesStore.loadHealthQuestionnaire('p2', 'de');

      expect(patientQuestionnairesStore.healthQuestions).toEqual([]);
      expect(patientQuestionnairesStore.showHealthPopup).toBe(false);
    });

    it('accepts a bare array response body', async () => {
      mockGet.mockResolvedValueOnce({ data: [{ questionKey: 'hq_bare', answerType: 'text' }] });

      await patientQuestionnairesStore.loadHealthQuestionnaire('p2', 'de');

      expect(patientQuestionnairesStore.healthQuestions).toHaveLength(1);
    });
  });
});
