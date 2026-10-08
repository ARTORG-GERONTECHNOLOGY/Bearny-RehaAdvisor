/**
 * E2E: therapist modifies an intervention with a schedule that generates no
 * sessions → the modal must show a destructive alert instead of silently
 * closing.
 *
 * Regression for the silent-200 bug where modify-patient returned HTTP 200
 * success even when _generate_dates_from returned an empty list, causing the
 * save to appear successful while nothing was persisted.
 *
 * Authentication is real (requires seeded therapist credentials). The rehab
 * plan API and the modify endpoint are mocked so the test does not depend on a
 * specific patient fixture in the database.
 */
import { addDays, formatISO } from 'date-fns';
import { expect, test } from '@playwright/test';

import { loginAsTherapist } from './helpers/auth';

// ── Constants ─────────────────────────────────────────────────────────────────

const MOCK_PATIENT_ID = '6700000000e2e0000rehab01';
const MOCK_PLAN_ID = '6700000000e2e0000rehab02';
const MOCK_INTERVENTION_ID = '6700000000e2e0000rehab03';

// ── Helpers ───────────────────────────────────────────────────────────────────

function skipUnlessSeeded() {
  test.skip(
    !process.env.E2E_THERAPIST_LOGIN ||
      !process.env.E2E_THERAPIST_PASSWORD ||
      !process.env.E2E_EMAIL_DIR,
    'Missing seeded therapist credentials (E2E_THERAPIST_LOGIN / _PASSWORD / EMAIL_DIR)'
  );
}

/** Minimal plan response that makes RehabilitationPlanContent render one intervention. */
function makeMockPlan(): object {
  const now = new Date();
  return {
    _id: MOCK_PLAN_ID,
    patientId: MOCK_PATIENT_ID,
    status: 'active',
    startDate: formatISO(now),
    endDate: formatISO(addDays(now, 30)),
    interventions: [
      {
        _id: MOCK_INTERVENTION_ID,
        title: 'E2E Yoga',
        content_type: 'Video',
        benefitFor: [],
        tags: [],
        patient_types: [],
        frequency: 'Daily',
        dates: [{ datetime: formatISO(addDays(now, 1)), status: 'pending' }],
      },
    ],
    questionnaires: [],
  };
}

/** 400 body the real backend now returns when schedule generates no sessions. */
const EMPTY_SCHEDULE_ERROR = {
  success: false,
  message:
    'No sessions could be scheduled: the plan ends on 2026-10-13. ' +
    "Choose an earlier effective date, or extend the patient's Rehabilitation End Date in the Information tab.",
  field_errors: {},
  non_field_errors: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Rehab plan — modify schedule produces no sessions', () => {
  test('shows destructive alert inside the modal on empty-schedule 400', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);

    // Serve synthetic plan so the test is independent of DB state.
    await page.route('**/api/patients/rehabilitation-plan/therapist/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeMockPlan()),
      });
    });

    // Return empty catalog — the plan's own intervention data is enough to render.
    await page.route('**/api/interventions/all/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ interventions: [] }),
      });
    });

    // Install the 400 stub before navigating so it is active when the modal POSTs.
    await page.route('**/api/interventions/modify-patient/', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_SCHEDULE_ERROR),
      });
    });

    await page.goto(`/therapist-patient-detail/${MOCK_PATIENT_ID}?tab=rehabilitationplan`);

    // Wait for the plan to render — the modify button is the reliable signal.
    const modifyBtn = page.locator('[aria-label="Modify"]').first();
    await expect(modifyBtn).toBeVisible({ timeout: 10_000 });
    await modifyBtn.click();

    // Modal must open with the "Modify schedule" title.
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('heading')).toContainText('Modify schedule');

    // The save button must be enabled (effectiveFrom is auto-filled to tomorrow).
    const saveBtn = modal.getByRole('button', { name: /save changes/i });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // A destructive alert must appear inside the modal with the backend message.
    const alert = modal.locator('[role="alert"]');
    await expect(alert).toBeVisible({ timeout: 5_000 });
    await expect(alert).toContainText('No sessions could be scheduled');

    // The modal must NOT close on error (user needs to see the message).
    await expect(modal).toBeVisible();
  });

  test('error alert is visible in the viewport after save from scrolled position (scroll regression)', async ({
    page,
  }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);

    await page.route('**/api/patients/rehabilitation-plan/therapist/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeMockPlan()),
      });
    });
    await page.route('**/api/interventions/all/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ interventions: [] }),
      });
    });
    await page.route('**/api/interventions/modify-patient/', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_SCHEDULE_ERROR),
      });
    });

    await page.goto(`/therapist-patient-detail/${MOCK_PATIENT_ID}?tab=rehabilitationplan`);

    const modifyBtn = page.locator('[aria-label="Modify"]').first();
    await expect(modifyBtn).toBeVisible({ timeout: 10_000 });
    await modifyBtn.click();

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // Scroll to the Save button at the bottom before clicking — this is the
    // exact user action that previously hid the error alert off-screen.
    const saveBtn = modal.getByRole('button', { name: /save changes/i });
    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click();

    // After the 400 the modal must scroll back up so the alert is in the viewport.
    const alert = modal.locator('[role="alert"]');
    await expect(alert).toBeVisible({ timeout: 5_000 });
    await expect(alert).toBeInViewport({ ratio: 0.5 });
    await expect(alert).toContainText('No sessions could be scheduled');
  });
});
