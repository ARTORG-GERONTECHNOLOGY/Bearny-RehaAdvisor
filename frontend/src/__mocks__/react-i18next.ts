// Centralized manual mock for react-i18next used by tests.
// Tests that need custom translation behaviour can still override with a factory:
//   jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }))

export const useTranslation = () => ({
  t: (key: string) => key,
  i18n: {
    language: 'en',
    changeLanguage: jest.fn(),
  },
});

export const I18nextProvider = ({ children }: { children: unknown }) => children;

export const Trans = ({ i18nKey, children }: { i18nKey?: string; children?: unknown }) =>
  (i18nKey ?? children ?? null) as unknown;

export const initReactI18next = { type: '3rdParty' as const, init: jest.fn() };
