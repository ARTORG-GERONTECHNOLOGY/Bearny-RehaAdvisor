import { SUPPORTED_LANGUAGES, LANGUAGE_FLAGS, LANGUAGE_NAMES } from '@/constants/languages';

describe('languages', () => {
  it('has a flag and a name for every supported language', () => {
    SUPPORTED_LANGUAGES.forEach((lang) => {
      expect(LANGUAGE_FLAGS[lang]).toBeTruthy();
      expect(LANGUAGE_NAMES[lang]).toBeTruthy();
    });
  });

  it('does not define flags or names for unsupported languages', () => {
    expect(Object.keys(LANGUAGE_FLAGS).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
    expect(Object.keys(LANGUAGE_NAMES).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
  });

  it('lists the expected six languages', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['de', 'fr', 'en', 'it', 'pt', 'nl']);
  });
});
