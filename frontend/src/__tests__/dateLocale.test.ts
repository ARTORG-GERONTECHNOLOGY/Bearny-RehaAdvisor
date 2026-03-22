import { de, enUS, fr, it as itLocale, nl, pt } from 'date-fns/locale';

import { getDateFnsLocale } from '@/utils/dateLocale';

describe('getDateFnsLocale', () => {
  it('returns English locale for en', () => {
    expect(getDateFnsLocale('en')).toBe(enUS);
  });

  it('returns German locale for de-CH', () => {
    expect(getDateFnsLocale('de-CH')).toBe(de);
  });

  it('returns French locale for fr', () => {
    expect(getDateFnsLocale('fr')).toBe(fr);
  });

  it('returns Italian locale for it', () => {
    expect(getDateFnsLocale('it')).toBe(itLocale);
  });

  it('returns Dutch locale for nl', () => {
    expect(getDateFnsLocale('nl')).toBe(nl);
  });

  it('returns Portuguese locale for pt-BR', () => {
    expect(getDateFnsLocale('pt-BR')).toBe(pt);
  });

  it('handles uppercase language codes', () => {
    expect(getDateFnsLocale('FR')).toBe(fr);
  });

  it('falls back to English for unknown locale', () => {
    expect(getDateFnsLocale('es')).toBe(enUS);
  });

  it('falls back to English when language is undefined', () => {
    expect(getDateFnsLocale(undefined)).toBe(enUS);
  });
});
