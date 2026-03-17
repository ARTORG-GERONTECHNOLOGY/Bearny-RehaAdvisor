import { expect, test } from '@playwright/test';

test.describe('Home login success redirects', () => {
  test('redirects seeded patient user to /patient after successful login', async ({ page }) => {
    const patientLogin = process.env.E2E_PATIENT_LOGIN;
    const patientPassword = process.env.E2E_PATIENT_PASSWORD;

    test.skip(
      !patientLogin || !patientPassword,
      'Missing E2E_PATIENT_LOGIN/E2E_PATIENT_PASSWORD environment variables'
    );

    // Allow enough time for login + redirect
    test.setTimeout(60000);

    await page.goto('/');
    await page.getByRole('button', { name: /login/i }).first().click();

    const modal = page.locator('.modal.show');
    await expect(modal).toBeVisible();

    await modal.locator('#email').fill(patientLogin as string);
    await modal.locator('#password').fill(patientPassword as string);
    await modal.getByRole('button', { name: /login/i }).click();

    await expect(page).toHaveURL(/\/patient(?:\/)?$/);
  });

  // Admin users require 2FA (same as therapists) — a direct post-login redirect
  // to /admin cannot be tested without completing the 2FA step.
  // Admin 2FA flow is covered in home-login-therapist.spec.ts pattern.
});
