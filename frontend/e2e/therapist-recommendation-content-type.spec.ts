/**
 * E2E tests for the Add Recommendation content type field.
 *
 * Verifies that:
 *  1. The content type dropdown exposes the original taxonomy labels
 *     (brochure, video, audio, graphics, app, website).
 *  2. When a user submits the form the frontend maps each label to the
 *     backend-accepted value before the request is sent
 *     (e.g. "graphics" → "Image", "brochure" → "PDF").
 *
 * Requires a seeded therapist account:
 *   E2E_THERAPIST_LOGIN    — username / email
 *   E2E_THERAPIST_PASSWORD — password
 *   E2E_EMAIL_DIR          — directory where Django writes file-based emails (2FA)
 *
 * All tests skip gracefully when credentials are absent so CI stays green
 * without a seeded database.
 */
import { expect, test } from '@playwright/test';

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

/** Open /interventions and click the "Add recommendation" / "+" button. */
async function openAddRecommendationPopup(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.goto('/interventions');
  // The add-recommendation button is typically a "+" or labelled "Add"
  const addBtn = page
    .getByRole('button', { name: /add recommendation|^\+$/i })
    .or(page.locator('button[title*="add" i], button[aria-label*="add" i]'))
    .first();
  await expect(addBtn).toBeVisible({ timeout: 10_000 });
  await addBtn.click();
  await expect(page.locator('.modal.show')).toBeVisible({ timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// Dropdown label tests (no credentials needed — UI is mocked-free in dev)
// ---------------------------------------------------------------------------

test.describe('Recommendation content type — dropdown labels', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessSeeded(test);
    await loginAsTherapist(page);
  });

  test('content type dropdown shows original taxonomy labels', async ({ page }) => {
    skipUnlessSeeded(test);
    await openAddRecommendationPopup(page);

    const select = page.locator('#contentType');
    await expect(select).toBeVisible();

    const optionValues = await select
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean));

    expect(optionValues).toContain('brochure');
    expect(optionValues).toContain('graphics');
    expect(optionValues).toContain('video');
    expect(optionValues).toContain('audio');
    expect(optionValues).toContain('app');
    expect(optionValues).toContain('website');
  });

  test('content type dropdown does NOT expose raw backend type names', async ({ page }) => {
    skipUnlessSeeded(test);
    await openAddRecommendationPopup(page);

    const select = page.locator('#contentType');
    await expect(select).toBeVisible();

    const optionValues = await select
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean));

    // Backend type names should not appear as option values; they are implementation details
    expect(optionValues).not.toContain('Image');
    expect(optionValues).not.toContain('PDF');
    expect(optionValues).not.toContain('Streaming');
    expect(optionValues).not.toContain('Text');
  });
});

// ---------------------------------------------------------------------------
// Mapping tests — verify the POST payload carries the correct backend value
// ---------------------------------------------------------------------------

const CONTENT_TYPE_MAPPING = [
  { label: 'graphics', backendValue: 'image' },
  { label: 'brochure', backendValue: 'pdf' },
  { label: 'video', backendValue: 'video' },
  { label: 'audio', backendValue: 'audio' },
  { label: 'app', backendValue: 'app' },
  { label: 'website', backendValue: 'website' },
] as const;

test.describe('Recommendation content type — submit mapping', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessSeeded(test);
    await loginAsTherapist(page);
  });

  for (const { label, backendValue } of CONTENT_TYPE_MAPPING) {
    test(`"${label}" is sent as "${backendValue}" to the backend`, async ({ page }) => {
      skipUnlessSeeded(test);
      await openAddRecommendationPopup(page);

      const modal = page.locator('.modal.show');

      // Fill required fields
      await modal.locator('#title').fill('E2E content-type test');
      await modal.locator('#description').fill('Automated test for content type mapping');
      await modal.locator('#duration').fill('10');
      await modal.locator('#contentType').selectOption(label);

      // Intercept the multipart POST before submitting
      const postRequest = page.waitForRequest(
        (req) => req.url().includes('/interventions/add/') && req.method() === 'POST',
        { timeout: 10_000 }
      );

      await modal.getByRole('button', { name: /save|submit|add/i }).click();

      const req = await postRequest;
      // FormData is sent as multipart — parse the raw body for the contentType part
      const body = req.postData() ?? '';
      expect(body).toContain(`name="contentType"\r\n\r\n${backendValue}`);
    });
  }
});
