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
import { expect, test, type Page, type Locator } from '@playwright/test';

import { loginAsTherapist } from './helpers/auth';

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

/** Navigate to /interventions and click the Templates tab. */
async function openTemplatesTab(page: Page) {
  await page.goto('/interventions');
  const templatesTab = page.getByRole('tab', { name: /templates/i });
  await expect(templatesTab).toBeVisible();
  await templatesTab.click();
}

/** Opens the Radix template selector, clicks the first named template, and returns its label (or undefined if none exist). */
async function selectFirstNamedTemplate(
  page: Page,
  selector: Locator
): Promise<string | undefined> {
  await selector.click();
  const options = page.getByRole('option');
  const count = await options.count();
  if (count <= 1) {
    // Only the "Implicit therapist template" option exists.
    await page.keyboard.press('Escape');
    return undefined;
  }
  const target = options.nth(1);
  const label = (await target.textContent())?.trim();
  await target.click();
  return label;
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
    await expect(page.locator('[role="dialog"][data-state="open"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: /new template/i })).toBeVisible();
  });

  test('creates a new template via the modal and shows it in the selector', async ({ page }) => {
    skipUnlessSeeded(test);
    await openTemplatesTab(page);

    await page.getByRole('button', { name: /\+ new/i }).click();

    const modal = page.locator('[role="dialog"][data-state="open"]');
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
    const selector = page.getByRole('combobox').first();
    await selector.click();
    await expect(page.getByRole('option', { name: uniqueName })).toBeVisible();
  });

  // ---- Select template ----------------------------------------------------

  test('selecting a named template shows Apply and Copy buttons', async ({ page }) => {
    skipUnlessSeeded(test);
    await openTemplatesTab(page);

    // Only valid if at least one named template exists in the seeded DB
    const selector = page.getByRole('combobox').first();
    const label = await selectFirstNamedTemplate(page, selector);
    test.skip(!label, 'No named templates found in seeded DB — skipping');

    await expect(page.getByRole('button', { name: /apply/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /copy/i })).toBeVisible();
    // Edit button visible for own templates (issue #360: any visible-template therapist can edit)
    await expect(page.getByTitle(/edit name/i)).toBeVisible();
    // Delete button visible for own templates (creator-only — non-owners won't see it)
    await expect(page.getByRole('button', { name: /delete/i })).toBeVisible();
  });

  // ---- Edit template (issue #360) -----------------------------------------

  test('Edit button opens edit-meta modal for own template', async ({ page }) => {
    skipUnlessSeeded(test);
    await openTemplatesTab(page);

    const selector = page.getByRole('combobox').first();
    const label = await selectFirstNamedTemplate(page, selector);
    test.skip(!label, 'No named templates found in seeded DB — skipping');

    // Edit button should always be visible (fix for issue #360)
    const editBtn = page.getByTitle(/edit name/i);
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    const modal = page.locator('[role="dialog"][data-state="open"]');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('heading', { name: /edit template/i })).toBeVisible();
    // Public checkbox visible for own templates
    await expect(modal.getByRole('checkbox', { name: /public/i })).toBeVisible();
  });

  // ---- Apply template modal -----------------------------------------------

  test('Apply button opens ApplyTemplateModal', async ({ page }) => {
    skipUnlessSeeded(test);
    await openTemplatesTab(page);

    const selector = page.getByRole('combobox').first();
    const label = await selectFirstNamedTemplate(page, selector);
    test.skip(!label, 'No named templates found — skipping');

    await page.getByRole('button', { name: /^apply$/i }).click();

    const modal = page.locator('[role="dialog"][data-state="open"]');
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/Apply template to patient/i)).toBeVisible();

    // Diagnosis mode is optional (a separate tab from the default patient-select mode)
    await modal.getByRole('tab', { name: /by diagnosis/i }).click();
    await expect(modal.locator('#apply-template-diagnosis')).toBeVisible();
  });

  // ---- Copy template -------------------------------------------------------

  test('Copy button calls POST /api/templates/<id>/copy/', async ({ page }) => {
    skipUnlessSeeded(test);
    await openTemplatesTab(page);

    const selector = page.getByRole('combobox').first();
    const label = await selectFirstNamedTemplate(page, selector);
    test.skip(!label, 'No named templates found — skipping');

    const copyRequest = page.waitForRequest(
      (req) => /\/api\/templates\/[^/]+\/copy\//.test(req.url()) && req.method() === 'POST'
    );

    await page.getByRole('button', { name: /copy/i }).click();

    await copyRequest;

    // A copy should appear in the selector
    await selector.click();
    const copyOption = page.getByRole('option', { name: /Copy of/i });
    await expect(copyOption).toBeVisible({ timeout: 5000 });
  });

  // ---- Delete template -----------------------------------------------------

  test('Delete button calls DELETE /api/templates/<id>/ after confirmation', async ({ page }) => {
    skipUnlessSeeded(test);
    await openTemplatesTab(page);

    // Create a template first so we can safely delete it
    await page.getByRole('button', { name: /\+ new/i }).click();
    const modal = page.locator('[role="dialog"][data-state="open"]');
    const uniqueName = `E2E Delete ${Date.now()}`;
    await modal.getByLabel(/template name/i).fill(uniqueName);

    const createDone = page.waitForResponse(
      (res) => res.url().includes('/api/templates/') && res.request().method() === 'POST'
    );
    await modal.getByRole('button', { name: /create/i }).click();
    await createDone;
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // Select the newly created template
    const selector = page.getByRole('combobox').first();
    await selector.click();
    await page.getByRole('option', { name: uniqueName }).click();

    // Handle the window.confirm dialog
    page.once('dialog', (dialog) => dialog.accept());

    const deleteRequest = page.waitForRequest(
      (req) => req.url().includes('/api/templates/') && req.method() === 'DELETE'
    );

    await page.getByRole('button', { name: /delete/i }).click();
    await deleteRequest;

    // Template should no longer appear in selector
    await selector.click();
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
    await selector.click();
    const options = page.getByRole('option');
    const count = await options.count();
    test.skip(count <= 1, 'No named templates found — skipping');

    const calendarRequest = page.waitForRequest(
      (req) => /\/api\/templates\/[^/]+\/calendar\//.test(req.url()) && req.method() === 'GET'
    );

    await options.nth(1).click();

    await calendarRequest;
  });
});
