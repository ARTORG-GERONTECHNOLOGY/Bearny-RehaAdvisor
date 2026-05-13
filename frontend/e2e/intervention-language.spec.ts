/**
 * E2E tests — intervention language handling
 *
 * Verifies three fixes from issue #262:
 *  1. Therapist library: GET /interventions/all/ is called with a `lang` query
 *     parameter matching the UI language.
 *  2. Import modal: the default language in the Excel Import tab matches the
 *     UI language rather than always being "en".
 *  3. Patient plan: duplicate interventions sharing the same external_id are not
 *     shown twice on the daily plan page.
 *
 * Requires seeded credentials:
 *   E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD
 *   E2E_PATIENT_LOGIN   / E2E_PATIENT_PASSWORD   (for the patient dedup test)
 *
 * All tests skip gracefully when credentials are absent so CI stays green
 * without a seeded database.
 */

import { expect, test } from '@playwright/test';
import { loginAsTherapist } from './helpers/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function skipUnlessTherapistSeeded() {
  test.skip(
    !process.env.E2E_THERAPIST_LOGIN || !process.env.E2E_THERAPIST_PASSWORD,
    'Missing E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD — skipping seeded E2E tests'
  );
}

function skipUnlessPatientSeeded() {
  test.skip(
    !process.env.E2E_PATIENT_LOGIN || !process.env.E2E_PATIENT_PASSWORD,
    'Missing E2E_PATIENT_LOGIN / E2E_PATIENT_PASSWORD — skipping seeded E2E tests'
  );
}

async function loginAsPatient(page: Parameters<Parameters<typeof test>[1]>[0]) {
  const login = process.env.E2E_PATIENT_LOGIN as string;
  const password = process.env.E2E_PATIENT_PASSWORD as string;

  await page.goto('/');
  await page.getByRole('button', { name: /login/i }).first().click();

  const modal = page.locator('[role="dialog"][data-state="open"]');
  await expect(modal).toBeVisible();

  await modal.locator('#email').fill(login);
  await modal.locator('#password').fill(password);
  await modal.getByRole('button', { name: /login/i }).click();

  await page.waitForURL(/\/patient(?:\/)?$/, { timeout: 20_000 });
}

// ---------------------------------------------------------------------------
// Therapist library — lang param
// ---------------------------------------------------------------------------

test.describe('Therapist interventions library — language param', () => {
  test('GET /interventions/all/ includes lang query param on page load', async ({ page }) => {
    skipUnlessTherapistSeeded();
    await loginAsTherapist(page);

    // Intercept the library API call
    const libraryRequest = page.waitForRequest(
      (req) =>
        req.method() === 'GET' &&
        req.url().includes('/interventions/all/') &&
        new URL(req.url()).searchParams.has('lang'),
      { timeout: 15_000 }
    );

    await page.goto('/interventions');
    const req = await libraryRequest;

    const lang = new URL(req.url()).searchParams.get('lang');
    expect(lang).toBeTruthy();
    expect(lang).toMatch(/^[a-z]{2}$/); // e.g. "en", "de", "fr"
  });

  test('lang param in the library request matches the UI language cookie/setting', async ({
    page,
  }) => {
    skipUnlessTherapistSeeded();

    // Set the browser to German before navigating so i18n picks it up
    await page.addInitScript(() => {
      localStorage.setItem('i18nextLng', 'de');
    });

    await loginAsTherapist(page);

    const libraryRequest = page.waitForRequest(
      (req) =>
        req.method() === 'GET' &&
        req.url().includes('/interventions/all/') &&
        new URL(req.url()).searchParams.has('lang'),
      { timeout: 15_000 }
    );

    await page.goto('/interventions');
    const req = await libraryRequest;

    const lang = new URL(req.url()).searchParams.get('lang');
    expect(lang).toBe('de');
  });
});

// ---------------------------------------------------------------------------
// Import modal — default language
// ---------------------------------------------------------------------------

test.describe('Import Interventions modal — default language', () => {
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

  test('default language field is set to the UI language (not always "en")', async ({ page }) => {
    skipUnlessTherapistSeeded();

    // Set UI to German before logging in
    await page.addInitScript(() => {
      localStorage.setItem('i18nextLng', 'de');
    });

    await loginAsTherapist(page);
    await openImportModal(page);

    const modal = page.locator('.modal.show');
    // The language select/input inside the Excel Import tab should show "de"
    const langField = modal
      .locator('select[name="defaultLang"], input[name="defaultLang"], [data-testid="default-lang"]')
      .first();

    await expect(langField).toBeVisible({ timeout: 3_000 });
    const value = await langField.inputValue();
    expect(value).toBe('de');
  });

  test('default language falls back to "en" when config has no override and UI is English', async ({
    page,
  }) => {
    skipUnlessTherapistSeeded();

    await page.addInitScript(() => {
      localStorage.setItem('i18nextLng', 'en');
    });

    await loginAsTherapist(page);
    await openImportModal(page);

    const modal = page.locator('.modal.show');
    const langField = modal
      .locator('select[name="defaultLang"], input[name="defaultLang"], [data-testid="default-lang"]')
      .first();

    await expect(langField).toBeVisible({ timeout: 3_000 });
    const value = await langField.inputValue();
    expect(value).toBe('en');
  });
});

// ---------------------------------------------------------------------------
// Patient daily plan — no duplicate interventions
// ---------------------------------------------------------------------------

test.describe('Patient daily plan — no duplicate interventions', () => {
  test('each intervention appears at most once on the daily plan', async ({ page }) => {
    skipUnlessPatientSeeded();
    await loginAsPatient(page);

    // Navigate to today's plan
    await page.goto('/patient');
    await expect(page).toHaveURL(/\/patient(?:\/)?$/);

    // Wait for the plan to load (at least one intervention card or the empty state)
    await page.waitForSelector(
      '[data-testid="intervention-card"], [data-testid="empty-plan"]',
      { timeout: 10_000 }
    );

    const cards = page.locator('[data-testid="intervention-card"]');
    const count = await cards.count();

    if (count === 0) {
      // No interventions assigned — nothing to deduplicate
      return;
    }

    // Collect all visible intervention titles
    const titles: string[] = [];
    for (let i = 0; i < count; i++) {
      const title = await cards.nth(i).locator('[data-testid="intervention-title"]').textContent();
      if (title) titles.push(title.trim());
    }

    // Each title should appear at most once (duplicates were the bug)
    const unique = new Set(titles);
    expect(unique.size).toBe(titles.length);
  });
});
