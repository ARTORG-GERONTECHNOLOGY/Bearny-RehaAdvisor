import { expect, test } from '@playwright/test';

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

async function loginAsTherapist(page: Parameters<Parameters<typeof test>[1]>[0]) {
  const { login, password } = creds();

  await page.goto('/');
  await page.getByRole('button', { name: /login/i }).first().click();

  const modal = page.locator('.modal.show');
  await expect(modal).toBeVisible();

  await modal.locator('#email').fill(login as string);
  await modal.locator('#password').fill(password as string);

  const loginDone = page.waitForResponse(
    (res) => res.url().includes('/auth/login/') && res.request().method() === 'POST'
  );

  await modal.getByRole('button', { name: /login/i }).click();
  await loginDone;

  await expect(page).toHaveURL(/\/therapist/);
}

test.describe('Therapist questionnaire builder full flow', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessSeeded(test);
    await loginAsTherapist(page);

    const { patientId } = creds();
    await page.evaluate((pid) => {
      window.localStorage.setItem('selectedPatient', pid as string);
    }, patientId as string);
  });

  test('create questionnaire -> appears with creator -> assign to patient', async ({ page }) => {
    skipUnlessSeeded(test);

    const uniqueTitle = `E2E Builder ${Date.now()}`;

    await page.goto('/rehabtable');

    const healthReq = page.waitForRequest((req) => req.url().includes('/questionnaires/health/'));
    const patientReq = page.waitForRequest((req) => req.url().includes('/questionnaires/patient/'));

    await page.getByRole('tab', { name: /questionnaires/i }).click();
    await healthReq;
    await patientReq;

    await page
      .getByRole('button', { name: /^create$/i })
      .first()
      .click();

    const modal = page.locator('.modal.show');
    await expect(modal.getByText(/create questionnaire/i)).toBeVisible();

    await modal.locator('#q-builder-title').fill(uniqueTitle);
    await modal.locator('#q-builder-description').fill('Created by E2E builder test');

    await modal.locator('#q-builder-text-0').fill('How did your week go?');
    await modal.getByRole('button', { name: /add question/i }).click();

    await modal.locator('#q-builder-text-1').fill('Did you complete your exercises?');
    await modal.locator('#q-builder-type-1').selectOption('one-choice');
    await modal.locator('#q-builder-options-1').fill('Yes\nNo');

    const createDone = page.waitForResponse(
      (res) => res.url().includes('/questionnaires/health/') && res.request().method() === 'POST'
    );

    await modal.getByRole('button', { name: /^create$/i }).click();

    const createRes = await createDone;
    expect([200, 201]).toContain(createRes.status());
    await expect(modal).toBeHidden({ timeout: 8000 });

    const availableRow = page
      .locator('div.border.rounded')
      .filter({ hasText: uniqueTitle })
      .first();
    await expect(availableRow).toBeVisible();
    await expect(availableRow.getByText(/by:/i)).toBeVisible();

    await availableRow.locator('button.btn-outline-success').first().click();

    const scheduleModal = page.locator('.modal.show');
    await expect(scheduleModal.getByText(/assign questionnaire/i)).toBeVisible();

    // Week mode requires selected weekdays; switching to month avoids optional day-selection flakiness.
    await scheduleModal.locator('select').last().selectOption('month');

    const assignDone = page.waitForResponse(
      (res) => res.url().includes('/questionnaires/assign/') && res.request().method() === 'POST'
    );

    await scheduleModal.getByRole('button', { name: /^save$/i }).click();

    const assignRes = await assignDone;
    expect([200, 201]).toContain(assignRes.status());

    const assignedRow = page
      .locator('div.border.rounded')
      .filter({ hasText: uniqueTitle })
      .filter({ hasText: /frequency/i })
      .first();

    await expect(assignedRow).toBeVisible();

    // Cleanup assignment so repeated runs remain stable.
    const removeDone = page.waitForResponse(
      (res) => res.url().includes('/questionnaires/remove/') && res.request().method() === 'POST'
    );
    await assignedRow.locator('button.btn-outline-danger').first().click();
    const removeRes = await removeDone;
    expect([200, 201]).toContain(removeRes.status());
  });
});
