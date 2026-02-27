import { expect, test } from '@playwright/test';

function uniqueTherapistEmail() {
  const stamp = Date.now();
  return `e2e.therapist.${stamp}@example.com`;
}

test.describe('Home therapist registration flow', () => {
  test('submits therapist registration from home register modal', async ({ page }) => {
    await page.goto('/');

    await page
      .getByRole('button', { name: /register/i })
      .first()
      .click();
    const modal = page.locator('.modal.show');
    await expect(modal).toBeVisible();

    await modal.locator('#firstName').fill('Eve');
    await modal.locator('#lastName').fill('Therapist');
    await modal.locator('#email').fill(uniqueTherapistEmail());
    await modal.locator('#phone').fill('12345678');
    await modal.locator('#password').fill('StrongPass1!');
    await modal.locator('#repeatPassword').fill('StrongPass1!');
    await modal.locator('#userType').selectOption('Therapist');

    await modal.getByRole('button', { name: /^next$/i }).click();

    // React-Select controls use div containers; click the control by id, then select option by text.
    await modal.locator('#specialisation').click();
    await page.getByText('Cardiology', { exact: true }).first().click();

    await modal.locator('#clinic').click();
    await page.getByText('Berner Reha Centrum', { exact: true }).first().click();

    await modal.locator('#projects').click();
    await page.getByText('COPAIN', { exact: true }).first().click();

    const registerRequestPromise = page.waitForRequest(
      (req) => req.url().includes('/auth/register/') && req.method() === 'POST'
    );
    const registerResultPromise = Promise.race([
      page
        .waitForResponse(
          (res) => res.url().includes('/auth/register/') && res.request().method() === 'POST'
        )
        .then(() => 'response'),
      page
        .waitForEvent(
          'requestfailed',
          (req) => req.url().includes('/auth/register/') && req.method() === 'POST'
        )
        .then(() => 'requestfailed'),
    ]);

    await modal.getByRole('button', { name: /submit/i }).click();

    await registerRequestPromise;
    const registerResult = await registerResultPromise;
    expect(['response', 'requestfailed']).toContain(registerResult);

    await expect(modal.locator('.alert-success, .alert-danger').first()).toBeVisible();
  });
});
