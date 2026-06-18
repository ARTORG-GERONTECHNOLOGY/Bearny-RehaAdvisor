/**
 * Security regression tests for /api/admin/ endpoint authentication.
 *
 * Background
 * ──────────
 * All admin endpoints were publicly accessible without any credentials because
 * @permission_classes([IsAuthenticated]) without @api_view is silently ignored
 * by DRF on plain Django function-based views. The fix:
 *   1. Added @api_view + @permission_classes([IsAdmin]) to all admin views.
 *   2. Added JWTAuthMiddleware to enforce Bearer tokens at the Django level.
 *
 * These tests guard against regression — if someone accidentally removes
 * @api_view or the middleware, CI will catch it before it ships.
 *
 * They run against the real API server (no mocks) and require no credentials,
 * so they always run in CI regardless of whether seeded accounts exist.
 *
 * Expected results
 * ─────────────────
 * • No Authorization header → 401
 * • Valid JWT but role != Admin → 403
 */

import { expect, test, type APIRequestContext } from '@playwright/test';

const API_BASE = process.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

// ---------------------------------------------------------------------------
// Admin endpoints under test — add any new /api/admin/ route here
// ---------------------------------------------------------------------------

const ADMIN_ENDPOINTS: Array<{ method: 'GET' | 'POST' | 'DELETE'; path: string }> = [
  { method: 'GET', path: '/admin/export/patients/?clinics=all' },
  { method: 'GET', path: '/admin/export/clinics/' },
  { method: 'GET', path: '/admin/interventions/' },
  { method: 'GET', path: '/admin/questionnaires/' },
  { method: 'GET', path: '/admin/pending-users/' },
  { method: 'POST', path: '/admin/accept-user/' },
  { method: 'POST', path: '/admin/decline-user/' },
  { method: 'GET', path: '/admin/access-change-requests/' },
];

// ---------------------------------------------------------------------------
// Helper — obtain a non-admin (therapist) JWT so we can assert 403
// ---------------------------------------------------------------------------

async function getTherapistToken(request: APIRequestContext): Promise<string | null> {
  const login = process.env.E2E_THERAPIST_LOGIN;
  const password = process.env.E2E_THERAPIST_PASSWORD;

  if (!login || !password) return null;

  // login_view returns an access token directly (no 2FA for API-level call)
  const res = await request.post(`${API_BASE}/auth/login/`, {
    data: { email: login, password },
  });
  if (!res.ok()) return null;

  const body = await res.json();
  return body?.access ?? null;
}

// ---------------------------------------------------------------------------
// Unauthenticated access — must return 401
// ---------------------------------------------------------------------------

test.describe('Admin endpoints — unauthenticated access returns 401', () => {
  for (const { method, path } of ADMIN_ENDPOINTS) {
    test(`${method} ${path}`, async ({ request }) => {
      const res = await request[method.toLowerCase() as 'get' | 'post' | 'delete'](
        `${API_BASE}${path}`
      );
      // 401 = no credentials provided (from JWTAuthMiddleware or DRF)
      expect(res.status()).toBe(401);
    });
  }
});

// ---------------------------------------------------------------------------
// Non-admin authenticated access — must return 403
// ---------------------------------------------------------------------------

test.describe('Admin endpoints — non-admin JWT returns 403', () => {
  // These tests require a seeded non-admin account (therapist role).
  // They skip gracefully when credentials are absent.

  for (const { method, path } of ADMIN_ENDPOINTS) {
    test(`${method} ${path}`, async ({ request }) => {
      const token = await getTherapistToken(request);
      test.skip(
        !token,
        'E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD not set — skipping non-admin 403 checks'
      );

      const res = await request[method.toLowerCase() as 'get' | 'post' | 'delete'](
        `${API_BASE}${path}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // 403 = authenticated but wrong role (from IsAdmin permission class)
      expect(res.status()).toBe(403);
    });
  }
});

// ---------------------------------------------------------------------------
// Smoke: public auth endpoints are NOT blocked by the middleware
// ---------------------------------------------------------------------------

test.describe('Public endpoints — no token required', () => {
  test('POST /auth/login/ is reachable without a token', async ({ request }) => {
    // We expect 400/401 from the login logic (wrong credentials), not from
    // the middleware. A 401 from the middleware would have a specific message.
    const res = await request.post(`${API_BASE}/auth/login/`, {
      data: { email: 'no-such-user@example.com', password: 'wrong' },
    });
    // The middleware returns 401 with {"detail":"..."} — any other response
    // (including the login view's own 401/400 for bad credentials) means
    // the middleware correctly let the request through.
    if (res.status() === 401) {
      const body = await res.json();
      expect(body).not.toHaveProperty('detail', 'Authentication credentials were not provided.');
    }
    // 400 or 401 from the login view itself are both acceptable
    expect([400, 401]).toContain(res.status());
  });

  test('POST /auth/register/ is reachable without a token', async ({ request }) => {
    const res = await request.post(`${API_BASE}/auth/register/`, {
      data: { email: '', password: '' },
    });
    // Middleware would return 401 {"detail":"..."}; any other response is fine
    if (res.status() === 401) {
      const body = await res.json();
      expect(body).not.toHaveProperty('detail', 'Authentication credentials were not provided.');
    }
    expect([400, 422]).toContain(res.status());
  });
});
