import * as Sentry from '@sentry/react';
import { initSentry } from '@/lib/sentry';

jest.mock('@sentry/react', () => ({
  init: jest.fn(),
  browserTracingIntegration: jest.fn(),
  feedbackIntegration: jest.fn(),
}));

describe('initSentry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not initialize Sentry when no DSN is configured', () => {
    // import.meta.env.VITE_SENTRY_DSN is always undefined under Jest
    // (see jest-import-meta-transform.js), so the DSN guard is the only
    // reachable branch here.
    initSentry();
    expect(Sentry.init).not.toHaveBeenCalled();
  });
});
