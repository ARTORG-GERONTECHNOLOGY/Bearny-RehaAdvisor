import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './src/assets/lang/en.json';
import de from './src/assets/lang/de.json';
import fr from './src/assets/lang/fr.json';
import it from './src/assets/lang/it.json';

i18n.use(initReactI18next).use(LanguageDetector).init({
  detection: {
    // Options for language detection
    order: ['navigator', 'cookie', 'localStorage', 'htmlTag', 'path', 'subdomain'],
    caches: ['cookie', 'localStorage'], // Where to store the detected language
  },
  resources: {
    en: { translation: en },
    de: { translation: de },
    fr: { translation: fr },
    it: { translation: it }
  },
  lng: 'en', // default language
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
});

export default i18n;
