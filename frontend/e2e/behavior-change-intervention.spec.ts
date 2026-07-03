/**
 * E2E tests for Behavior change aim (issue #413).
 *
 * Tests verify that:
 * 1. The "Mark as done" button reads "Mark as viewed" for behavior change interventions.
 * 2. The "Done" state label reads "Viewed".
 * 3. The feedback popup contains the behavior-change question keys.
 *
 * The intervention detail page is accessed via /patient-intervention/:id.
 * API calls are intercepted so no seeded backend data is required.
 */

import { expect, test, type Page } from '@playwright/test';

const PATIENT_ID = 'e2e-patient-bc';
const INTERVENTION_ID = 'e2e-iv-bc-001';
const TODAY = new Date().toISOString().slice(0, 10);

function skipUnlessPatientSeeded() {
  test.skip(
    !process.env.E2E_PATIENT_LOGIN || !process.env.E2E_PATIENT_PASSWORD,
    'Missing E2E_PATIENT_LOGIN/E2E_PATIENT_PASSWORD — skipping behavior-change E2E tests'
  );
}

async function loginAsSeededPatient(page: Page) {
  const patientLogin = process.env.E2E_PATIENT_LOGIN as string;
  const patientPassword = process.env.E2E_PATIENT_PASSWORD as string;

  await page.goto('/');
  await page.getByRole('button', { name: /login/i }).first().click();

  const modal = page.locator('[role="dialog"][data-state="open"]');
  await expect(modal).toBeVisible();

  await modal.locator('#email').fill(patientLogin);
  await modal.locator('#password').fill(patientPassword);
  await modal.getByRole('button', { name: /login/i }).click();

  await expect(page).toHaveURL(/\/patient(?:\/)?$/);
  await page.reload({ waitUntil: 'networkidle' });
}

/** Build a minimal intervention plan payload with the given aim. */
function buildInterventionItem(aim: string, completed = false) {
  return {
    intervention_id: INTERVENTION_ID,
    intervention_title: 'Comic Motivation',
    description: 'A behavior change intervention.',
    dates: [TODAY],
    completion_dates: completed ? [TODAY] : [],
    intervention: {
      _id: INTERVENTION_ID,
      title: 'Comic Motivation',
      aim,
      content_type: 'PDF',
      language: 'en',
      external_id: 'COMIC_BC_001',
      media: [],
    },
  };
}

/** Intercept all plan / library API calls and return controlled data. */
async function mockInterventionAPIs(page: Page, aim: string, completed = false) {
  const item = buildInterventionItem(aim, completed);

  // Rehab plan
  await page.route('**/api/patients/rehabilitation-plan/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([item]),
    });
  });

  // Intervention library
  await page.route('**/interventions/all/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([item.intervention]),
    });
  });

  // Completion toggle — always return completed=true
  await page.route('**/interventions/complete/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ completed: true, dateKey: TODAY }),
    });
  });

  // Feedback questions for behavior change
  await page.route(`**/patients/get-questions/Intervention/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        questions: [
          {
            questionKey: 'rating_stars_behavior_change',
            answerType: 'select',
            translations: [{ language: 'en', text: 'How did you find the content?' }],
            possibleAnswers: [
              { key: '1', translations: [{ language: 'en', text: '★☆☆☆☆ (1/5)' }] },
              { key: '5', translations: [{ language: 'en', text: '★★★★★ (5/5)' }] },
            ],
          },
          {
            questionKey: 'implementation_intent',
            answerType: 'select',
            translations: [
              {
                language: 'en',
                text: 'Do you intend to implement this strategy?',
              },
            ],
            possibleAnswers: [
              { key: 'yes', translations: [{ language: 'en', text: 'Yes' }] },
              { key: 'rather_yes', translations: [{ language: 'en', text: 'Rather yes' }] },
              { key: 'rather_no', translations: [{ language: 'en', text: 'Rather no' }] },
              { key: 'no', translations: [{ language: 'en', text: 'No' }] },
            ],
          },
          {
            questionKey: 'open_feedback',
            answerType: 'text',
            translations: [
              {
                language: 'en',
                text: 'Any additional feedback? (text or audio)',
              },
            ],
            possibleAnswers: [],
          },
        ],
      }),
    });
  });

  // View duration tracking (fire-and-forget)
  await page.route('**/patients/vitals/intervention-view/**', async (route) => {
    await route.fulfill({ status: 200, body: '{}' });
  });
}

test.describe('Behavior change intervention', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(skipUnlessPatientSeeded);

  test('shows "Mark as viewed" button for behavior change aim', async ({ page }) => {
    await loginAsSeededPatient(page);
    await mockInterventionAPIs(page, 'Behavior change');

    await page.goto(`/patient-intervention/${INTERVENTION_ID}?date=${TODAY}`);

    await expect(page.getByRole('button', { name: /mark as viewed/i })).toBeVisible();

    await expect(page.getByRole('button', { name: /mark as done/i })).toHaveCount(0);
  });

  test('shows "Mark as done" button for non-behavior-change aim', async ({ page }) => {
    await loginAsSeededPatient(page);
    await mockInterventionAPIs(page, 'Education');

    await page.goto(`/patient-intervention/${INTERVENTION_ID}?date=${TODAY}`);

    await expect(page.getByRole('button', { name: /mark as done/i })).toBeVisible();

    await expect(page.getByRole('button', { name: /mark as viewed/i })).toHaveCount(0);
  });

  test('shows "Viewed" label when behavior change intervention is already completed', async ({
    page,
  }) => {
    await loginAsSeededPatient(page);
    await mockInterventionAPIs(page, 'Behavior change', true);

    // Override plan to return completion_dates including today so component knows it's done.
    await page.route('**/api/patients/rehabilitation-plan/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([buildInterventionItem('Behavior change', true)]),
      });
    });

    await page.goto(`/patient-intervention/${INTERVENTION_ID}?date=${TODAY}`);

    await expect(page.getByRole('button', { name: /^Viewed$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Done$/i })).toHaveCount(0);
  });

  test('clicking "Mark as viewed" triggers feedback popup with BC questions', async ({ page }) => {
    await loginAsSeededPatient(page);
    await mockInterventionAPIs(page, 'Behavior change');

    await page.goto(`/patient-intervention/${INTERVENTION_ID}?date=${TODAY}`);

    const markViewedBtn = page.getByRole('button', { name: /mark as viewed/i });
    await expect(markViewedBtn).toBeVisible();
    await markViewedBtn.click();

    // Feedback popup should appear with at least the star question text
    await expect(page.getByText(/How did you find the content/i)).toBeVisible({ timeout: 5000 });
  });
});
