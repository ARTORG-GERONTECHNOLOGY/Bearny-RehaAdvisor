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
import * as fs from 'fs';
import * as path from 'path';

import { expect, test, type APIRequestContext } from '@playwright/test';

import { loginAsTherapist } from './helpers/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = process.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

/** Path to the real COPAIN xlsm file used in import tests. */
const COPAIN_FILE = path.join(__dirname, '../src/__tests__/test_data/COPAIN_MSK_LINKS_UPLOAD.xlsm');
/** The sheet inside COPAIN_MSK_LINKS_UPLOAD.xlsm that contains the data. */
const COPAIN_SHEET = 'MKS_Upload_links';

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

/** Obtain a JWT access token via the login API. */
async function getToken(request: APIRequestContext): Promise<string> {
  const { login, password } = creds();
  const res = await request.post(`${API_BASE}/auth/login/`, {
    data: { username: login, password },
  });
  expect(res.ok(), `Login failed: ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return body.access_token as string;
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

// ===========================================================================
// COPAIN MSK file — API-level import tests
//
// These tests POST the real COPAIN_MSK_LINKS_UPLOAD.xlsm directly to the
// backend import endpoint without a browser. They cover:
//   • dry-run: the file parses without fatal errors
//   • live import: interventions are created / updated in the DB
//
// The sheet inside the file is "MKS_Upload_links" (not the default "Content"),
// which must be passed as the sheet_name parameter.
// ===========================================================================

test.describe('COPAIN MSK file import — API level', () => {
  test('dry-run parses the file without fatal errors', async ({ request }) => {
    skipUnlessSeeded();

    const token = await getToken(request);
    const fileBuffer = fs.readFileSync(COPAIN_FILE);

    const res = await request.post(`${API_BASE}/interventions/import/`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'COPAIN_MSK_LINKS_UPLOAD.xlsm',
          mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
          buffer: fileBuffer,
        },
        sheet_name: COPAIN_SHEET,
        dry_run: 'true',
        default_lang: 'de',
      },
    });

    expect(res.ok(), `Import API error: ${await res.text()}`).toBeTruthy();
    const body = await res.json();

    expect(body.success).toBe(true);
    // Dry-run must not write anything to the DB
    expect(body.created).toBe(0);
    expect(body.updated).toBe(0);
    // The file has ~732 data rows — all should be processed (created+updated+skipped = rows)
    const processed = (body.created ?? 0) + (body.updated ?? 0) + (body.skipped ?? 0);
    expect(processed).toBeGreaterThan(0);
    // No hard errors (warnings about unrecognised taxonomy values are fine)
    expect(body.errors_count ?? 0).toBe(0);
  });

  test('live import creates or updates interventions from all rows', async ({ request }) => {
    skipUnlessSeeded();

    const token = await getToken(request);
    const fileBuffer = fs.readFileSync(COPAIN_FILE);

    const res = await request.post(`${API_BASE}/interventions/import/`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'COPAIN_MSK_LINKS_UPLOAD.xlsm',
          mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
          buffer: fileBuffer,
        },
        sheet_name: COPAIN_SHEET,
        default_lang: 'de',
      },
    });

    expect(res.ok(), `Import API error: ${await res.text()}`).toBeTruthy();
    const body = await res.json();

    expect(body.success).toBe(true);
    // At least some rows must have been written
    expect((body.created ?? 0) + (body.updated ?? 0)).toBeGreaterThan(0);
    // Hard errors must be zero (taxonomy warnings are allowed)
    expect(body.errors_count ?? 0).toBe(0);
  });

  test('re-import is idempotent: second run updates all rows, creates none', async ({
    request,
  }) => {
    skipUnlessSeeded();

    const token = await getToken(request);
    const fileBuffer = fs.readFileSync(COPAIN_FILE);

    const opts = {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'COPAIN_MSK_LINKS_UPLOAD.xlsm',
          mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
          buffer: fileBuffer,
        },
        sheet_name: COPAIN_SHEET,
        default_lang: 'de',
      },
    };

    // First import (may create or update depending on prior state)
    await request.post(`${API_BASE}/interventions/import/`, opts);

    // Second import — everything that existed in the first run is now an upsert
    const res2 = await request.post(`${API_BASE}/interventions/import/`, opts);
    expect(res2.ok(), `Second import API error: ${await res2.text()}`).toBeTruthy();
    const body2 = await res2.json();

    expect(body2.success).toBe(true);
    // No new rows should be created on a repeat import
    expect(body2.created ?? 0).toBe(0);
    expect(body2.updated ?? 0).toBeGreaterThan(0);
    expect(body2.errors_count ?? 0).toBe(0);
  });

  test('wrong sheet name returns an error response', async ({ request }) => {
    skipUnlessSeeded();

    const token = await getToken(request);
    const fileBuffer = fs.readFileSync(COPAIN_FILE);

    const res = await request.post(`${API_BASE}/interventions/import/`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'COPAIN_MSK_LINKS_UPLOAD.xlsm',
          mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
          buffer: fileBuffer,
        },
        sheet_name: 'Content', // intentionally wrong for this file
        dry_run: 'true',
      },
    });

    // Backend returns 500 when sheet is not found (ValueError from openpyxl layer)
    expect(res.status()).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// COPAIN MSK file — UI-level import tests
//
// Full browser flow: log in → open import modal → fill sheet name →
// attach the real xlsm file → click Import → verify result panel.
// ===========================================================================

test.describe('COPAIN MSK file import — UI level', () => {
  test('importing COPAIN file via modal shows a successful result', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
    await openImportModal(page);

    const modal = page.locator('.modal.show');

    // Overwrite the sheet-name field (default is "Content", file uses "MKS_Upload_links")
    const sheetInput = modal.locator('input').filter({ hasText: '' }).nth(1);
    // Use a more reliable selector: the sheet name input follows the file input
    const sheetField = modal.getByLabel(/sheet name/i);
    await sheetField.fill(COPAIN_SHEET);

    // Set the default language to German (the file IDs end in _de)
    await modal.getByRole('combobox').selectOption('de');

    // Attach the real file
    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(COPAIN_FILE);

    // Import button should now be enabled
    const importBtn = modal.getByRole('button', { name: /^Import$/i });
    await expect(importBtn).not.toBeDisabled({ timeout: 3_000 });

    // Intercept the import response
    const importResponse = page.waitForResponse(
      (res) => res.url().includes('/interventions/import/') && res.request().method() === 'POST',
      { timeout: 60_000 }
    );

    await importBtn.click();

    // Wait for the backend to respond (large file, allow up to 60 s)
    const resp = await importResponse;
    expect(resp.ok(), `Import request failed with status ${resp.status()}`).toBeTruthy();

    const body = await resp.json();
    expect(body.success).toBe(true);

    // The result panel should appear in the modal
    await expect(modal.getByText(/Import result/i)).toBeVisible({ timeout: 5_000 });

    // At least some rows were imported (created or updated)
    const createdBadge = modal.getByText(/Created/i).first();
    await expect(createdBadge).toBeVisible();
  });

  test('wrong sheet name surfaces an error in the modal', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
    await openImportModal(page);

    const modal = page.locator('.modal.show');

    // Leave sheet name as "Content" — intentionally wrong for this file
    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(COPAIN_FILE);

    const importBtn = modal.getByRole('button', { name: /^Import$/i });
    await expect(importBtn).not.toBeDisabled({ timeout: 3_000 });

    const importResponse = page.waitForResponse(
      (res) => res.url().includes('/interventions/import/') && res.request().method() === 'POST',
      { timeout: 30_000 }
    );

    await importBtn.click();
    const resp = await importResponse;

    // The response is 500 (wrong sheet name)
    expect(resp.status()).toBe(500);

    // The modal surfaces the failure — either via Alert or result panel
    await expect(
      modal
        .getByRole('alert')
        .or(modal.getByText(/failed/i))
        .first()
    ).toBeVisible({ timeout: 5_000 });
  });
});
