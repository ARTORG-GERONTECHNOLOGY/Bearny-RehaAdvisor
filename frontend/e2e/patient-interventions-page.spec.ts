import { expect, test, type Page } from '@playwright/test';

async function loginAsSeededPatient(page: Page) {
  const patientLogin = process.env.E2E_PATIENT_LOGIN;
  const patientPassword = process.env.E2E_PATIENT_PASSWORD;

  test.skip(
    !patientLogin || !patientPassword,
    'Missing E2E_PATIENT_LOGIN/E2E_PATIENT_PASSWORD environment variables'
  );

  await page.goto('/');
  await page.getByRole('button', { name: /login/i }).first().click();

  const modal = page.locator('[role="dialog"][data-state="open"]');
  await expect(modal).toBeVisible();

  await modal.locator('#email').fill(patientLogin as string);
  await modal.locator('#password').fill(patientPassword as string);
  await modal.getByRole('button', { name: /login/i }).click();

  await expect(page).toHaveURL(/\/patient(?:\/)?$/);
  // Hard reload to flush React Router's pending navigate('/patient') before the
  // caller issues its own page.goto(). SPA navigations don't fire browser load
  // events, so waitForLoadState('load') is a no-op here — only a real reload
  // clears the navigation queue. Matches the therapist helper pattern in auth.ts.
  await page.reload({ waitUntil: 'networkidle' });
}

test.describe('Patient interventions page', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const getSearchInput = (page: Page) => page.locator('#inline-end-input');

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

    await expect(getSearchInput(page)).toBeVisible();
  });

  test('supports search/content-type filter interactions and reset', async ({ page }) => {
    await loginAsSeededPatient(page);
    await page.goto('/patient-interventions');

    const searchInput = getSearchInput(page);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('cardio');
    await expect(searchInput).toHaveValue('cardio');

    // Search mode renders a full-screen close layer that blocks filter clicks.
    await page.keyboard.press('Escape');
    await expect(searchInput).toHaveValue('');

    const openFilterButton = page.getByRole('button', { name: /open filter/i });
    await expect(openFilterButton).toBeVisible();
    await openFilterButton.click();

    const firstSwitch = page.getByRole('switch').first();
    if ((await firstSwitch.count()) > 0) {
      await firstSwitch.click();
      await expect(firstSwitch).toHaveAttribute('data-state', /^checked$/);
    }

    await page.getByRole('button', { name: /reset filters/i }).click();
    await expect(searchInput).toHaveValue('');

    if ((await firstSwitch.count()) > 0) {
      await expect(firstSwitch).toHaveAttribute('data-state', /^unchecked$/);
    }
  });

  test('navigates to intervention details page and back when at least one intervention exists', async ({
    page,
  }) => {
    await loginAsSeededPatient(page);
    await page.goto('/patient-interventions');

    const emptyState = page.getByText(/no interventions found/i);
    if ((await emptyState.count()) > 0) {
      test.skip(true, 'No interventions available for seeded patient library.');
    }

    const firstItem = page.locator('section[role="button"] div[role="button"]').first();
    const hasItem = (await firstItem.count()) > 0;
    test.skip(!hasItem, 'No clickable intervention row available.');

    await firstItem.click();

    // Details view is a dedicated route (see PatientInterventionDetail.tsx), not a modal.
    await expect(page).toHaveURL(/\/patient-intervention\/[^/?]+/);

    const backButton = page.getByRole('button', { name: /back/i });
    await expect(backButton).toBeVisible();

    await backButton.click();
    await expect(page).toHaveURL(/\/patient-interventions(?:\/)?$/);
  });
});
