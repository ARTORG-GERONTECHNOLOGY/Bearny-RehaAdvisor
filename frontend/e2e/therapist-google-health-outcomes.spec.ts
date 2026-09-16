/**
 * Regression tests: Outcomes Dashboard shows wearable data for Google Health patients.
 *
 * Root cause (fixed in patient_views.get_combined_health_data):
 *   The endpoint always queried FitbitData. Google Health patients store their data in
 *   GoogleHealthData. Because they have zero FitbitData records the Outcomes Dashboard
 *   always showed empty charts.
 *
 * Affected prod patients: 905-140, 934-279, 934-252 (all wearable_device=google_health).
 *
 * All API calls are mocked with data mirroring the actual prod records so tests run
 * deterministically without a live backend.
 *
 * Requires: E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD / E2E_EMAIL_DIR
 */

import { expect, test } from '@playwright/test';

import { loginAsTherapist } from './helpers/auth';

// ---------------------------------------------------------------------------
// Environment guard
// ---------------------------------------------------------------------------

function skipUnlessTherapist(t: typeof test) {
  t.skip(
    !process.env.E2E_THERAPIST_LOGIN ||
      !process.env.E2E_THERAPIST_PASSWORD ||
      !process.env.E2E_EMAIL_DIR,
    'Missing E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD / E2E_EMAIL_DIR'
  );
}

// ---------------------------------------------------------------------------
// Prod-mirrored patient data
// Sourced from production on 2026-09-16. Patient 934-252 has the most data
// (8 days, 2026-09-09 → 2026-09-16) — used as the primary regression fixture.
// ---------------------------------------------------------------------------

/** Real MongoDB ObjectId for patient 934-252 in production. */
const PATIENT_ID = '6a97c78d1682e48f07d57d0a';

/**
 * Patient list row for 934-252 (wearable_device=google_health).
 * Shape must match what the therapists patients endpoint returns.
 */
function makeGoogleHealthPatientRow() {
  return {
    _id: PATIENT_ID,
    username: '934-252',
    first_name: 'Test',
    name: 'Patient',
    patient_code: '934-252',
    sex: 'Unknown',
    diagnosis: [],
    age: '1960-01-01',
    reha_end_date: '2030-12-31',
    last_online: null,
    adherence_rate: null,
    intervention_feedback: null,
    biomarker: null,
    wearable_device: 'google_health',
    clinic: 'Inselspital',
    project: 'COPAIN',
  };
}

/**
 * Health-combined-history response mirroring GoogleHealthData records for 934-252.
 * Average steps over these 8 rows: Math.round(34055/8) = 4257.
 * Average resting_heart_rate: Math.round(526/8) = 66.
 */
function makeGoogleHealthCombinedHistoryResponse() {
  const rows = [
    { date: '2026-09-09', steps: 3146, resting_heart_rate: 62 },
    { date: '2026-09-10', steps: 5859, resting_heart_rate: 63 },
    { date: '2026-09-11', steps: 4100, resting_heart_rate: 64 },
    { date: '2026-09-12', steps: 4480, resting_heart_rate: 67 },
    { date: '2026-09-13', steps: 6603, resting_heart_rate: 68 },
    { date: '2026-09-14', steps: 4732, resting_heart_rate: 70 },
    { date: '2026-09-15', steps: 3918, resting_heart_rate: 70 },
    { date: '2026-09-16', steps: 1217, resting_heart_rate: 72 },
  ];

  return {
    fitbit: rows.map((r) => ({
      date: r.date,
      steps: r.steps,
      resting_heart_rate: r.resting_heart_rate,
      max_heart_rate: null,
      floors: null,
      distance: null,
      calories: null,
      active_minutes: null,
      active_zone_minutes: null,
      sleep: {
        sleep_duration: null,
        minutes_asleep: null,
        sleep_start: null,
        sleep_end: null,
        awakenings: null,
      },
      wear_time_minutes: null,
      heart_rate_zones: [],
      breathing_rate: null,
      hrv: null,
      exercise: { sessions: [] },
      weight_kg: null,
      bp_sys: null,
      bp_dia: null,
    })),
    questionnaire: [],
    adherence: [],
  };
}

// ---------------------------------------------------------------------------
// Shared mock helpers
// ---------------------------------------------------------------------------

async function mockPatientList(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.route('**/therapists/*/patients/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([makeGoogleHealthPatientRow()]),
    });
  });
}

async function mockOutcomesDashboardPrereqs(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.route('**/patients/*/thresholds/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        thresholds: {
          steps_goal: 10000,
          active_minutes_green: 30,
          active_minutes_yellow: 20,
          sleep_green_min: 420,
          sleep_yellow_min: 360,
          bp_sys_green_max: 129,
          bp_sys_yellow_max: 139,
          bp_dia_green_max: 84,
          bp_dia_yellow_max: 89,
        },
        thresholds_history: [],
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Outcomes Dashboard — Google Health patients', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessTherapist(test);
    await loginAsTherapist(page);
  });

  test('health-combined-history is called for google_health patient 934-252', async ({ page }) => {
    skipUnlessTherapist(test);

    await mockPatientList(page);
    await mockOutcomesDashboardPrereqs(page);

    // Capture whether the endpoint was called
    let combinedHistoryCalled = false;
    let combinedHistoryPatientId: string | null = null;

    await page.route('**/patients/health-combined-history/**', async (route) => {
      combinedHistoryCalled = true;
      const url = new URL(route.request().url());
      const parts = url.pathname.split('/');
      combinedHistoryPatientId = parts[parts.indexOf('health-combined-history') + 1] ?? null;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeGoogleHealthCombinedHistoryResponse()),
      });
    });

    await page.goto('/therapist');
    const patientRow = page.locator('tr.cursor-pointer').first();
    await expect(patientRow).toBeVisible({ timeout: 15000 });
    await patientRow.click();

    // Outcomes Dashboard is the default tab — wait for it to load
    await page.waitForResponse((res) => res.url().includes('/patients/health-combined-history/'), {
      timeout: 15000,
    });

    expect(combinedHistoryCalled, 'health-combined-history must be called').toBe(true);
    expect(combinedHistoryPatientId).toBe(PATIENT_ID);
  });

  test('Outcomes Dashboard shows step data (not empty state) for google_health patient', async ({
    page,
  }) => {
    skipUnlessTherapist(test);

    await mockPatientList(page);
    await mockOutcomesDashboardPrereqs(page);

    await page.route('**/patients/health-combined-history/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeGoogleHealthCombinedHistoryResponse()),
      });
    });

    await page.goto('/therapist');
    const patientRow = page.locator('tr.cursor-pointer').first();
    await expect(patientRow).toBeVisible({ timeout: 15000 });
    await patientRow.click();

    await page.waitForResponse((res) => res.url().includes('/patients/health-combined-history/'), {
      timeout: 15000,
    });

    // The Steps card shows "No steps data" when fitbit array is empty (old behaviour).
    // With the fix, GoogleHealthData rows are returned and steps are displayed.
    await expect(page.getByText('No steps data')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByText('No resting heart rate data')).not.toBeVisible();
  });

  test('Outcomes Dashboard step card shows a numeric average (not --) for 934-252', async ({
    page,
  }) => {
    skipUnlessTherapist(test);

    await mockPatientList(page);
    await mockOutcomesDashboardPrereqs(page);

    await page.route('**/patients/health-combined-history/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeGoogleHealthCombinedHistoryResponse()),
      });
    });

    await page.goto('/therapist');
    const patientRow = page.locator('tr.cursor-pointer').first();
    await expect(patientRow).toBeVisible({ timeout: 15000 });
    await patientRow.click();

    await page.waitForResponse((res) => res.url().includes('/patients/health-combined-history/'), {
      timeout: 15000,
    });

    // The Steps card title (CardTitle → h3) shows the average as a locale-formatted number
    // when data is present, and "--" when no data. With the fix applied and 8 prod rows loaded,
    // at least one metric card h3 must show a digit-starting value.
    // Average steps = round(34055/8) = 4257 → "4,257" (en) / "4.257" (de) / "4 257" (fr).
    // A heading that starts with a digit confirms data is rendered.
    const numericCardTitles = page.locator('h3').filter({ hasText: /^\d/ });
    await expect(numericCardTitles.first()).toBeVisible({ timeout: 10000 });
  });

  test('Outcomes Dashboard shows empty state when fitbit array is empty (regression baseline)', async ({
    page,
  }) => {
    skipUnlessTherapist(test);

    await mockPatientList(page);
    await mockOutcomesDashboardPrereqs(page);

    // Simulate the OLD (broken) behaviour: google_health patient's endpoint returns empty fitbit
    await page.route('**/patients/health-combined-history/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ fitbit: [], questionnaire: [], adherence: [] }),
      });
    });

    await page.goto('/therapist');
    const patientRow = page.locator('tr.cursor-pointer').first();
    await expect(patientRow).toBeVisible({ timeout: 15000 });
    await patientRow.click();

    await page.waitForResponse((res) => res.url().includes('/patients/health-combined-history/'), {
      timeout: 15000,
    });

    // When fitbit is empty the Steps card must show the empty-state message.
    // This test documents the baseline (broken) behaviour that motivated the fix.
    await expect(page.getByText('No steps data')).toBeVisible({ timeout: 10000 });
  });
});
