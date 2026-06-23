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
    // 1.0 caused 413s from Sentry because performance traces bloated envelopes
    // past the ~200 KB per-event limit. 0.2 captures enough for performance
    // analysis without saturating the ingest endpoint.
    tracesSampleRate: 0.2,
    // Default 100 breadcrumbs can push a single error event over the size limit
    // when combined with deep MobX state snapshots.
    maxBreadcrumbs: 50,
    // Limit serialization depth so large store trees aren't fully expanded.
    normalizeDepth: 3,
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
