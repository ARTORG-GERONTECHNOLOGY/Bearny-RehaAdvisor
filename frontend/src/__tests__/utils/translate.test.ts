import { translateText } from '@/utils/translate';

jest.mock('i18next', () => ({ language: 'en' }));

const mockFetch = jest.fn();
global.fetch = mockFetch;

const makeJsonResponse = (data: unknown, ok = true) => ({
  ok,
  json: () => Promise.resolve(data),
});

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
});
