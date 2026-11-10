import { readFileSync } from 'fs';
import { join } from 'path';
import i18n from '../../../i18n';

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
  it('sets <html lang> to the detected language on init', () => {
    expect(document.documentElement.lang).toBe('en');
  });

  it('updates <html lang> when the language changes', async () => {
    await i18n.changeLanguage('de');
    expect(document.documentElement.lang).toBe('de');

    await i18n.changeLanguage('fr');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('reduces regional codes to a supported language', async () => {
    await i18n.changeLanguage('de-CH');
    expect(i18n.language).toBe('de');
    expect(document.documentElement.lang).toBe('de');
  });

  it('falls back to English for unsupported languages', async () => {
    await i18n.changeLanguage('es-ES');
    expect(i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
