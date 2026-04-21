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
  });
});
