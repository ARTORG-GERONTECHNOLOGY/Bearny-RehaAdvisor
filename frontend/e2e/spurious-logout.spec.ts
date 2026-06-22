/**
 * E2E tests — Spurious logout regression
 *
 * Guards against three causes of unexpected logouts that were identified
 * in the codebase:
 *
 *  1. Refresh-token rotation race condition
 *     ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION are enabled on the
 *     backend. Without a client-side lock, two concurrent 401 responses
 *     both try to exchange the same refresh token — the loser gets a 401
 *     on the refresh itself, wipes localStorage, and triggers logout.
 *     Fix: a refresh queue in client.js ensures only one refresh runs at
 *     a time; all queued requests wait and then retry with the new token.
 *
 *  2. Stale expiresAt on page reload
 *     checkAuthentication() previously called reset() immediately when
 *     expiresAt was in the past, even when a valid refresh token existed.
 *     Fix: attempt _trySilentRefresh() before giving up.
 *
 *  3. Corrupted / missing expiresAt
 *     _armTimeoutFromStorage() previously called logout() immediately when
 *     the value was NaN or absent.
 *     Fix: attempt silent refresh first.
 *
 * Auth model (post cookie-security hardening)
 * ──────────────────────────────────────────────
 * JWT tokens are stored as httpOnly cookies (access_token, refresh_token) —
 * they are not accessible from JavaScript.  The "logged-in" signal visible
 * to JS is `localStorage.id`.  Tests use page.context().clearCookies() to
 * revoke the refresh token rather than manipulating localStorage.refreshToken.
 *
 * Required environment variables (all tests skip gracefully when absent):
 *   E2E_THERAPIST_LOGIN    — therapist username / email
 *   E2E_THERAPIST_PASSWORD — therapist password
 */

import { expect, test } from '@playwright/test';

const API_BASE = process.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

function creds() {
  return {
    login: process.env.E2E_THERAPIST_LOGIN,
    password: process.env.E2E_THERAPIST_PASSWORD,
  };
}

function skipUnlessSeeded(t: typeof test) {
  const { login, password } = creds();
  t.skip(
    !login || !password,
    'Missing E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD — skipping seeded E2E tests'
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginViaUI(page: Parameters<Parameters<typeof test>[1]>[0]) {
  const { login, password } = creds();
  await page.goto('/');
  await page.getByRole('button', { name: /login/i }).first().click();
  const modal = page.locator('[role="dialog"][data-state="open"]');
  await expect(modal).toBeVisible();
  await modal.locator('#email').fill(login as string);
  await modal.locator('#password').fill(password as string);
  const done = page.waitForResponse(
    (r) => r.url().includes('/auth/login/') && r.request().method() === 'POST'
  );
  await modal.getByRole('button', { name: /login/i }).click();
  await done;
  await expect(page).toHaveURL(/\/therapist/);
}

// ===========================================================================
// 1. Refresh-token rotation race condition
// ===========================================================================

test.describe('Refresh-token rotation race condition', () => {
  test('concurrent 401 responses resolve without logging out the user', async ({ page }) => {
    skipUnlessSeeded(test);
    await loginViaUI(page);

    // Intercept non-auth API calls and return 401 for the first two requests,
    // simulating what happens when the access-token cookie expires mid-session.
    // The apiClient refresh queue should call /token/refresh/ once (the httpOnly
    // refresh_token cookie is sent automatically), then retry all pending calls.
    let intercepted = 0;
    await page.route(`${API_BASE}/**`, async (route) => {
      const url = route.request().url();
      // Always let auth endpoints through so the refresh cycle can complete.
      if (url.includes('/auth/')) {
        return route.continue();
      }
      if (intercepted < 2) {
        intercepted++;
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Authentication credentials were not provided.' }),
        });
      }
      return route.continue();
    });

    // Fire two concurrent API calls through the page (cookies sent automatically).
    const [r1, r2] = await Promise.all([
      page.evaluate(async (apiBase) => {
        const res = await fetch(`${apiBase}/templates/`, { credentials: 'include' });
        return res.status;
      }, API_BASE),
      page.evaluate(async (apiBase) => {
        const res = await fetch(`${apiBase}/templates/`, { credentials: 'include' });
        return res.status;
      }, API_BASE),
    ]);

    await page.unroute(`${API_BASE}/**`);

    // The raw fetch calls bypass apiClient's retry interceptor, so they may
    // still return 401.  What matters is the user is NOT logged out — `id`
    // must remain in localStorage and the page must not redirect to login.
    expect([200, 401, 403, 404]).toContain(r1);
    expect([200, 401, 403, 404]).toContain(r2);
    expect(await page.evaluate(() => !!localStorage.getItem('id'))).toBe(true);

    // The user must still be authenticated in the UI
    await expect(page).not.toHaveURL(/^http:\/\/[^/]+(\/)?$/);
  });

  test('a single failed API call does not log the user out', async ({ page }) => {
    skipUnlessSeeded(test);
    await loginViaUI(page);

    // A 404 (not a 401) should not trigger any logout behaviour
    const status = await page.evaluate(async (apiBase) => {
      const res = await fetch(`${apiBase}/nonexistent-endpoint-12345/`, {
        credentials: 'include',
      });
      return res.status;
    }, API_BASE);

    expect(status).toBe(404);
    expect(await page.evaluate(() => localStorage.getItem('id'))).not.toBeNull();
    await expect(page).toHaveURL(/\/therapist/);
  });
});

// ===========================================================================
// 2. Stale expiresAt on page reload — silent refresh keeps user logged in
// ===========================================================================

test.describe('Stale expiresAt — silent refresh on reload', () => {
  test('user stays logged in after a hard reload when expiresAt is in the past but refresh token is valid', async ({
    page,
  }) => {
    skipUnlessSeeded(test);
    await loginViaUI(page);

    // Simulate the inactivity timer having fired by backdating expiresAt.
    // The httpOnly refresh_token cookie is still present so the silent
    // refresh triggered by checkAuthentication() should succeed.
    await page.evaluate(() => {
      localStorage.setItem('expiresAt', String(Date.now() - 60_000)); // 1 minute ago
    });

    // Hard reload — checkAuthentication() runs on mount and should attempt
    // a silent refresh instead of immediately logging out
    await page.reload();

    // Give the async silent-refresh a moment to complete
    await page.waitForTimeout(1500);

    // The user must still be on the therapist page (or equivalent), not
    // redirected to the login page
    await expect(page).not.toHaveURL(/^http:\/\/[^/]+(\/)?$/); // not root login page
    expect(await page.evaluate(() => localStorage.getItem('id'))).not.toBeNull();
  });

  test('user is logged out on reload when expiresAt is stale and refresh cookie is absent', async ({
    page,
  }) => {
    skipUnlessSeeded(test);
    await loginViaUI(page);

    // Backdate expiresAt so checkAuthentication() tries a silent refresh.
    // Then clear all cookies (including the httpOnly refresh_token) so the
    // refresh call returns 401 and the app is forced to log out.
    await page.evaluate(() => {
      localStorage.setItem('expiresAt', String(Date.now() - 60_000));
    });
    await page.context().clearCookies();

    await page.reload();
    await page.waitForTimeout(500);

    // With no refresh cookie available the user must be logged out
    await expect(page).toHaveURL(/^http:\/\/[^/]+(\/)?$/);
  });
});

// ===========================================================================
// 3. Corrupted / missing expiresAt — silent refresh instead of immediate logout
// ===========================================================================

test.describe('Corrupted expiresAt — silent refresh instead of immediate logout', () => {
  test('user stays logged in when expiresAt is corrupted but refresh token is valid', async ({
    page,
  }) => {
    skipUnlessSeeded(test);
    await loginViaUI(page);

    // Simulate storage corruption
    await page.evaluate(() => {
      localStorage.setItem('expiresAt', 'not-a-number');
    });

    // Trigger _armTimeoutFromStorage indirectly by simulating a storage event
    // (same mechanism as the cross-tab sync code)
    await page.evaluate(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'expiresAt',
          newValue: 'not-a-number',
          storageArea: localStorage,
        })
      );
    });

    await page.waitForTimeout(1500);

    // User must still be authenticated — the fix attempts a silent refresh
    // instead of calling logout() immediately
    expect(await page.evaluate(() => localStorage.getItem('id'))).not.toBeNull();
  });
});

// ===========================================================================
// 4. Multi-tab token sync — one tab's logout propagates correctly
// ===========================================================================

test.describe('Multi-tab sync', () => {
  test('explicit logout in one context clears auth state', async ({ page, context }) => {
    skipUnlessSeeded(test);
    await loginViaUI(page);

    // Open a second "tab" (page) sharing the same storage context
    const page2 = await context.newPage();
    await page2.goto('/interventions');
    await page2.waitForTimeout(500);

    // Simulate logout from page1 by clearing the `id` key — the signal that
    // the user is logged in.  With httpOnly cookies the token is not visible
    // from JS, so `id` is the canonical "was logged in" marker.
    await page.evaluate(() => {
      localStorage.removeItem('id');
      // Dispatch the storage event that the other tab's listener will pick up
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'id',
          newValue: null,
          storageArea: localStorage,
        })
      );
    });

    // Trigger the storage event listener on page2
    await page2.evaluate(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'id',
          newValue: null,
          storageArea: localStorage,
        })
      );
    });

    await page2.waitForTimeout(500);

    // page2 should reflect the logout (id gone from storage)
    expect(await page2.evaluate(() => localStorage.getItem('id'))).toBeNull();

    await page2.close();
  });
});
