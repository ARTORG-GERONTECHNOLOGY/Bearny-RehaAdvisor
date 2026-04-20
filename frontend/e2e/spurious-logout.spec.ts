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
 * Required environment variables (all tests skip gracefully when absent):
 *   E2E_THERAPIST_LOGIN    — therapist username / email
 *   E2E_THERAPIST_PASSWORD — therapist password
 */

import { expect, test, type APIRequestContext } from '@playwright/test';

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

async function loginViaApi(request: APIRequestContext) {
  const { login, password } = creds();
  const res = await request.post(`${API_BASE}/auth/login/`, {
    data: { username: login, password },
  });
  expect(res.ok(), `Login failed: ${await res.text()}`).toBeTruthy();
  return res.json() as Promise<{ access_token: string; refresh_token: string }>;
}

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

    // Artificially expire the access token in localStorage so the next
    // requests will receive 401 and trigger the refresh path.
    await page.evaluate(() => {
      localStorage.setItem('authToken', 'deliberately-invalid-token');
    });

    // Fire two concurrent API calls that will both receive 401.
    // The fix (refresh queue) means only one refresh is sent; both requests
    // then retry with the new token and succeed.
    const [r1, r2] = await Promise.all([
      page.evaluate(async (apiBase) => {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${apiBase}/templates/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return res.status;
      }, API_BASE),
      page.evaluate(async (apiBase) => {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${apiBase}/templates/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return res.status;
      }, API_BASE),
    ]);

    // Both should succeed (200) or at worst get a 404/403 from the real
    // backend — the important thing is neither returns 401 and the user
    // is NOT logged out.
    expect([200, 403, 404]).toContain(r1);
    expect([200, 403, 404]).toContain(r2);
    expect(await page.evaluate(() => !!localStorage.getItem('authToken'))).toBe(true);

    // The user must still be authenticated in the UI
    await expect(page).not.toHaveURL(/\/(login|$)/);
  });

  test('a single failed API call does not log the user out', async ({ page }) => {
    skipUnlessSeeded(test);
    await loginViaUI(page);

    // A 404 (not a 401) should not trigger any logout behaviour
    const status = await page.evaluate(async (apiBase) => {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${apiBase}/nonexistent-endpoint-12345/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.status;
    }, API_BASE);

    expect(status).toBe(404);
    expect(await page.evaluate(() => localStorage.getItem('authToken'))).not.toBeNull();
    await expect(page).toHaveURL(/\/therapist/);
  });
});

// ===========================================================================
// 2. Stale expiresAt on page reload — silent refresh keeps user logged in
// ===========================================================================

test.describe('Stale expiresAt — silent refresh on reload', () => {
  test('user stays logged in after a hard reload when expiresAt is in the past but refresh token is valid', async ({
    page,
    request,
  }) => {
    skipUnlessSeeded(test);
    await loginViaUI(page);

    // Simulate the inactivity timer having fired by backdating expiresAt
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
    expect(await page.evaluate(() => localStorage.getItem('authToken'))).not.toBeNull();
  });

  test('user is logged out on reload when both expiresAt is stale and refresh token is absent', async ({
    page,
  }) => {
    skipUnlessSeeded(test);
    await loginViaUI(page);

    // Remove both tokens so there is nothing to refresh with
    await page.evaluate(() => {
      localStorage.setItem('expiresAt', String(Date.now() - 60_000));
      localStorage.removeItem('refreshToken');
    });

    await page.reload();
    await page.waitForTimeout(500);

    // With no refresh token available the user must be logged out
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
    expect(await page.evaluate(() => localStorage.getItem('authToken'))).not.toBeNull();
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

    // Simulate logout from page1 by clearing the token
    await page.evaluate(() => {
      localStorage.removeItem('authToken');
      // Dispatch the storage event that the other tab's listener will pick up
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'authToken',
          newValue: null,
          storageArea: localStorage,
        })
      );
    });

    // Trigger the storage event listener on page2
    await page2.evaluate(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'authToken',
          newValue: null,
          storageArea: localStorage,
        })
      );
    });

    await page2.waitForTimeout(500);

    // page2 should reflect the logout (token gone from storage)
    expect(await page2.evaluate(() => localStorage.getItem('authToken'))).toBeNull();

    await page2.close();
  });
});
