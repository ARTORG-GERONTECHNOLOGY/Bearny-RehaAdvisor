import { translateText } from '@/utils/translate';

jest.mock('i18next', () => ({ language: 'en' }));

const mockFetch = jest.fn();
global.fetch = mockFetch;

const makeJsonResponse = (data: unknown, ok = true) => ({
  ok,
  json: () => Promise.resolve(data),
});

// Freeing a concurrency slot chains several awaits (fetch -> json() -> return
// -> finally -> resume the next queued acquireSlot()), so a single
// `await Promise.resolve()` isn't enough to observe the follow-on effect.
const flushMicrotasks = async (times = 10) => {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('translateText', () => {
  it('returns original text when detected language matches target', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse([{ language: 'en' }]));

    const result = await translateText('Hello');

    expect(result).toEqual({ translatedText: 'Hello', detectedSourceLanguage: 'en' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('translates text when detected language differs from target', async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse([{ language: 'de' }]))
      .mockResolvedValueOnce(makeJsonResponse({ translatedText: 'Hello' }));

    const result = await translateText('Hallo');

    expect(result).toEqual({ translatedText: 'Hello', detectedSourceLanguage: 'de' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to "unknown" when detect response is empty', async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse([]))
      .mockResolvedValueOnce(makeJsonResponse({ translatedText: 'Hello' }));

    const result = await translateText('Hallo, wie geht es dir?');

    expect(result.detectedSourceLanguage).toBe('unknown');
  });

  it('returns original text with detectedSourceLanguage "error" when translate request fails', async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse([{ language: 'de' }]))
      .mockResolvedValueOnce(makeJsonResponse(null, false));

    const result = await translateText('Guten Tag');

    expect(result).toEqual({ translatedText: 'Guten Tag', detectedSourceLanguage: 'error' });
  });

  it('returns original text with detectedSourceLanguage "error" when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await translateText('Auf Wiedersehen');

    expect(result).toEqual({ translatedText: 'Auf Wiedersehen', detectedSourceLanguage: 'error' });
  });

  it('caches results so repeated calls for the same text do not refetch', async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse([{ language: 'de' }]))
      .mockResolvedValueOnce(makeJsonResponse({ translatedText: 'Good morning' }));

    const first = await translateText('Guten Morgen');
    const second = await translateText('Guten Morgen');

    expect(first).toEqual(second);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent calls for the same text into a single request', async () => {
    let resolveDetect: (value: unknown) => void;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDetect = resolve;
        })
    );
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ translatedText: 'Good evening' }));

    const call1 = translateText('Guten Abend');
    const call2 = translateText('Guten Abend');

    // Let the microtask queue drain so the (mocked) fetch call is actually made
    // before we resolve it.
    await Promise.resolve();
    await Promise.resolve();

    resolveDetect!(makeJsonResponse([{ language: 'de' }]));

    const [result1, result2] = await Promise.all([call1, call2]);

    expect(result1).toEqual(result2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns immediately for empty text without calling fetch', async () => {
    const result = await translateText('');

    expect(result).toEqual({ translatedText: '', detectedSourceLanguage: 'unknown' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('evicts the oldest cache entry once the cache exceeds 2000 entries', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse([{ language: 'en' }]));

    for (let i = 0; i < 2001; i++) {
      await translateText(`Cache filler sentence ${i}`);
    }

    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce(makeJsonResponse([{ language: 'en' }]));

    // The very first entry should have been evicted, forcing a re-fetch.
    await translateText('Cache filler sentence 0');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('caps concurrent in-flight requests at 4, queueing the rest', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );

    // 6 distinct texts so none of them hit the cache/dedup path.
    const texts = Array.from({ length: 6 }, (_, i) => `Distinct sentence number ${i}`);
    const calls = texts.map((t) => translateText(t));

    await flushMicrotasks();

    // Only 4 requests (the concurrency cap) should have started so far.
    expect(mockFetch).toHaveBeenCalledTimes(4);

    // Resolve one as already matching the target language, freeing its slot
    // without needing a second (translate) fetch.
    resolvers[0](makeJsonResponse([{ language: 'en' }]));
    await flushMicrotasks();

    // A 5th request should now have started, still never exceeding the cap.
    expect(mockFetch).toHaveBeenCalledTimes(5);

    // Resolve the remaining originally-started requests (items 1-4), which
    // frees enough slots for the 6th (final) request to start too.
    resolvers.slice(1, 5).forEach((resolve) => resolve(makeJsonResponse([{ language: 'en' }])));
    await flushMicrotasks();

    expect(mockFetch).toHaveBeenCalledTimes(6);
    resolvers[5](makeJsonResponse([{ language: 'en' }]));

    const results = await Promise.all(calls);

    expect(results).toHaveLength(6);
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });
});
