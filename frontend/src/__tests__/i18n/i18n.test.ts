import i18n from '../../../i18n';

describe('i18n config', () => {
  it('sets <html lang> to the detected language on init', () => {
    expect(document.documentElement.lang).toBe(i18n.language);
  });

  it('updates <html lang> when the language changes', async () => {
    await i18n.changeLanguage('de');
    expect(document.documentElement.lang).toBe('de');

    await i18n.changeLanguage('fr');
    expect(document.documentElement.lang).toBe('fr');
  });
});
