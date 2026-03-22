import type { Locale } from 'date-fns';
import { de, enUS, fr, it, nl, pt } from 'date-fns/locale';

const LOCALE_MAP: Record<string, Locale> = {
  en: enUS,
  de,
  fr,
  it,
  nl,
  pt,
};

export const getDateFnsLocale = (language?: string): Locale => {
  const key = language?.slice(0, 2).toLowerCase() ?? 'en';
  return LOCALE_MAP[key] ?? enUS;
};
