/**
 * E2E tests for the wearable device feature (issue #427).
 *
 * All tests use Playwright's route interception so they do not need a real
 * backend — the therapist/patient login guards (skipUnlessSeeded) ensure that
 * seeded-credential tests are skipped in CI environments without those env vars.
 *
 * Scenarios covered:
 *  - Therapist patient list: WearBadge shows neutral "Omron" chip for omron patient
 *  - Therapist patient list: WearBadge shows neutral "No device" chip for none patient
 *  - Therapist patient list: WearBadge still shows "Disconnected" for revoked Fitbit
 *  - Patient page: Fitbit connect card hidden when wearable_device=omron
 *  - Patient page: Fitbit connect card hidden when wearable_device=none
 *  - Patient page: Fitbit connect card shown for fitbit patient that is not connected
 */

import { expect, test } from '@playwright/test';

import { loginAsTherapist } from './helpers/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function skipUnlessTherapist(t: typeof test) {
  const login = process.env.E2E_THERAPIST_LOGIN;
  const password = process.env.E2E_THERAPIST_PASSWORD;
  const emailDir = process.env.E2E_EMAIL_DIR;
  t.skip(
    !login || !password || !emailDir,
    'Missing E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD / E2E_EMAIL_DIR'
  );
}

function skipUnlessPatient(t: typeof test) {
  const login = process.env.E2E_PATIENT_LOGIN;
  const password = process.env.E2E_PATIENT_PASSWORD;
  t.skip(!login || !password, 'Missing E2E_PATIENT_LOGIN / E2E_PATIENT_PASSWORD');
}

/** Build a minimal patient list row returned by the therapist patients endpoint. */
function makePatientRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: '680000000000000000000001',
    username: 'e2e_wearable_patient',
    first_name: 'E2E',
    name: 'WearableTest',
    patient_code: 'P-WEAR-001',
    sex: 'Male',
    diagnosis: [],
    age: '1980-01-01',
    reha_end_date: '2030-12-31',
    last_online: null,
    adherence_rate: null,
    intervention_feedback: null,
    biomarker: null,
    wearable_device: 'fitbit',
    clinic: 'Inselspital',
    project: 'COPAIN',
    ...overrides,
  };
}

/** Stub the therapist patients list with a single patient having the given wearable_device. */
async function mockPatientList(
  page: Parameters<Parameters<typeof test>[1]>[0],
  wearableDevice: string,
  biomarker: Record<string, unknown> | null = null
) {
  await page.route('**/therapists/*/patients/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([makePatientRow({ wearable_device: wearableDevice, biomarker })]),
    });
  });
}

// ---------------------------------------------------------------------------
// Therapist side — WearBadge
// ---------------------------------------------------------------------------

test.describe('WearBadge on therapist patient list', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessTherapist(test);
    await loginAsTherapist(page);
  });

  test('shows neutral Omron badge (not Disconnected) for omron patient', async ({ page }) => {
    skipUnlessTherapist(test);

    await mockPatientList(page, 'omron');
    await page.goto('/therapist');

    // Wait for at least one patient row to be rendered
    await expect(page.locator('tr.cursor-pointer').first()).toBeVisible({ timeout: 15000 });

    // Should see "Omron" badge label — not the red "Disconnected" badge
    await expect(page.getByText('Omron').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Disconnected')).not.toBeVisible();
  });

  test('shows neutral "No device" badge for patient with wearable_device=none', async ({
    page,
  }) => {
    skipUnlessTherapist(test);

    await mockPatientList(page, 'none');
    await page.goto('/therapist');

    await expect(page.locator('tr.cursor-pointer').first()).toBeVisible({ timeout: 15000 });

    await expect(page.getByText('No device').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Disconnected')).not.toBeVisible();
  });

  test('still shows Disconnected badge for fitbit patient with revoked token', async ({ page }) => {
    skipUnlessTherapist(test);

    await mockPatientList(page, 'fitbit', { fitbit_revoked: true });
    await page.goto('/therapist');

    await expect(page.locator('tr.cursor-pointer').first()).toBeVisible({ timeout: 15000 });

    await expect(page.getByText('Disconnected').first()).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Patient side — Fitbit connect card visibility
// ---------------------------------------------------------------------------

async function loginAsSeededPatient(page: Parameters<typeof test>[0]['page']) {
  const patientLogin = process.env.E2E_PATIENT_LOGIN as string;
  const patientPassword = process.env.E2E_PATIENT_PASSWORD as string;

  await page.goto('/');
  await page.getByRole('button', { name: /login/i }).first().click();

  const modal = page.locator('[role="dialog"][data-state="open"]');
  await expect(modal).toBeVisible();

  await modal.locator('#email').fill(patientLogin);
  await modal.locator('#password').fill(patientPassword);
  await modal.getByRole('button', { name: /login/i }).click();

  await expect(page).toHaveURL(/\/patient(?:\/)?$/, { timeout: 15000 });
  await page.reload({ waitUntil: 'networkidle' });
}

test.describe('Patient page Fitbit connect card visibility', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessPatient(test);
    await loginAsSeededPatient(page);
  });

  test('hides Fitbit connect card when wearable_device is omron', async ({ page }) => {
    skipUnlessPatient(test);

    // Mock the fitbit/status endpoint to return wearable_device=omron
    await page.route('**/fitbit/status/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: false,
          has_data: false,
          last_data: null,
          wearable_device: 'omron',
        }),
      });
    });

    await page.goto('/patient');
    await page.waitForLoadState('networkidle');

    // The Fitbit connect card has "Fitbit" heading and "Fitness Tracker" sub-heading
    // For an omron patient it must not appear
    const fitbitConnectSection = page.locator('text=Fitness Tracker');
    await expect(fitbitConnectSection).not.toBeVisible({ timeout: 5000 });
  });

  test('hides Fitbit connect card when wearable_device is none', async ({ page }) => {
    skipUnlessPatient(test);

    await page.route('**/fitbit/status/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: false,
          has_data: false,
          last_data: null,
          wearable_device: 'none',
        }),
      });
    });

    await page.goto('/patient');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Fitness Tracker')).not.toBeVisible({ timeout: 5000 });
  });

  test('shows Fitbit connect card for unconnected fitbit patient', async ({ page }) => {
    skipUnlessPatient(test);

    await page.route('**/fitbit/status/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: false,
          has_data: false,
          last_data: null,
          wearable_device: 'fitbit',
        }),
      });
    });

    await page.goto('/patient');
    await page.waitForLoadState('networkidle');

    // The Fitbit connect card should be visible for an unconnected Fitbit patient
    await expect(page.locator('text=Fitness Tracker')).toBeVisible({ timeout: 10000 });
  });
});
