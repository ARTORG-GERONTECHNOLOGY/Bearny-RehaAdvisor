/**
 * E2E tests for the Import Interventions modal — Excel + Upload Media tabs.
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

function skipUnlessSeeded() {
  const { login, password } = creds();
  test.skip(
    !login || !password,
    'Missing E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD — skipping seeded E2E tests'
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
  await expect(page).toHaveURL(/\/therapist/i);
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Import Interventions modal', () => {
  test('shows Excel tab by default and both tab links', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
    await openImportModal(page);

    const modal = page.locator('.modal.show');

    await expect(modal.getByRole('link', { name: /Excel Import/i })).toBeVisible();
    await expect(modal.getByRole('link', { name: /Upload Media/i })).toBeVisible();

    await expect(modal.getByText(/Excel file/i)).toBeVisible();
    await expect(modal.getByText(/Drag & drop/i)).not.toBeVisible();
  });

  test('switching to Upload Media tab shows upload UI', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
    await openImportModal(page);

    const modal = page.locator('.modal.show');
    await modal.getByRole('link', { name: /Upload Media/i }).click();

    await expect(modal.getByText(/Drag & drop/i)).toBeVisible();
    await expect(modal.getByText(/Naming convention/i)).toBeVisible();
    await expect(modal.getByText(/Excel file/i)).not.toBeVisible();
  });

  test('switching back to Excel tab restores Excel UI', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
    await openImportModal(page);

    const modal = page.locator('.modal.show');
    await modal.getByRole('link', { name: /Upload Media/i }).click();
    await modal.getByRole('link', { name: /Excel Import/i }).click();

    await expect(modal.getByText(/Excel file/i)).toBeVisible();
    await expect(modal.getByText(/Drag & drop/i)).not.toBeVisible();
  });

  test('file input accepts multiple media types', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
    await openImportModal(page);

    const modal = page.locator('.modal.show');
    await modal.getByRole('link', { name: /Upload Media/i }).click();

    const fileInput = modal.locator('#media-file-input');
    const accept = await fileInput.getAttribute('accept');
    expect(accept).toMatch(/mp4/i);
    expect(accept).toMatch(/mp3/i);
    expect(accept).toMatch(/pdf/i);
    expect(accept).toMatch(/jpg/i);
  });

  test('Upload button is disabled with no files selected', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
    await openImportModal(page);

    const modal = page.locator('.modal.show');
    await modal.getByRole('link', { name: /Upload Media/i }).click();

    await expect(modal.getByRole('button', { name: /^Upload$/i })).toBeDisabled();
  });

  test('valid mp4 file shows ✓ badge and enables Upload button', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
    await openImportModal(page);

    const modal = page.locator('.modal.show');
    await modal.getByRole('link', { name: /Upload Media/i }).click();

    await page.locator('#media-file-input').setInputFiles({
      name: '3500_web_de.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake-mp4-data'),
    });

    await expect(modal.getByText('✓')).toBeVisible({ timeout: 3_000 });
    await expect(modal.getByRole('button', { name: /^Upload$/i })).not.toBeDisabled();
  });

  test('valid pdf file shows ✓ badge and enables Upload button', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
    await openImportModal(page);

    const modal = page.locator('.modal.show');
    await modal.getByRole('link', { name: /Upload Media/i }).click();

    await page.locator('#media-file-input').setInputFiles({
      name: '3500_pdf_de.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('fake-pdf-data'),
    });

    await expect(modal.getByText('✓')).toBeVisible({ timeout: 3_000 });
    await expect(modal.getByRole('button', { name: /^Upload$/i })).not.toBeDisabled();
  });

  test('invalid filename shows ✗ badge and Upload button stays disabled', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
    await openImportModal(page);

    const modal = page.locator('.modal.show');
    await modal.getByRole('link', { name: /Upload Media/i }).click();

    await page.locator('#media-file-input').setInputFiles({
      name: 'random_video.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake-mp4-data'),
    });

    await expect(modal.getByText('✗')).toBeVisible({ timeout: 3_000 });
    await expect(modal.getByRole('button', { name: /^Upload$/i })).toBeDisabled();
  });

  test('naming convention shows example filenames for all supported types', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
    await openImportModal(page);

    const modal = page.locator('.modal.show');
    await modal.getByRole('link', { name: /Upload Media/i }).click();

    await expect(modal.getByText(/3500_web_de\.mp4/)).toBeVisible();
    await expect(modal.getByText(/3500_aud_de\.mp3/)).toBeVisible();
    await expect(modal.getByText(/3500_pdf_de\.pdf/)).toBeVisible();
    await expect(modal.getByText(/3500_img_de\.jpg/)).toBeVisible();
  });

  test('close button dismisses the modal', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
    await openImportModal(page);

    await page.locator('.modal.show').getByRole('button', { name: /close/i }).click();
    await expect(page.locator('.modal.show')).not.toBeVisible({ timeout: 3_000 });
  });
});
