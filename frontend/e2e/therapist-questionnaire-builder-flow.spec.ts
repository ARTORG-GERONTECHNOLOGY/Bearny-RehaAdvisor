import { expect, test, type Page } from '@playwright/test';

import { loginAsTherapist } from './helpers/auth';

const assignedColumn = (page: Page) => page.locator('.rehab-row .rehab-col').nth(1);

function creds() {
  return {
    login: process.env.E2E_THERAPIST_LOGIN,
    password: process.env.E2E_THERAPIST_PASSWORD,
    patientId: process.env.E2E_PATIENT_ID,
  };
}

function skipUnlessSeeded(t: typeof test) {
  const { login, password, patientId } = creds();
  t.skip(
    !login || !password || !patientId,
    'Missing E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD / E2E_PATIENT_ID — skipping seeded E2E tests'
  );
}

test.describe('Therapist questionnaire builder full flow', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessSeeded(test);
    await loginAsTherapist(page);
  });

  test('create questionnaire -> appears with creator -> assign to patient', async ({ page }) => {
    skipUnlessSeeded(test);

    const uniqueTitle = `E2E Builder ${Date.now()}`;

    const { patientId } = creds();
    await page.goto(`/therapist-patient-detail/${patientId}`);

    const healthReq = page.waitForRequest((req) => req.url().includes('/questionnaires/health/'));
    const patientReq = page.waitForRequest((req) => req.url().includes('/questionnaires/patient/'));

    await page.getByRole('tab', { name: /questionnaires/i }).click();
    await healthReq;
    await patientReq;

    await page
      .getByRole('button', { name: /^create$/i })
      .first()
      .click();

    const modal = page.locator('[role="dialog"][data-state="open"]');
    await expect(modal.getByText(/create questionnaire/i)).toBeVisible();

    await modal.locator('#q-builder-title').fill(uniqueTitle);
    await modal.locator('#q-builder-description').fill('Created by E2E builder test');

    await modal.locator('#q-builder-text-0').fill('How did your week go?');
    await modal.getByRole('button', { name: /add question/i }).click();

    await modal.locator('#q-builder-text-1').fill('Did you complete your exercises?');
    await modal.locator('#q-builder-type-1').click();
    await page.getByRole('option', { name: 'One choice' }).click();
    await modal.locator('#q-builder-options-1').fill('Yes\nNo');

    const createDone = page.waitForResponse(
      (res) => res.url().includes('/questionnaires/health/') && res.request().method() === 'POST'
    );

    await modal.getByRole('button', { name: /^create$/i }).click();

    const createRes = await createDone;
    expect([200, 201]).toContain(createRes.status());
    await expect(modal).toBeHidden({ timeout: 8000 });

    // cursor-pointer targets the inner questionnaire card, not the outer container card
    // (which also matches div.rounded-xl.border but lacks cursor-pointer).
    const availableRow = page
      .locator('div.rounded-xl.border.cursor-pointer')
      .filter({ hasText: uniqueTitle })
      .first();
    await expect(availableRow).toBeVisible();

    await availableRow.getByRole('button', { name: /assign/i }).click();

    const scheduleModal = page.locator('[role="dialog"][data-state="open"]');
    await expect(scheduleModal.getByText(/assign questionnaire/i)).toBeVisible();

    // Week mode requires selected weekdays; switching to month avoids optional day-selection flakiness.
    await scheduleModal.locator('#q-repeat-unit').click();
    await page.getByRole('option', { name: 'Month' }).click();

    const assignDone = page.waitForResponse(
      (res) => res.url().includes('/questionnaires/assign/') && res.request().method() === 'POST'
    );

    await scheduleModal.getByRole('button', { name: /^save$/i }).click();

    const assignRes = await assignDone;
    expect([200, 201]).toContain(assignRes.status());

    // Wait for the modal to close — proves onSuccess() was called.
    await expect(scheduleModal).toBeHidden({ timeout: 10000 });

    // onSuccess calls fetchAssignedQuestionnaires(), updating React state.
    // "Assigned" appears exactly once in availableRow (scoped to the specific inner card).
    await expect(availableRow.getByText('Assigned')).toBeVisible({ timeout: 20000 });

    // Find the assigned card (same cursor-pointer scoping) for cleanup.
    const assignedRow = assignedColumn(page)
      .locator('div.rounded-xl.border.cursor-pointer')
      .filter({ hasText: uniqueTitle })
      .first();
    await expect(assignedRow).toBeVisible({ timeout: 10000 });

    // Cleanup assignment so repeated runs remain stable.
    const removeDone = page.waitForResponse(
      (res) => res.url().includes('/questionnaires/remove/') && res.request().method() === 'POST'
    );
    await assignedRow.getByRole('button', { name: /remove questionnaire/i }).click();
    const removeRes = await removeDone;
    expect([200, 201]).toContain(removeRes.status());
  });
});
