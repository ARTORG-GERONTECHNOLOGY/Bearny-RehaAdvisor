// Centralized manual mock for react-i18next used by tests.
// Tests that need custom translation behaviour can still override with a factory:
//   jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }))

import en from '@/assets/lang/en.json';
const translations = en as unknown as Record<string, string>;

export const useTranslation = () => ({
  t: (key: string, options?: Record<string, unknown>) => {
    // Without options, return the raw key
    // With options, look up the real English template so interpolation is meaningful.
    if (!options) return key;
    const template = translations[key] ?? key;
    return Object.entries(options).reduce(
      (acc, [k, v]) => acc.replace(new RegExp(`{{${k}}}`, 'g'), String(v)),
      template
    );
  },
  i18n: {
    language: 'en',
    changeLanguage: jest.fn(),
  },
});

export const I18nextProvider = ({ children }: { children: unknown }) => children;

export const Trans = ({ i18nKey, children }: { i18nKey?: string; children?: unknown }) =>
  (i18nKey ?? children ?? null) as unknown;

export const initReactI18next = { type: '3rdParty' as const, init: jest.fn() };
