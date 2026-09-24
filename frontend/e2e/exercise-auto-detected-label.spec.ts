/**
 * E2E tests for exercise auto-detected tooltip label.
 *
 * Google Health (and Fitbit) auto-detected exercise sessions have no specific
 * activity name from the device; the backend stores the fallback string "Exercise".
 * The chart is expected to map this to a translated "(automatic)" label so the
 * user can distinguish auto-detected sessions from manually-named ones.
 *
 * All API calls are mocked — no real wearable tokens needed.
 * Requires E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD / E2E_EMAIL_DIR.
 *
 * Scenarios:
 *  1. Exercise chart renders (not empty state) when sessions are present
 *  2. Auto-detected sessions (name='Exercise') show '(automatic)' in tooltip
 *  3. Specifically-named sessions (e.g., 'Walk') show the raw name in tooltip,
 *     without the '(automatic)' suffix
 */

import { expect, test } from '@playwright/test';
import { loginAsTherapist } from './helpers/auth';

// ---------------------------------------------------------------------------
// Guard
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
// Fixtures
// ---------------------------------------------------------------------------

const PATIENT_ID = '6b0000000000000000000042';

function makePatientRow() {
  return {
    _id: PATIENT_ID,
    username: 'e2e_exercise',
    first_name: 'E2E',
    name: 'Exercise',
    patient_code: 'EX-001',
    sex: 'Male',
    diagnosis: [],
    age: '1985-06-15',
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

/** One day with two sessions whose name matches the backend fallback. */
function makeCombinedHistoryWithAutoDetectedSessions() {
  return makeCombinedHistory([
    { name: 'Exercise', duration: 1260000 }, // 21 min
    { name: 'Exercise', duration: 1020000 }, // 17 min
  ]);
}

/** One day with a single session that has a specific device-provided name. */
function makeCombinedHistoryWithNamedSession(sessionName: string) {
  return makeCombinedHistory([{ name: sessionName, duration: 1800000 }]); // 30 min
}

function makeCombinedHistory(sessions: { name: string; duration: number }[]) {
  return {
    fitbit: [
      {
        date: '2026-09-15',
        steps: 4200,
        resting_heart_rate: 62,
        max_heart_rate: null,
        floors: null,
        distance: null,
        calories: null,
        active_minutes: 45,
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
        exercise: { sessions },
        weight_kg: null,
        bp_sys: null,
        bp_dia: null,
      },
    ],
    questionnaire: [],
    adherence: [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mockPrereqs(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.route('**/therapists/*/patients/', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([makePatientRow()]),
    })
  );
  await page.route('**/patients/*/thresholds/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        thresholds: { steps_goal: 10000, active_minutes_green: 30 },
        thresholds_history: [],
      }),
    })
  );
}

async function navigateToPatientDashboard(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.goto('/therapist');
  const patientRow = page.locator('tr.cursor-pointer').first();
  await expect(patientRow).toBeVisible({ timeout: 15000 });
  await patientRow.click();
  await page.waitForResponse((res) => res.url().includes('/patients/health-combined-history/'), {
    timeout: 15000,
  });
}

/**
 * Hover over the centre of the exercise BarChart SVG to trigger the Recharts
 * tooltip, then return the tooltip element for assertions.
 */
async function hoverExerciseChart(page: Parameters<Parameters<typeof test>[1]>[0]) {
  // The MetricCard for exercises contains the label text "Exercises" (or the
  // locale equivalent) inside a CardDescription.  We scope to that card so we
  // don't accidentally interact with any other chart on the page.
  const exerciseCard = page
    .locator('[class*="CardDescription"]')
    .filter({ hasText: /exercises/i })
    .locator('..') // CardDescription parent
    .locator('..') // CardHeader parent
    .locator('..'); // Card root

  // Recharts renders the chart as an SVG; hover anywhere over it to trigger the
  // nearest-bar tooltip (Recharts uses chart-wide mouse tracking, not per-rect).
  const chartSvg = exerciseCard.locator('svg').first();
  await expect(chartSvg).toBeVisible({ timeout: 10000 });

  const bbox = await chartSvg.boundingBox();
  if (!bbox) throw new Error('Exercise chart SVG has no bounding box');

  // Hover slightly left of centre — where the single data-point bar sits.
  await page.mouse.move(bbox.x + bbox.width * 0.45, bbox.y + bbox.height * 0.5);

  // The SessionTooltip is a grid div with border and shadow-xl; wait for it.
  const tooltip = page.locator('div.shadow-xl').filter({ has: page.locator('div.grid.gap-1') });
  await expect(tooltip.first()).toBeVisible({ timeout: 5000 });
  return tooltip.first();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Exercise chart — auto-detected label', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessTherapist(test);
    await loginAsTherapist(page);
  });

  test('exercise chart renders (not empty state) when sessions are present', async ({ page }) => {
    skipUnlessTherapist(test);

    await mockPrereqs(page);
    await page.route('**/patients/health-combined-history/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeCombinedHistoryWithAutoDetectedSessions()),
      })
    );

    await navigateToPatientDashboard(page);

    // The empty-state message must NOT appear when sessions are present.
    await expect(page.getByText(/no exercise sessions in this period/i)).not.toBeVisible({
      timeout: 10000,
    });

    // The exercise chart SVG must be in the DOM.
    const exerciseCard = page
      .locator('[class*="CardDescription"]')
      .filter({ hasText: /exercises/i })
      .locator('..')
      .locator('..')
      .locator('..');
    await expect(exerciseCard.locator('svg').first()).toBeVisible({ timeout: 10000 });
  });

  test('auto-detected sessions (name=Exercise) show "(automatic)" in tooltip', async ({ page }) => {
    skipUnlessTherapist(test);

    await mockPrereqs(page);
    await page.route('**/patients/health-combined-history/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeCombinedHistoryWithAutoDetectedSessions()),
      })
    );

    await navigateToPatientDashboard(page);

    const tooltip = await hoverExerciseChart(page);

    // The translated label must include "(automatic)" or the locale equivalent.
    // We match the English string since Playwright/Chromium defaults to en-US.
    await expect(tooltip).toContainText('(automatic)', { ignoreCase: true });
    // Both sessions must be shown — the tooltip lists each session separately.
    await expect(tooltip).toContainText('21');
    await expect(tooltip).toContainText('17');
  });

  test('specifically-named sessions show the raw name without "(automatic)"', async ({ page }) => {
    skipUnlessTherapist(test);

    await mockPrereqs(page);
    await page.route('**/patients/health-combined-history/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeCombinedHistoryWithNamedSession('Walk')),
      })
    );

    await navigateToPatientDashboard(page);

    const tooltip = await hoverExerciseChart(page);

    await expect(tooltip).toContainText('Walk');
    // Must NOT carry the auto-detected suffix for a specifically-named session.
    await expect(tooltip).not.toContainText('(automatic)', { ignoreCase: true });
  });
});
