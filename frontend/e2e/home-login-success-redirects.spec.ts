import { expect, test } from '@playwright/test';

test.describe('Home login success redirects', () => {
  test('redirects seeded patient user to /patient after successful login', async ({ page }) => {
    const patientLogin = process.env.E2E_PATIENT_LOGIN;
    const patientPassword = process.env.E2E_PATIENT_PASSWORD;

    test.skip(
      !patientLogin || !patientPassword,
      'Missing E2E_PATIENT_LOGIN/E2E_PATIENT_PASSWORD environment variables'
    );

    test.setTimeout(60000);

    await page.goto('/');
    await page.getByRole('button', { name: /login/i }).first().click();

    const modal = page.locator('.modal.show');
    await expect(modal).toBeVisible();

    await modal.locator('#email').fill(patientLogin as string);
    await modal.locator('#password').fill(patientPassword as string);

    // Capture the login response before clicking so we can diagnose failures
    const loginResultPromise = Promise.race([
      page
        .waitForResponse(
          (res) => res.url().includes('/auth/login/') && res.request().method() === 'POST'
        )
        .then(async (res) => ({
          kind: 'response' as const,
          status: res.status(),
          body: await res.json().catch(() => null),
        })),
      page
        .waitForEvent(
          'requestfailed',
          (req) => req.url().includes('/auth/login/') && req.method() === 'POST'
        )
        .then(() => ({ kind: 'failed' as const, status: 0, body: null })),
    ]);

    await modal.getByRole('button', { name: /login/i }).click();

    const loginResult = await loginResultPromise;

    // Fail with a clear diagnostic if the request itself failed
    expect(
      loginResult.kind,
      `Login request failed at network level — backend may not be reachable`
    ).toBe('response');

    // Fail with a clear diagnostic if credentials are wrong or server errored
    expect(
      loginResult.status,
      `Login returned HTTP ${loginResult.status}. Body: ${JSON.stringify(loginResult.body)}`
    ).toBe(200);

    // For a Patient the backend returns tokens directly (no 2FA), so the app
    // should navigate to /patient after a successful login response.
    await expect(page).toHaveURL(/\/patient(?:\/)?$/, { timeout: 15000 });
  });

  // Admin users require 2FA (same as therapists) — a direct post-login redirect
  // to /admin cannot be tested without completing the 2FA step.
  // Admin 2FA flow is covered by the home-login-therapist.spec.ts pattern.
});
