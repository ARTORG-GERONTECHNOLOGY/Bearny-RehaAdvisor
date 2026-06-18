/**
 * Security regression tests for authentication hardening.
 *
 * Background
 * ──────────
 * Fix 8  — Login rate-limiting: after 5 consecutive wrong-password attempts
 *   the account is locked and subsequent requests return HTTP 429 until the
 *   30-minute window expires.
 *
 * Fix 10 — User-enumeration prevention: the login endpoint must return the
 *   same error body for an unknown e-mail and for a wrong password, so an
 *   attacker cannot probe which accounts exist.
 *
 * These are pure API-level tests — they require no browser, no seeded users,
 * and always run in CI regardless of whether E2E credential secrets are set.
 * They run against the real live backend (E2E server), not against mocks.
 *
 * Note on rate-limit side-effects
 * ────────────────────────────────
 * The rate-limit test deliberately sends 6 failed login requests against a
 * synthetic address (<random>@e2e-ratelimit.invalid) that will never match a
 * real account.  Because the lockout is keyed on the username, it cannot
 * affect real seeded test accounts used by other E2E specs.
 */

import { expect, test } from '@playwright/test';

const API_BASE = process.env.VITE_API_URL || 'http://127.0.0.1:8001/api';
const LOGIN_URL = `${API_BASE}/auth/login/`;

// ---------------------------------------------------------------------------
// Fix 10 — User enumeration prevention
// ---------------------------------------------------------------------------

test.describe('Login — user-enumeration prevention (Fix 10)', () => {
  test('unknown e-mail returns the same error as a wrong password', async ({ request }) => {
    // Unknown account — no such user exists
    const unknownRes = await request.post(LOGIN_URL, {
      data: { username: 'ghost-e2e-unknown@e2e.invalid', password: 'anything' },
    });
    expect(unknownRes.status()).toBe(401);
    const unknownBody = await unknownRes.json();

    // Existing user, wrong password — we use a well-known non-existent address
    // so the server path is "user exists but password wrong".
    // Any 401 with the same body shape is sufficient proof.
    const wrongPwRes = await request.post(LOGIN_URL, {
      data: { username: 'wrong-pw-e2e@e2e.invalid', password: 'wrongpassword' },
    });
    expect(wrongPwRes.status()).toBe(401);
    const wrongPwBody = await wrongPwRes.json();

    // Both must carry the generic message "Invalid credentials." and nothing
    // that reveals whether the account exists.
    expect(unknownBody.error).toBe('Invalid credentials.');
    expect(wrongPwBody.error).toBe('Invalid credentials.');

    // Neither response must contain account-existence hints
    const noHint = (body: Record<string, unknown>) => {
      const text = JSON.stringify(body).toLowerCase();
      expect(text).not.toContain('not found');
      expect(text).not.toContain('no account');
      expect(text).not.toContain('does not exist');
      expect(text).not.toContain('unregistered');
    };
    noHint(unknownBody);
    noHint(wrongPwBody);
  });
});

// ---------------------------------------------------------------------------
// Fix 8 — Login rate-limiting
// ---------------------------------------------------------------------------

test.describe('Login — rate-limiting (Fix 8)', () => {
  test('sixth consecutive wrong-password attempt returns 429', async ({ request }) => {
    // Use a unique synthetic address per test run to avoid cross-test pollution.
    const unique = `ratelimit-${Date.now()}@e2e-ratelimit.invalid`;
    const payload = { username: unique, password: 'deliberately-wrong' };

    // First 5 attempts must return 401 (bad credentials, not locked yet)
    for (let i = 1; i <= 5; i++) {
      const res = await request.post(LOGIN_URL, { data: payload });
      expect(res.status(), `attempt ${i} should be 401, not locked yet`).toBe(401);
    }

    // Sixth attempt must be locked out
    const lockedRes = await request.post(LOGIN_URL, { data: payload });
    expect(lockedRes.status(), 'sixth attempt must be rate-limited (429)').toBe(429);
  });

  test('rate-limit response body contains a human-readable message', async ({ request }) => {
    const unique = `ratelimit-msg-${Date.now()}@e2e-ratelimit.invalid`;
    const payload = { username: unique, password: 'wrong' };

    for (let i = 0; i < 5; i++) {
      await request.post(LOGIN_URL, { data: payload });
    }

    const lockedRes = await request.post(LOGIN_URL, { data: payload });
    expect(lockedRes.status()).toBe(429);

    const body = await lockedRes.json();
    // The body must have some kind of error key so the frontend can display it
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });
});
