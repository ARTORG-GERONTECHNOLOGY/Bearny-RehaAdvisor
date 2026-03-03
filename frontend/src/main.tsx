import * as Sentry from '@sentry/react';
import React from 'react';
import i18n from '../i18n'; // Import the i18n config
import { createRoot } from 'react-dom/client';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    sendDefaultPii: true,
    tracesSampleRate: 1.0,
    integrations: [Sentry.browserTracingIntegration()],
  });
}
import 'bootstrap-icons/font/bootstrap-icons.css';
import { I18nextProvider } from 'react-i18next';
import { Router } from '@/routes/index';
import '@/assets/styles/index.css'; // TODO: link in index.html for global styles after fully removing Bootstrap
import '@/assets/styles/custom-bootstrap.scss'; // Custom Bootstrap overrides (TODO: remove after redesign with Tailwind is complete)

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <Router />
    </I18nextProvider>
  </React.StrictMode>
);

// Service Worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => console.log('SW registered:', registration))
      .catch((registrationError) => console.log('SW registration failed:', registrationError));
  });
}
