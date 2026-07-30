/**
 * E2E tests for Fitbit + Google Health coexistence (PR: feat/wearables-coexistence).
 *
 * All API calls are mocked via Playwright route interception — no real backend tokens
 * needed. Patient login requires E2E_PATIENT_LOGIN / E2E_PATIENT_PASSWORD; therapist
 * tests require E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD / E2E_EMAIL_DIR.
 *
 * Scenarios:
 *  1. Summary endpoint routing — Fitbit patient hits /fitbit/summary/
 *  2. Summary endpoint routing — Google Health patient hits /google-health/summary/
 *  3. Unconnected Fitbit patient — FitbitConnectButton shown (link to fitbit.com)
 *  4. Unconnected Google Health patient — GoogleHealthConnectButton shown
 *  5. ReconnectBanner shown for google_health patient with needs_reconnect=true
 *  6. ReconnectBanner NOT shown for fitbit patient even if GH status flags needs_reconnect
 *  7. fetchStatus fallthrough — Fitbit patient hits both GH status and Fitbit status
 *  8. Disconnect routing — Fitbit patient calls /fitbit/disconnect/
 *  9. Disconnect routing — Google Health patient calls /google-health/disconnect/
 * 10. Therapist WearBadge — google_health patient shows "No data" (not "Disconnected")
 */

import { expect, test } from '@playwright/test';
import { loginAsTherapist } from './helpers/auth';

// ---------------------------------------------------------------------------
// Environment guards
// ---------------------------------------------------------------------------

function skipUnlessPatient(t: typeof test) {
  t.skip(
    !process.env.E2E_PATIENT_LOGIN || !process.env.E2E_PATIENT_PASSWORD,
    'Missing E2E_PATIENT_LOGIN / E2E_PATIENT_PASSWORD'
  );
}

function skipUnlessTherapist(t: typeof test) {
  t.skip(
    !process.env.E2E_THERAPIST_LOGIN ||
      !process.env.E2E_THERAPIST_PASSWORD ||
      !process.env.E2E_EMAIL_DIR,
    'Missing E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD / E2E_EMAIL_DIR'
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAsPatient(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.goto('/');
  await page.getByRole('button', { name: /login/i }).first().click();

  const modal = page.locator('[role="dialog"][data-state="open"]');
  await expect(modal).toBeVisible();
  await modal.locator('#email').fill(process.env.E2E_PATIENT_LOGIN as string);
  await modal.locator('#password').fill(process.env.E2E_PATIENT_PASSWORD as string);
  await modal.getByRole('button', { name: /login/i }).click();

  await expect(page).toHaveURL(/\/patient(?:\/)?$/, { timeout: 15000 });
  await page.reload({ waitUntil: 'networkidle' });
}

/** Minimal summary response that satisfies the store without triggering errors. */
function emptySummary() {
  return {
    connected: true,
    last_sync: null,
    thresholds: { steps_goal: 10000, active_minutes_green: 30 },
    today: { steps: 0, active_minutes: 0 },
    period: { days: 7, daily: [] },
  };
}

/**
 * Mock both status endpoints.
 * fetchStatus() always calls /google-health/status/ first (to read wearable_device),
 * then falls through to /fitbit/status/ for non-google_health patients.
 */
async function mockStatus(
  page: Parameters<Parameters<typeof test>[1]>[0],
  device: 'fitbit' | 'google_health' | 'omron' | 'none',
  opts: { connected?: boolean; needsReconnect?: boolean; daysUntilExpiry?: number | null } = {}
) {
  const { connected = false, needsReconnect = false, daysUntilExpiry = null } = opts;

  await page.route('**/google-health/status/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        connected: device === 'google_health' ? connected : false,
        has_data: false,
        last_data: null,
        needs_reconnect: needsReconnect,
        days_until_expiry: daysUntilExpiry,
        wearable_device: device,
      }),
    })
  );

  if (device !== 'google_health') {
    await page.route('**/fitbit/status/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ connected, has_data: false, last_data: null }),
      })
    );
  }
}

function makePatientRow(wearableDevice: string, biomarker: Record<string, unknown> | null = null) {
  return {
    _id: '680000000000000000000099',
    username: 'e2e_coexistence',
    first_name: 'E2E',
    name: 'Coexistence',
    patient_code: 'P-CO-001',
    sex: 'Male',
    diagnosis: [],
    age: '1990-01-01',
    reha_end_date: '2030-12-31',
    last_online: null,
    adherence_rate: null,
    intervention_feedback: null,
    biomarker,
    wearable_device: wearableDevice,
    clinic: 'Inselspital',
    project: 'COPAIN',
  };
}

// ---------------------------------------------------------------------------
// 1 & 2 — Summary endpoint routing
// ---------------------------------------------------------------------------

test.describe('Summary endpoint routing', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessPatient(test);
    await loginAsPatient(page);
  });

  test('Fitbit patient fetches summary from /fitbit/summary/', async ({ page }) => {
    skipUnlessPatient(test);

    await mockStatus(page, 'fitbit', { connected: true });

    await page.route('**/fitbit/summary/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptySummary()),
      })
    );

    // If the store incorrectly calls /google-health/summary/, we want to detect it
    let ghSummaryCalled = false;
    await page.route('**/google-health/summary/**', (route) => {
      ghSummaryCalled = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    const fitbitSummaryReq = page.waitForRequest(
      (req) => req.method() === 'GET' && req.url().includes('/fitbit/summary/'),
      { timeout: 10000 }
    );

    await page.goto('/patient');
    await fitbitSummaryReq;

    expect(ghSummaryCalled, 'should not call /google-health/summary/ for Fitbit patient').toBe(
      false
    );
  });

  test('Google Health patient fetches summary from /google-health/summary/', async ({ page }) => {
    skipUnlessPatient(test);

    await mockStatus(page, 'google_health', { connected: true });

    await page.route('**/google-health/summary/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptySummary()),
      })
    );

    let fitbitSummaryCalled = false;
    await page.route('**/fitbit/summary/**', (route) => {
      fitbitSummaryCalled = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    const ghSummaryReq = page.waitForRequest(
      (req) => req.method() === 'GET' && req.url().includes('/google-health/summary/'),
      { timeout: 10000 }
    );

    await page.goto('/patient');
    await ghSummaryReq;

    expect(
      fitbitSummaryCalled,
      'should not call /fitbit/summary/ for Google Health patient'
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3 & 4 — Connect button rendering
// ---------------------------------------------------------------------------

test.describe('Connect button rendering', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessPatient(test);
    await loginAsPatient(page);
  });

  test('unconnected Fitbit patient sees Fitbit connect button', async ({ page }) => {
    skipUnlessPatient(test);

    await mockStatus(page, 'fitbit', { connected: false });
    await page.route('**/fitbit/summary/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...emptySummary(), connected: false }),
      })
    );

    await page.goto('/patient');
    await page.waitForLoadState('networkidle');

    // ActivitySection shows "Fitbit" heading and FitbitConnectButton with link to fitbit.com
    await expect(page.locator('text=Fitness Tracker')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Fitbit').first()).toBeVisible();

    const connectLink = page.getByRole('link', { name: /connect fitbit/i });
    await expect(connectLink).toBeVisible({ timeout: 5000 });
    const href = await connectLink.getAttribute('href');
    expect(href).toContain('fitbit.com/oauth2/authorize');
  });

  test('unconnected Google Health patient sees Google Health connect button', async ({ page }) => {
    skipUnlessPatient(test);

    await mockStatus(page, 'google_health', { connected: false });
    await page.route('**/google-health/summary/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...emptySummary(), connected: false }),
      })
    );

    await page.goto('/patient');
    await page.waitForLoadState('networkidle');

    // ActivitySection shows "Google Health" heading and GoogleHealthConnectButton
    await expect(page.locator('text=Fitness Tracker')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Google Health').first()).toBeVisible();

    const connectLink = page.getByRole('link', { name: /connect google health/i });
    await expect(connectLink).toBeVisible({ timeout: 5000 });
    const href = await connectLink.getAttribute('href');
    expect(href).toContain('accounts.google.com');
  });
});

// ---------------------------------------------------------------------------
// 5 & 6 — ReconnectBanner gating
// ---------------------------------------------------------------------------

test.describe('ReconnectBanner gating', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessPatient(test);
    await loginAsPatient(page);
  });

  test('ReconnectBanner shown for google_health patient with needs_reconnect=true', async ({
    page,
  }) => {
    skipUnlessPatient(test);

    await mockStatus(page, 'google_health', {
      connected: true,
      needsReconnect: true,
      daysUntilExpiry: 2,
    });
    await page.route('**/google-health/summary/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptySummary()),
      })
    );

    await page.goto('/patient');
    await expect(page.getByRole('link', { name: /reconnect/i })).toBeVisible({ timeout: 10000 });
  });

  test('ReconnectBanner NOT shown for fitbit patient even when GH status has needs_reconnect', async ({
    page,
  }) => {
    skipUnlessPatient(test);

    // Simulate a scenario where GH status returns needs_reconnect=true but for a Fitbit patient.
    // The banner must not appear because wearable_device !== 'google_health'.
    await mockStatus(page, 'fitbit', {
      connected: true,
      needsReconnect: true,
      daysUntilExpiry: 1,
    });
    await page.route('**/fitbit/summary/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptySummary()),
      })
    );

    await page.goto('/patient');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('link', { name: /reconnect/i })).not.toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// 7 — fetchStatus fallthrough for Fitbit patients
// ---------------------------------------------------------------------------

test.describe('fetchStatus fallthrough', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessPatient(test);
    await loginAsPatient(page);
  });

  test('Fitbit patient hits GH status first then Fitbit status for connected state', async ({
    page,
  }) => {
    skipUnlessPatient(test);

    let ghStatusCalled = false;
    let fitbitStatusCalled = false;

    await page.route('**/google-health/status/**', (route) => {
      ghStatusCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: false,
          wearable_device: 'fitbit',
          needs_reconnect: false,
          days_until_expiry: null,
        }),
      });
    });

    await page.route('**/fitbit/status/**', (route) => {
      fitbitStatusCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ connected: false, has_data: false }),
      });
    });

    await page.route('**/fitbit/summary/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptySummary()),
      })
    );

    await page.goto('/patient');
    await page.waitForLoadState('networkidle');

    expect(ghStatusCalled, '/google-health/status/ must be called').toBe(true);
    expect(fitbitStatusCalled, '/fitbit/status/ must be called as fallthrough').toBe(true);
  });

  test('Google Health patient does NOT hit Fitbit status endpoint', async ({ page }) => {
    skipUnlessPatient(test);

    let fitbitStatusCalled = false;

    await page.route('**/google-health/status/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: true,
          wearable_device: 'google_health',
          needs_reconnect: false,
          days_until_expiry: null,
        }),
      })
    );

    await page.route('**/fitbit/status/**', (route) => {
      fitbitStatusCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ connected: false }),
      });
    });

    await page.route('**/google-health/summary/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptySummary()),
      })
    );

    await page.goto('/patient');
    await page.waitForLoadState('networkidle');

    expect(fitbitStatusCalled, '/fitbit/status/ must NOT be called for GH patient').toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8 & 9 — Disconnect routing
// ---------------------------------------------------------------------------

test.describe('Disconnect routing', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessPatient(test);
    await loginAsPatient(page);
  });

  test('Fitbit connected patient disconnect calls /fitbit/disconnect/', async ({ page }) => {
    skipUnlessPatient(test);

    await mockStatus(page, 'fitbit', { connected: true });
    await page.route('**/fitbit/summary/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptySummary()),
      })
    );

    let fitbitDisconnectCalled = false;
    let ghDisconnectCalled = false;

    await page.route('**/fitbit/disconnect/**', (route) => {
      fitbitDisconnectCalled = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.route('**/google-health/disconnect/**', (route) => {
      ghDisconnectCalled = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });

    await page.goto('/patient');
    await page.waitForLoadState('networkidle');

    // FitbitStatus shows "Disconnect Fitbit" for connected Fitbit patients
    const disconnectBtn = page.getByRole('button', { name: /disconnect fitbit/i });
    await expect(disconnectBtn).toBeVisible({ timeout: 10000 });
    await disconnectBtn.click();

    await page.waitForTimeout(500);

    expect(fitbitDisconnectCalled, '/fitbit/disconnect/ must be called').toBe(true);
    expect(ghDisconnectCalled, '/google-health/disconnect/ must NOT be called').toBe(false);
  });

  test('Google Health connected patient disconnect calls /google-health/disconnect/', async ({
    page,
  }) => {
    skipUnlessPatient(test);

    await mockStatus(page, 'google_health', { connected: true });
    await page.route('**/google-health/summary/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptySummary()),
      })
    );

    let fitbitDisconnectCalled = false;
    let ghDisconnectCalled = false;

    await page.route('**/fitbit/disconnect/**', (route) => {
      fitbitDisconnectCalled = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.route('**/google-health/disconnect/**', (route) => {
      ghDisconnectCalled = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });

    await page.goto('/patient');
    await page.waitForLoadState('networkidle');

    // GoogleHealthStatus shows "Disconnect" for connected GH patients
    const disconnectBtn = page.getByRole('button', { name: /disconnect/i }).first();
    await expect(disconnectBtn).toBeVisible({ timeout: 10000 });
    await disconnectBtn.click();

    await page.waitForTimeout(500);

    expect(ghDisconnectCalled, '/google-health/disconnect/ must be called').toBe(true);
    expect(fitbitDisconnectCalled, '/fitbit/disconnect/ must NOT be called').toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10 — Therapist WearBadge for google_health patient
// ---------------------------------------------------------------------------

test.describe('WearBadge for google_health patient', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessTherapist(test);
    await loginAsTherapist(page);
  });

  test('google_health patient shows No data badge (not Disconnected)', async ({ page }) => {
    skipUnlessTherapist(test);

    await page.route('**/therapists/*/patients/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([makePatientRow('google_health', null)]),
      });
    });

    await page.goto('/therapist');
    await expect(page.locator('tr.cursor-pointer').first()).toBeVisible({ timeout: 15000 });

    // google_health falls through the Fitbit path in WearBadge with no biomarker data
    // → shows "No data" badge (not "Disconnected" which is only for revoked tokens)
    await expect(page.getByText('Disconnected')).not.toBeVisible({ timeout: 5000 });
  });

  test('google_health patient WearBadge shows No data when biomarker is absent', async ({
    page,
  }) => {
    skipUnlessTherapist(test);

    await page.route('**/therapists/*/patients/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          makePatientRow('google_health', {
            wear_time_days_since: null,
            wear_time_avg_min: null,
            fitbit_revoked: false,
            fitbit_no_token: false,
          }),
        ]),
      });
    });

    await page.goto('/therapist');
    await expect(page.locator('tr.cursor-pointer').first()).toBeVisible({ timeout: 15000 });

    await expect(page.getByText('No data').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Disconnected')).not.toBeVisible();
  });
});
