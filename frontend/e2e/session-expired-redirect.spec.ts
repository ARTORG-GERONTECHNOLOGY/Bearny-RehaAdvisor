/**
 * E2E tests — Session-expired redirect
 *
 * Verifies that when the backend revokes a user's tokens (e.g. after a
 * therapist resets the patient's password), the frontend detects the dead
 * session and redirects the patient to the login page instead of silently
 * leaving them on a blank / stale page.
 *
 * Mechanism:
 *  1. The apiClient interceptor in client.js catches a 401 on the token
 *     refresh endpoint and dispatches `window.CustomEvent('auth:session-expired')`.
 *  2. The authStore constructor listens for this event and calls logout(),
 *     which clears state and fires the onLogoutCallback → login redirect.
 *
 * The first two tests require no environment variables — they exercise the
 * event-listener contract directly. The third test exercises the full
 * interceptor path and requires a live session (skipped without credentials).
 */

import { expect, test } from '@playwright/test';

const API_BASE = process.env.E2E_API_URL || 'http://127.0.0.1:8001/api';

// ---------------------------------------------------------------------------
// 1. Custom event → logout → redirect (no credentials needed)
// ---------------------------------------------------------------------------

test.describe('auth:session-expired custom event', () => {
  test('dispatching auth:session-expired while logged in redirects to login page', async ({
    page,
  }) => {
    // Navigate first so the app JS (authStore) is running.
    await page.goto('/');

    // Inject a fake logged-in state so the app believes there is an active session.
    await page.evaluate(() => {
      localStorage.setItem('id', 'fake-patient-id-123');
      localStorage.setItem('userType', 'Patient');
      localStorage.setItem('expiresAt', String(Date.now() + 3_600_000));
    });

    // Reload so authStore picks up the fake session via checkAuthentication().
    // We also intercept the silent refresh so it "succeeds" without a real backend.
    await page.route(`${API_BASE}/auth/token/refresh/`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access: 'fake-access-token' }),
      })
    );
    await page.reload();
    await page.waitForTimeout(500);

    // Now simulate the backend revoking the tokens by dispatching the event
    // that the apiClient interceptor would dispatch when /token/refresh/ → 401.
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    });

    // Give the async logout() (which does a best-effort POST /auth/logout/) time to settle.
    await page.waitForTimeout(1000);

    // The user must be back on the login page (root URL) and localStorage cleared.
    await expect(page).toHaveURL(/^http:\/\/[^/]+(\/)?$/);
    expect(await page.evaluate(() => localStorage.getItem('id'))).toBeNull();
  });

  test('dispatching auth:session-expired when not logged in does not crash the app', async ({
    page,
  }) => {
    await page.goto('/');

    // Fire the event on a fresh, unauthenticated page — no error should occur.
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    });

    await page.waitForTimeout(500);
    expect(errors.filter((e) => !e.toLowerCase().includes('favicon'))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Full interceptor path: 401 API → 401 refresh → redirect (needs credentials)
// ---------------------------------------------------------------------------

test.describe('Token refresh 401 → redirect', () => {
  test.skip(
    !process.env.E2E_PATIENT_LOGIN || !process.env.E2E_PATIENT_PASSWORD,
    'Missing E2E_PATIENT_LOGIN / E2E_PATIENT_PASSWORD — skipping live session test'
  );

  test('patient is redirected to login when API returns 401 and token refresh is also rejected', async ({
    page,
  }) => {
    // Log in as a patient using the provided credentials.
    const login = process.env.E2E_PATIENT_LOGIN as string;
    const password = process.env.E2E_PATIENT_PASSWORD as string;

    await page.goto('/');
    await page.getByRole('button', { name: /login/i }).first().click();

    const modal = page.locator('[role="dialog"][data-state="open"]');
    await expect(modal).toBeVisible();
    await modal.locator('#email').fill(login);
    await modal.locator('#password').fill(password);

    const loginDone = page.waitForResponse(
      (r) => r.url().includes('/auth/login/') && r.request().method() === 'POST'
    );
    await modal.getByRole('button', { name: /login/i }).click();
    await loginDone;

    // Wait until the patient is on a patient page.
    await page.waitForURL(/\/patient/, { timeout: 10_000 });

    // Now mock ALL non-auth API calls to return 401 (simulating token revocation
    // by the backend, e.g. after a password reset).
    await page.route(`${API_BASE}/**`, (route) => {
      const url = route.request().url();
      if (url.includes('/auth/token/refresh/')) {
        // Refresh is also rejected — session is truly dead.
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Token is invalid or expired' }),
        });
      }
      if (url.includes('/auth/logout/')) {
        // Allow the best-effort logout call to succeed silently.
        return route.fulfill({ status: 200, body: '{}' });
      }
      if (url.includes('/auth/')) {
        return route.continue();
      }
      // Simulate a revoked access token on every data endpoint.
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Authentication credentials were not provided.' }),
      });
    });

    // Trigger a navigation that causes the patient page to make an API call.
    await page.reload();

    // The interceptor will catch the 401, attempt a refresh (which also 401s),
    // dispatch auth:session-expired, and authStore.logout() will redirect.
    await page.waitForURL(/^http:\/\/[^/]+(\/)?$/, { timeout: 10_000 });

    expect(await page.evaluate(() => localStorage.getItem('id'))).toBeNull();
  });
});
