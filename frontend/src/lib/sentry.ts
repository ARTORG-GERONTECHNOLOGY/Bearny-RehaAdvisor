import * as Sentry from '@sentry/react';
import i18n from '../../i18n';
import { colors } from '@/lib/colors';

export function initSentry(): void {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!sentryDsn) return;

  Sentry.init({
    dsn: sentryDsn,
    enableLogs: true,
    sendDefaultPii: true,
    tracesSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.feedbackIntegration({
        autoInject: false,
        showBranding: false,
        colorScheme: 'light',
        themeLight: {
          accentBackground: colors.brand,
          successColor: colors.ok,
          errorColor: colors.nok,
          boxShadow: 'none',
        },
        showName: false,
        showEmail: true,
        enableScreenshot: false,
        formTitle: i18n.t('Report Bug'),
        emailLabel: i18n.t('Email Address'),
        messageLabel: i18n.t('Description'),
        messagePlaceholder: i18n.t('Bug Report Prompt'),
        isRequiredLabel: `(${i18n.t('required')})`,
        submitButtonLabel: i18n.t('Submit'),
        cancelButtonLabel: i18n.t('Cancel'),
        successMessageText: i18n.t('Bug Report Success'),
      }),
    ],
  });
}
