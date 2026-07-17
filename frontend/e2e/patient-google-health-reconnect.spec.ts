import { expect, test } from '@playwright/test';

/**
 * Google Health reconnect banner — E2E tests
 *
 * All tests mock /api/google-health/status/ so no real Google token is needed.
 * The patient login credentials (E2E_PATIENT_LOGIN / E2E_PATIENT_PASSWORD) are
 * required; tests skip gracefully when they are absent.
 */

async function loginAsPatient(page: Parameters<Parameters<typeof test>[1]>[0]) {
  const login = process.env.E2E_PATIENT_LOGIN;
  const password = process.env.E2E_PATIENT_PASSWORD;

  test.skip(
    !login || !password,
    'Missing E2E_PATIENT_LOGIN / E2E_PATIENT_PASSWORD — skipping reconnect banner E2E tests'
  );

  await page.goto('/');
  await page.getByRole('button', { name: /login/i }).first().click();

  const modal = page.locator('[role="dialog"][data-state="open"]');
  await expect(modal).toBeVisible();
  await modal.locator('#email').fill(login as string);
  await modal.locator('#password').fill(password as string);
  await modal.getByRole('button', { name: /login/i }).click();

  await expect(page).toHaveURL(/\/patient(?:\/)?$/);
  await page.reload({ waitUntil: 'networkidle' });
}

function mockStatus(
  page: Parameters<Parameters<typeof test>[1]>[0],
  overrides: Record<string, unknown> = {}
) {
  return page.route('**/google-health/status/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        connected: true,
        has_data: false,
        last_data: null,
        needs_reconnect: false,
        days_until_expiry: 7,
        wearable_device: 'fitbit',
        ...overrides,
      }),
    })
  );
}

test.describe('Google Health reconnect banner', () => {
  test('banner is NOT shown when needs_reconnect is false', async ({ page }) => {
    await mockStatus(page, { needs_reconnect: false, days_until_expiry: 7 });
    await loginAsPatient(page);

    // Banner should not be present
    await expect(page.getByRole('link', { name: /reconnect/i })).not.toBeVisible();
  });

  test('banner shows "expires in 1 day" message at day 6', async ({ page }) => {
    await mockStatus(page, { needs_reconnect: true, days_until_expiry: 1 });
    await loginAsPatient(page);

    await expect(page.getByText(/expires in 1 day/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('link', { name: /reconnect/i })).toBeVisible();
  });

  test('banner shows expired message when days_until_expiry is 0', async ({ page }) => {
    await mockStatus(page, { needs_reconnect: true, days_until_expiry: 0 });
    await loginAsPatient(page);

    // "expired" wording (from reconnectBannerExpired key)
    await expect(page.getByText(/expired/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('link', { name: /reconnect/i })).toBeVisible();
  });

  test('dismiss button hides the banner without navigating', async ({ page }) => {
    await mockStatus(page, { needs_reconnect: true, days_until_expiry: 1 });
    await loginAsPatient(page);

    await expect(page.getByRole('link', { name: /reconnect/i })).toBeVisible({ timeout: 8000 });

    await page.getByRole('button', { name: /dismiss/i }).click();

    await expect(page.getByRole('link', { name: /reconnect/i })).not.toBeVisible();
    // Page URL has not changed
    await expect(page).toHaveURL(/\/patient(?:\/)?$/);
  });

  test('reconnect link points to Google OAuth', async ({ page }) => {
    await mockStatus(page, { needs_reconnect: true, days_until_expiry: 1 });
    await loginAsPatient(page);

    await expect(page.getByRole('link', { name: /reconnect/i })).toBeVisible({ timeout: 8000 });

    const href = await page
      .getByRole('link', { name: /reconnect/i })
      .getAttribute('href');

    expect(href).toContain('accounts.google.com');
    expect(href).toContain('googlehealth');
  });

  test('banner does not reappear after dismiss within same session', async ({ page }) => {
    await mockStatus(page, { needs_reconnect: true, days_until_expiry: 1 });
    await loginAsPatient(page);

    await expect(page.getByRole('link', { name: /reconnect/i })).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: /dismiss/i }).click();
    await expect(page.getByRole('link', { name: /reconnect/i })).not.toBeVisible();

    // Navigate away and back within the same session (sessionStorage preserved)
    await page.goto('/patient-profile');
    await page.goBack();
    await page.waitForURL(/\/patient(?:\/)?$/);

    await expect(page.getByRole('link', { name: /reconnect/i })).not.toBeVisible();
  });
});
