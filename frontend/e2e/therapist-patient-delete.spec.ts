import { expect, test } from '@playwright/test';

import { loginAsTherapist } from './helpers/auth';

function skipUnlessSeeded(t: typeof test) {
  const login = process.env.E2E_THERAPIST_LOGIN;
  const password = process.env.E2E_THERAPIST_PASSWORD;
  const emailDir = process.env.E2E_EMAIL_DIR;
  t.skip(
    !login || !password || !emailDir,
    'Missing E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD / E2E_EMAIL_DIR — skipping seeded E2E tests'
  );
}

async function mockPatientPopupPrereqs(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.route('**/users/*/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        _id: '680000000000000000000001',
        first_name: 'E2E',
        name: 'Patient',
        patient_code: 'P-E2E-001',
      }),
    });
  });

  await page.route('**/redcap/patient/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ matches: [] }),
    });
  });

  await page.route('**/patients/*/thresholds/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ thresholds: {}, thresholds_history: [] }),
    });
  });
}

async function openPatientInfoTab(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.goto('/therapist');
  // Patient rows navigate to the consolidated patient detail page.
  const firstRow = page.locator('tr.cursor-pointer').first();
  await expect(firstRow).toBeVisible({ timeout: 15000 });
  await firstRow.click();
  await page.getByRole('tab', { name: 'Information' }).click();
  // Wait for the Information tab content to be present (profile loaded)
  await expect(page.getByRole('button', { name: /DeletePatient/i })).toBeVisible({
    timeout: 10000,
  });
}

test.describe('Therapist patient delete', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessSeeded(test);
    await loginAsTherapist(page);
    await mockPatientPopupPrereqs(page);
  });

  test('DELETE sends to /users/:id/profile/ — not /patients/:id/ — and navigates back to the patient list on success', async ({
    page,
  }) => {
    skipUnlessSeeded(test);

    // Regression: the old code called DELETE /patients/:id/ which doesn't exist → 404.
    // The fix calls DELETE /users/:id/profile/ which the backend handles.
    await page.route('**/users/*/profile/', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'User deleted' }),
        });
      } else {
        await route.continue();
      }
    });

    await openPatientInfoTab(page);

    // Click the delete button inside the Information tab
    const deleteBtn = page.getByRole('button', { name: /delete.*patient|DeletePatient/i }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 10000 });
    await deleteBtn.click();

    // Confirm deletion dialog must appear
    const confirmDialog = page.getByRole('dialog').filter({ hasText: /confirm deletion/i });
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });

    // Intercept the DELETE request before clicking Confirm
    const deleteRequest = page.waitForRequest(
      (req) => req.method() === 'DELETE' && /\/users\/[^/]+\/profile\//.test(req.url())
    );

    await confirmDialog.getByRole('button', { name: /^delete$/i }).click();

    const req = await deleteRequest;

    // Assert correct URL shape — must match /users/<id>/profile/, NOT /patients/<id>/
    expect(req.url()).toMatch(/\/users\/[^/]+\/profile\//);
    expect(req.url()).not.toMatch(/\/patients\/[^/]+\//);

    // Confirm dialog must close
    await expect(page.getByRole('dialog').filter({ hasText: /confirm deletion/i })).toHaveCount(0, {
      timeout: 5000,
    });

    // The page navigates back to the patient list after a successful delete
    // (there's no popup to close anymore — the Information content is inline).
    await expect(page).toHaveURL(/\/therapist$/, { timeout: 5000 });
  });

  test('shows error alert when delete API call fails', async ({ page }) => {
    skipUnlessSeeded(test);

    await page.route('**/users/*/profile/', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      } else {
        await route.continue();
      }
    });

    await openPatientInfoTab(page);

    const deleteBtn = page.getByRole('button', { name: /delete.*patient|DeletePatient/i }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 10000 });
    await deleteBtn.click();

    const confirmDialog = page.getByRole('dialog').filter({ hasText: /confirm deletion/i });
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });

    await confirmDialog.getByRole('button', { name: /^delete$/i }).click();

    // Error from the backend must surface to the user
    const errorAlert = page
      .locator('.alert')
      .filter({ hasText: /internal server error|failed to delete/i });
    await expect(errorAlert).toBeVisible({ timeout: 8000 });

    // Confirm dialog must close, but the Information tab stays put (delete failed, no navigation)
    await expect(confirmDialog).toHaveCount(0, { timeout: 3000 });
    await expect(page).toHaveURL(/\/therapist-patient-detail\//);
  });
});
