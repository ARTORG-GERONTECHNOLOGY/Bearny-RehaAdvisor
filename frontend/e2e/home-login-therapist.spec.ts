import { expect, test } from '@playwright/test';

test.describe('Home therapist login flow', () => {
  test('requires 2FA step for seeded therapist login', async ({ page }) => {
    const therapistLogin = process.env.E2E_THERAPIST_LOGIN;
    const therapistPassword = process.env.E2E_THERAPIST_PASSWORD;

    test.skip(
      !therapistLogin || !therapistPassword,
      'Missing E2E_THERAPIST_LOGIN/E2E_THERAPIST_PASSWORD environment variables'
    );

    await page.goto('/');
    await page.getByRole('button', { name: /login/i }).first().click();

    const modal = page.locator('.modal.show');
    await expect(modal).toBeVisible();

    await modal.locator('#email').fill(therapistLogin as string);
    await modal.locator('#password').fill(therapistPassword as string);

    const loginResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/auth/login/') && res.request().method() === 'POST'
    );
    const sendCodeResultPromise = Promise.race([
      page
        .waitForResponse(
          (res) =>
            res.url().includes('/auth/send-verification-code/') && res.request().method() === 'POST'
        )
        .then(() => 'response'),
      page
        .waitForEvent(
          'requestfailed',
          (req) => req.url().includes('/auth/send-verification-code/') && req.method() === 'POST'
        )
        .then(() => 'requestfailed'),
    ]);

    await modal.getByRole('button', { name: /login/i }).click();

    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBe(200);

    const loginPayload = (await loginResponse.json()) as { require_2fa?: boolean };
    expect(loginPayload.require_2fa).toBe(true);

    const sendCodeResult = await sendCodeResultPromise;
    expect(['response', 'requestfailed']).toContain(sendCodeResult);

    await expect(modal.locator('#verificationCode')).toBeVisible();
  });
});
