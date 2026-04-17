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

test.describe('Therapist rehab table questionnaires', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessSeeded(test);
    await loginAsTherapist(page);

    const { patientId } = creds();
    await page.evaluate((pid) => {
      window.localStorage.setItem('selectedPatient', pid as string);
    }, patientId as string);
  });

  test('loads questionnaires tab and fetches questionnaire endpoints', async ({ page }) => {
    skipUnlessSeeded(test);

    await page.goto('/rehabtable');

    const dynamicRequest = page.waitForRequest((req) =>
      req.url().includes('/questionnaires/dynamic?subject=Healthstatus')
    );
    const assignedRequest = page.waitForRequest((req) =>
      req.url().includes('/questionnaires/patient/')
    );

    await page.getByRole('tab', { name: /questionnaires/i }).click();

    await dynamicRequest;
    await assignedRequest;

    await expect(page.getByText(/available questionnaires/i)).toBeVisible();
    await expect(page.getByText(/assigned questionnaires/i)).toBeVisible();
  });

  test('opens questionnaire schedule modal from questionnaires tab actions', async ({ page }) => {
    skipUnlessSeeded(test);

    await page.goto('/rehabtable');
    await page.getByRole('tab', { name: /questionnaires/i }).click();

    await page.waitForRequest((req) => req.url().includes('/questionnaires/patient/'));

    const addBtn = page.locator('button.btn-outline-success').first();
    const modifyBtn = page.locator('button.btn-outline-secondary').first();

    if ((await addBtn.count()) > 0) {
      await addBtn.click();
      await expect(page.getByText(/assign questionnaire/i)).toBeVisible();
      return;
    }

    if ((await modifyBtn.count()) > 0) {
      await modifyBtn.click();
      await expect(page.getByText(/modify questionnaire schedule/i)).toBeVisible();
      return;
    }

    test.skip(true, 'No questionnaire action button available in seeded data.');
  });
});
