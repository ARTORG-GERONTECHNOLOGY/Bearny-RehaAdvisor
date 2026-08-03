import flagDe from '@/assets/flags/de.png';
import flagFr from '@/assets/flags/fr.png';
import flagEn from '@/assets/flags/gb.png';
import flagIt from '@/assets/flags/it.png';
import flagPt from '@/assets/flags/pt.png';
import flagNl from '@/assets/flags/be.png';

export const SUPPORTED_LANGUAGES = ['de', 'fr', 'en', 'it', 'pt', 'nl'] as const;

export const LANGUAGE_FLAGS: Record<string, string> = {
  en: flagEn,
  de: flagDe,
  fr: flagFr,
  it: flagIt,
  pt: flagPt,
  nl: flagNl,
};

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
};
