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

    const result = await translateText('Hallo');

    expect(result.detectedSourceLanguage).toBe('unknown');
  });

  it('returns original text with detectedSourceLanguage "error" when translate request fails', async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse([{ language: 'de' }]))
      .mockResolvedValueOnce(makeJsonResponse(null, false));

    const result = await translateText('Hallo');

    expect(result).toEqual({ translatedText: 'Hallo', detectedSourceLanguage: 'error' });
  });

  it('returns original text with detectedSourceLanguage "error" when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await translateText('Hallo');

    expect(result).toEqual({ translatedText: 'Hallo', detectedSourceLanguage: 'error' });
  });
});
