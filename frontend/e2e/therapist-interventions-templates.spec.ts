/**
 * E2E tests for the Named Template system on /interventions (Templates tab).
 *
 * Requires a seeded therapist account:
 *   E2E_THERAPIST_LOGIN    — username / email
 *   E2E_THERAPIST_PASSWORD — password
 *
 * All tests skip gracefully when credentials are absent so CI stays green
 * without a seeded database.
 */
import { expect, test } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function creds() {
  return {
    login: process.env.E2E_THERAPIST_LOGIN,
    password: process.env.E2E_THERAPIST_PASSWORD,
  };
}

function skipUnlessSeeded(t: typeof test) {
  const { login, password } = creds();
  t.skip(
    !login || !password,
    'Missing E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD — skipping seeded E2E tests'
  );
}

/** Log in via the home page modal and wait for the redirect. */
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

  // Wait until we are on the therapist page
  await expect(page).toHaveURL(/\/therapist/);
}

/** Navigate to /interventions and click the Templates tab. */
async function openTemplatesTab(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.goto('/interventions');
  const templatesTab = page.getByRole('tab', { name: /templates/i });
  await expect(templatesTab).toBeVisible();
  await templatesTab.click();
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Therapist Interventions — Templates tab', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessSeeded(test);
    await loginAsTherapist(page);
  });

  // ---- Page loads ---------------------------------------------------------

  test('navigates to /interventions and shows the Templates tab', async ({ page }) => {
    skipUnlessSeeded(test);
    await page.goto('/interventions');

    await expect(page.getByRole('tab', { name: /templates/i })).toBeVisible();
  });

  test('Templates tab shows template management bar after clicking', async ({ page }) => {
    skipUnlessSeeded(test);
    await openTemplatesTab(page);

    // The management bar should contain the template selector dropdown
    const selector = page.getByRole('combobox').filter({ hasText: /implicit|template/i });
    await expect(selector.or(page.getByRole('combobox')).first()).toBeVisible();
  });

  // ---- Create template ----------------------------------------------------

  test('opens New Template modal when "+ New" button is clicked', async ({ page }) => {
    skipUnlessSeeded(test);
    await openTemplatesTab(page);

    await page.getByRole('button', { name: /\+ new/i }).click();
    await expect(page.locator('.modal.show')).toBeVisible();
    await expect(page.getByRole('heading', { name: /new template/i })).toBeVisible();
  });

  test('creates a new template via the modal and shows it in the selector', async ({ page }) => {
    skipUnlessSeeded(test);
    await openTemplatesTab(page);

    await page.getByRole('button', { name: /\+ new/i }).click();

    const modal = page.locator('.modal.show');
    await expect(modal).toBeVisible();

    const uniqueName = `E2E Template ${Date.now()}`;
    await modal.getByLabel(/template name/i).fill(uniqueName);

    // Intercept the POST /api/templates/ call
    const createRequest = page.waitForRequest(
      (req) => req.url().includes('/api/templates/') && req.method() === 'POST'
    );

    await modal.getByRole('button', { name: /create/i }).click();

    const req = await createRequest;
    const body = JSON.parse(req.postData() || '{}');
    expect(body.name).toBe(uniqueName);

    // Modal should close after success
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // The new template should appear in the selector
    await expect(page.getByRole('option', { name: uniqueName })).toBeVisible();
  });

  // ---- Select template ----------------------------------------------------

  test('selecting a named template shows Apply and Copy buttons', async ({ page }) => {
    skipUnlessSeeded(test);
    await openTemplatesTab(page);

    // Only valid if at least one named template exists in the seeded DB
    const selector = page.getByRole('combobox').first();
    const options = await selector.locator('option').all();

    // Find first non-empty (non-implicit) template option
    let namedOptionValue: string | undefined;
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      if (val && val !== '' && val !== 'implicit') {
        namedOptionValue = val;
        break;
      }
    }

    test.skip(!namedOptionValue, 'No named templates found in seeded DB — skipping');

    await selector.selectOption(namedOptionValue as string);

    await expect(page.getByRole('button', { name: /apply/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /copy/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /delete/i })).toBeVisible();
  });

  // ---- Apply template modal -----------------------------------------------

  test('Apply button opens ApplyTemplateModal with correct templateId', async ({ page }) => {
    skipUnlessSeeded(test);
    await openTemplatesTab(page);

    const selector = page.getByRole('combobox').first();
    const options = await selector.locator('option').all();

    let namedOptionValue: string | undefined;
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      if (val && val !== '' && val !== 'implicit') {
        namedOptionValue = val;
        break;
      }
    }
    test.skip(!namedOptionValue, 'No named templates found — skipping');

    await selector.selectOption(namedOptionValue as string);
    await page.getByRole('button', { name: /^apply$/i }).click();

    const modal = page.locator('.modal.show');
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/Apply template to patient/i)).toBeVisible();

    // Diagnosis should be optional (show "All diagnoses" option)
    await expect(modal.getByRole('option', { name: /all diagnoses/i })).toBeVisible();
  });

  // ---- Copy template -------------------------------------------------------

  test('Copy button calls POST /api/templates/<id>/copy/', async ({ page }) => {
    skipUnlessSeeded(test);
    await openTemplatesTab(page);

    const selector = page.getByRole('combobox').first();
    const options = await selector.locator('option').all();

    let namedOptionValue: string | undefined;
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      if (val && val !== '' && val !== 'implicit') {
        namedOptionValue = val;
        break;
      }
    }
    test.skip(!namedOptionValue, 'No named templates found — skipping');

    await selector.selectOption(namedOptionValue as string);

    const copyRequest = page.waitForRequest(
      (req) =>
        req.url().includes(`/api/templates/${namedOptionValue}/copy/`) &&
        req.method() === 'POST'
    );

    await page.getByRole('button', { name: /copy/i }).click();

    await copyRequest;

    // A copy should appear in the selector
    const copyOption = page.getByRole('option', { name: /Copy of/i });
    await expect(copyOption).toBeVisible({ timeout: 5000 });
  });

  // ---- Delete template -----------------------------------------------------

  test('Delete button calls DELETE /api/templates/<id>/ after confirmation', async ({ page }) => {
    skipUnlessSeeded(test);
    await openTemplatesTab(page);

    // Create a template first so we can safely delete it
    await page.getByRole('button', { name: /\+ new/i }).click();
    const modal = page.locator('.modal.show');
    const uniqueName = `E2E Delete ${Date.now()}`;
    await modal.getByLabel(/template name/i).fill(uniqueName);

    const createDone = page.waitForResponse(
      (res) => res.url().includes('/api/templates/') && res.request().method() === 'POST'
    );
    await modal.getByRole('button', { name: /create/i }).click();
    await createDone;
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // Select the newly created template
    await page.getByRole('option', { name: uniqueName }).waitFor({ timeout: 5000 });
    const selector = page.getByRole('combobox').first();
    await selector.selectOption({ label: uniqueName });

    // Handle the window.confirm dialog
    page.once('dialog', (dialog) => dialog.accept());

    const deleteRequest = page.waitForRequest(
      (req) => req.url().includes('/api/templates/') && req.method() === 'DELETE'
    );

    await page.getByRole('button', { name: /delete/i }).click();
    await deleteRequest;

    // Template should no longer appear in selector
    await expect(page.getByRole('option', { name: uniqueName })).not.toBeVisible({
      timeout: 5000,
    });
  });

  // ---- Calendar / intervention list ---------------------------------------

  test('switching to a named template loads its calendar via GET /api/templates/<id>/calendar/', async ({
    page,
  }) => {
    skipUnlessSeeded(test);
    await openTemplatesTab(page);

    const selector = page.getByRole('combobox').first();
    const options = await selector.locator('option').all();

    let namedOptionValue: string | undefined;
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      if (val && val !== '' && val !== 'implicit') {
        namedOptionValue = val;
        break;
      }
    }
    test.skip(!namedOptionValue, 'No named templates found — skipping');

    const calendarRequest = page.waitForRequest(
      (req) =>
        req.url().includes(`/api/templates/${namedOptionValue}/calendar/`) &&
        req.method() === 'GET'
    );

    await selector.selectOption(namedOptionValue as string);

    await calendarRequest;
  });
});
