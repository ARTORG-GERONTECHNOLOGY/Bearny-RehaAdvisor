/**
 * patientVitalsStore — telemetry tests
 *
 * Verifies that:
 *  - Sentry.captureException is called when the submit API call fails,
 *    with a context tag so the error is categorised in Sentry.
 *  - A successful submit does NOT send anything to Sentry.
 */
import { patientVitalsStore } from '@/stores/patientVitalsStore';

// ---- mocks ----------------------------------------------------------------

const mockPost = jest.fn();
const mockGet = jest.fn();

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

const mockCaptureException = jest.fn();

jest.mock('@sentry/react', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

// ---- helpers ---------------------------------------------------------------

function resetStore() {
  (patientVitalsStore as any).exists = false;
  (patientVitalsStore as any).error = '';
  (patientVitalsStore as any).successMsg = '';
  (patientVitalsStore as any).posting = false;
}

// ---- tests -----------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
});

describe('patientVitalsStore.submit — Sentry capture', () => {
  it('calls Sentry.captureException with context when POST fails', async () => {
    const err = new Error('Network Error');
    mockPost.mockRejectedValueOnce(err);

    await patientVitalsStore.submit('patient-1', { weight_kg: 72 });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [capturedErr, opts] = mockCaptureException.mock.calls[0];
    expect(capturedErr).toBe(err);
    expect(opts?.extra?.context).toBe('patientVitalsStore.submit');
    expect(opts?.extra?.userId).toBe('patient-1');
  });

  it('does NOT call Sentry when submit succeeds', async () => {
    mockPost.mockResolvedValueOnce({ data: {} });

    await patientVitalsStore.submit('patient-1', { weight_kg: 72 });

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('sets error message from API response on failure', async () => {
    mockPost.mockRejectedValueOnce({ response: { data: { error: 'Server busy' } } });

    await patientVitalsStore.submit('patient-1', { weight_kg: 70 });

    expect(patientVitalsStore.error).toBe('Server busy');
  });

  it('sets exists=true and clears error on success', async () => {
    mockPost.mockResolvedValueOnce({ data: {} });

    await patientVitalsStore.submit('patient-1', { weight_kg: 70 });

    expect(patientVitalsStore.exists).toBe(true);
    expect(patientVitalsStore.error).toBe('');
  });
});
