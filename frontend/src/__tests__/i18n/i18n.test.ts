import { readFileSync } from 'fs';
import { join } from 'path';
import type { i18n as I18n } from 'i18next';
import { SUPPORTED_LANGUAGES } from '@/constants/languages';

const loadI18n = async (): Promise<I18n> => {
  let instance!: I18n;
  await jest.isolateModulesAsync(async () => {
    instance = (await import('../../../i18n')).default;
  });
  return instance;
};

describe('index.html', () => {
  const html = new DOMParser().parseFromString(
    readFileSync(join(__dirname, '../../../index.html'), 'utf8'),
    'text/html'
  );

  it('disables browser translation', () => {
    expect(html.documentElement.getAttribute('translate')).toBe('no');
    expect(html.querySelector('meta[name="google"]')?.getAttribute('content')).toBe('notranslate');
  });
});

describe('i18n config', () => {
  afterEach(() => jest.restoreAllMocks());

  beforeEach(() => {
    localStorage.clear();
    document.cookie = 'i18next=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.documentElement.lang = 'en';
  });

  it('resolves a saved regional language to its base language on startup', async () => {
    localStorage.setItem('i18nextLng', 'de-CH');
    const i18n = await loadI18n();

    expect(i18n.language).toBe('de');
    expect(document.documentElement.lang).toBe('de');
    expect(localStorage.getItem('i18nextLng')).toBe('de');
  });

  it('resolves a regional browser language to its base language on startup', async () => {
    jest.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-CH']);
    jest.spyOn(navigator, 'language', 'get').mockReturnValue('de-CH');
    const i18n = await loadI18n();

    expect(i18n.language).toBe('de');
    expect(document.documentElement.lang).toBe('de');
  });

  it('falls back to English for an unsupported saved language on startup', async () => {
    localStorage.setItem('i18nextLng', 'es-ES');
    const i18n = await loadI18n();

    expect(i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('updates <html lang> when the language changes', async () => {
    const i18n = await loadI18n();

    await i18n.changeLanguage('fr');
    expect(document.documentElement.lang).toBe('fr');

    await i18n.changeLanguage('it-CH');
    expect(document.documentElement.lang).toBe('it');
  });

  it('loads exactly the languages offered in the language switcher', async () => {
    const i18n = await loadI18n();

    expect(Object.keys(i18n.options.resources ?? {}).sort()).toEqual(
      [...SUPPORTED_LANGUAGES].sort()
    );
  });
});
