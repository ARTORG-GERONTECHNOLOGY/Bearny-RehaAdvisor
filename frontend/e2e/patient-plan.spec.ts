/**
 * E2E tests for the PatientPlan page (/patient-plan).
 *
 * PatientPlan is the main weekly intervention schedule for patients. It renders
 * DailyInterventionCard + InterventionItem (the active production components)
 * with week-based navigation. These tests cover:
 *
 *   - Auth guard (unauthenticated users are redirected)
 *   - Core API call on load (rehabilitation plan is fetched)
 *   - Previous / next week navigation updates the displayed date range
 *   - Day-of-week filter chips change which day cards are visible
 *
 * All tests that require a seeded patient are skipped automatically when
 * E2E_PATIENT_LOGIN / E2E_PATIENT_PASSWORD are not set.
 */

import { expect, test, type Page } from '@playwright/test';
import { format, addDays, startOfWeek, endOfWeek } from 'date-fns';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginAsSeededPatient(page: Page) {
  const login = process.env.E2E_PATIENT_LOGIN;
  const password = process.env.E2E_PATIENT_PASSWORD;

  test.skip(!login || !password, 'Missing E2E_PATIENT_LOGIN/E2E_PATIENT_PASSWORD');

  await page.goto('/');
  await page.getByRole('button', { name: /login/i }).first().click();

  const modal = page.locator('[role="dialog"][data-state="open"]');
  await expect(modal).toBeVisible();
  await modal.locator('#email').fill(login as string);
  await modal.locator('#password').fill(password as string);
  await modal.getByRole('button', { name: /login/i }).click();

  await expect(page).toHaveURL(/\/patient(?:\/)?$/);
  // Hard reload to flush React Router's pending navigate('/patient') before the
  // caller issues its own page.goto(). SPA navigations don't fire browser load
  // events, so waitForLoadState('load') is a no-op here — only a real reload
  // clears the navigation queue. Matches the therapist helper pattern in auth.ts.
  await page.reload({ waitUntil: 'networkidle' });
}

/** Format a date range the same way PatientPlan's header does. */
function weekRangeLabel(date: Date) {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return `${format(start, 'dd.MM.')} - ${format(end, 'dd.MM.')}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Patient plan page', () => {
  test('redirects unauthenticated user away from /patient-plan', async ({ page }) => {
    await page.goto('/patient-plan');
    // The auth guard navigates to the home/login page
    await expect(page).toHaveURL(/\/$/);
  });

  test('loads /patient-plan and fetches the rehabilitation plan', async ({ page }) => {
    await loginAsSeededPatient(page);

    const planRequestPromise = page.waitForRequest(
      (req) =>
        req.method() === 'GET' && req.url().includes('/patients/rehabilitation-plan/patient/')
    );

    await page.goto('/patient-plan');
    await expect(page).toHaveURL(/\/patient-plan(?:\/)?$/);
    await planRequestPromise;

    // The week-range header (e.g. "16.06. - 22.06.") should be visible
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('navigating to the next week updates the displayed date range', async ({ page }) => {
    await loginAsSeededPatient(page);
    await page.goto('/patient-plan');

    // Capture the current week label from the page header before navigation
    const header = page.getByRole('heading').first();
    await expect(header).toBeVisible();
    const currentLabel = await header.innerText();

    await page.locator('[aria-label="Next week"]').click();

    // After clicking, the header must show a different (later) week range
    await expect(header).not.toHaveText(currentLabel);
  });

  test('navigating to the previous week updates the displayed date range', async ({ page }) => {
    await loginAsSeededPatient(page);
    await page.goto('/patient-plan');

    const header = page.getByRole('heading').first();
    await expect(header).toBeVisible();
    const currentLabel = await header.innerText();

    await page.locator('[aria-label="Previous week"]').click();

    await expect(header).not.toHaveText(currentLabel);
  });

  test('day-of-week filter chips change the visible day section', async ({ page }) => {
    await loginAsSeededPatient(page);
    await page.goto('/patient-plan');

    // "Whole Week" shows all 7 day sections; clicking "Mon" should reduce to 1.
    // The chips are rendered as ToggleGroup items.
    const monChip = page.getByRole('radio', { name: /^Mon$/i });
    const allWeekChip = page.getByRole('radio', { name: /Whole Week/i });

    // Only proceed if the filter UI is present (layout may differ by viewport)
    const hasChips = (await monChip.count()) > 0;
    test.skip(!hasChips, 'Day-filter chips not visible at this viewport / layout.');

    await monChip.click();
    // Exactly one day-section should be rendered after filtering to Monday
    const daySections = page.locator('section[aria-label]');
    await expect(daySections).toHaveCount(1);

    await allWeekChip.click();
    // Back to whole-week: 7 day sections
    await expect(daySections).toHaveCount(7);
  });
});
