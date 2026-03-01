import { expect, test } from '@playwright/test';

async function loginAsSeededPatient(page: Parameters<typeof test>[0]['page']) {
  const patientLogin = process.env.E2E_PATIENT_LOGIN;
  const patientPassword = process.env.E2E_PATIENT_PASSWORD;

  test.skip(
    !patientLogin || !patientPassword,
    'Missing E2E_PATIENT_LOGIN/E2E_PATIENT_PASSWORD environment variables'
  );

  await page.goto('/');
  await page.getByRole('button', { name: /login/i }).first().click();

  const modal = page.locator('.modal.show');
  await expect(modal).toBeVisible();

  await modal.locator('#email').fill(patientLogin as string);
  await modal.locator('#password').fill(patientPassword as string);
  await modal.getByRole('button', { name: /login/i }).click();

  await expect(page).toHaveURL(/\/patient(?:\/)?$/);
}

test.describe('Patient interventions page', () => {
  test('redirects unauthenticated user away from /patient-interventions', async ({ page }) => {
    await page.goto('/patient-interventions');
    await expect(page).toHaveURL(/\/$/);
  });

  test('loads patient interventions page and triggers interventions library API call', async ({
    page,
  }) => {
    await loginAsSeededPatient(page);

    const libraryReqPromise = page.waitForRequest(
      (req) => req.method() === 'GET' && req.url().includes('/interventions/all/')
    );

    await page.goto('/patient-interventions');
    await expect(page).toHaveURL(/\/patient-interventions(?:\/)?$/);
    await libraryReqPromise;

    await expect(page.getByPlaceholder(/search interventions/i)).toBeVisible();
  });

  test('supports search/content-type filter interactions and reset', async ({ page }) => {
    await loginAsSeededPatient(page);
    await page.goto('/patient-interventions');

    const searchInput = page.getByPlaceholder(/search interventions/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('cardio');
    await expect(searchInput).toHaveValue('cardio');

    const contentTypeSelect = page.locator('select').first();
    await expect(contentTypeSelect).toBeVisible();
    const optionCount = await contentTypeSelect.locator('option').count();
    if (optionCount > 1) {
      const val = await contentTypeSelect.locator('option').nth(1).getAttribute('value');
      if (val) {
        await contentTypeSelect.selectOption(val);
        await expect(contentTypeSelect).toHaveValue(val);
      }
    }

    await page.getByRole('button', { name: /reset filters/i }).click();
    await expect(searchInput).toHaveValue('');
    await expect(contentTypeSelect).toHaveValue('');
  });

  test('opens and closes intervention details modal when at least one intervention exists', async ({
    page,
  }) => {
    await loginAsSeededPatient(page);
    await page.goto('/patient-interventions');

    const emptyState = page.getByText(/no interventions found/i);
    if ((await emptyState.count()) > 0) {
      test.skip(true, 'No interventions available for seeded patient library.');
    }

    const firstItem = page.locator('[aria-label="Intervention"]').first();
    const hasItem = (await firstItem.count()) > 0;
    test.skip(!hasItem, 'No clickable intervention row available.');

    await firstItem.click();

    const detailsModal = page.locator('.modal.show');
    await expect(detailsModal).toBeVisible();

    await detailsModal.getByRole('button', { name: /close/i }).first().click();
    await expect(detailsModal).toBeHidden();
  });
});
