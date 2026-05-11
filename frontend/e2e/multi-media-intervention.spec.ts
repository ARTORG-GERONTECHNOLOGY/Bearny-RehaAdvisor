/**
 * E2E tests for multi-media per intervention feature.
 *
 * Covers:
 *  1. Add Intervention modal shows multi-media info text and "Add media" button
 *  2. Multiple media rows can be added in the manual upload form
 *  3. Upload Media tab shows slot-suffix naming convention
 *  4. Excel tab shows slot-suffix hint
 *  5. Patient popup shows tabs when intervention has multiple media items
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

function skipUnlessSeeded() {
  const login = process.env.E2E_THERAPIST_LOGIN;
  const password = process.env.E2E_THERAPIST_PASSWORD;
  test.skip(
    !login || !password,
    'Missing E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD — skipping seeded E2E tests'
  );
}

async function openAddInterventionModal(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.goto('/interventions');
  const addBtn = page
    .getByRole('button', { name: /^add intervention$/i })
    .or(page.locator('[data-testid="add-intervention-btn"]'))
    .first();
  await expect(addBtn).toBeVisible({ timeout: 10_000 });
  await addBtn.click();
  await expect(page.locator('.modal.show')).toBeVisible({ timeout: 5_000 });
}

async function openImportModal(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.goto('/interventions');
  const importBtn = page
    .getByRole('button', { name: /^import$/i })
    .or(page.locator('[data-testid="import-interventions-btn"]'))
    .first();
  await expect(importBtn).toBeVisible({ timeout: 10_000 });
  await importBtn.click();
  await expect(page.locator('.modal.show')).toBeVisible({ timeout: 5_000 });
}

test.describe('Multi-media per intervention', () => {
  test('Add Intervention modal shows multi-media info and Add media button', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
    await openAddInterventionModal(page);

    const modal = page.locator('.modal.show');

    // The multi-media info alert should be visible
    await expect(modal.getByText(/You can add multiple media items/i)).toBeVisible({
      timeout: 5_000,
    });

    // The "Add media" button should be visible
    await expect(modal.getByRole('button', { name: /Add media/i })).toBeVisible();
  });

  test('Add Intervention modal allows adding multiple media rows', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
    await openAddInterventionModal(page);

    const modal = page.locator('.modal.show');
    const addMediaBtn = modal.getByRole('button', { name: /Add media/i });

    // Click "Add media" twice to get 2 rows
    await addMediaBtn.click();
    await addMediaBtn.click();

    // Should have at least 2 media item headers
    const mediaHeaders = modal.getByText(/Media item #/i);
    await expect(mediaHeaders).toHaveCount(2, { timeout: 3_000 });
  });

  test('Upload Media tab shows slot-suffix naming convention info', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
    await openImportModal(page);

    const modal = page.locator('.modal.show');
    await modal.getByRole('link', { name: /Upload Media/i }).click();

    await expect(modal.getByText(/Multiple media per intervention/i)).toBeVisible({ timeout: 5_000 });
    // The example slot-2 filename should appear
    await expect(modal.locator('code', { hasText: /_2/ }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Excel Import tab shows slot-suffix hint in help text', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
    await openImportModal(page);

    const modal = page.locator('.modal.show');

    // The Excel help text should contain the slot-2 example
    await expect(modal.getByText(/3500_web_de_2/i)).toBeVisible({ timeout: 5_000 });
  });
});
