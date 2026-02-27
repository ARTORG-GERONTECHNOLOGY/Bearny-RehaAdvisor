import { expect, test } from '@playwright/test';

test.describe('Home login flow', () => {
  test('sends login credentials to backend and shows an error on invalid credentials', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: /login/i }).first()).toBeVisible();
    await page.getByRole('button', { name: /login/i }).first().click();

    const modal = page.locator('.modal.show');
    await expect(modal).toBeVisible();

    await modal.locator('#email').fill('e2e.invalid@example.com');
    await modal.locator('#password').fill('wrong-password');

    const loginRequestPromise = page.waitForRequest(
      (req) => req.url().includes('/auth/login/') && req.method() === 'POST'
    );
    const loginResultPromise = Promise.race([
      page
        .waitForResponse(
          (res) => res.url().includes('/auth/login/') && res.request().method() === 'POST'
        )
        .then(() => 'response'),
      page
        .waitForEvent(
          'requestfailed',
          (req) => req.url().includes('/auth/login/') && req.method() === 'POST'
        )
        .then(() => 'requestfailed'),
    ]);

    await modal.getByRole('button', { name: /login/i }).click();

    const request = await loginRequestPromise;
    const payload = request.postDataJSON() as { email?: string; password?: string };
    expect(payload.email).toBe('e2e.invalid@example.com');
    expect(payload.password).toBe('wrong-password');

    const loginResult = await loginResultPromise;
    expect(['response', 'requestfailed']).toContain(loginResult);

    await expect(modal.locator('.alert-danger').first()).toBeVisible();
  });
});
