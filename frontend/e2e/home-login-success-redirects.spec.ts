import { expect, test } from '@playwright/test';

type SeedCreds = {
  login?: string;
  password?: string;
};

function getSeedCreds(role: 'patient' | 'admin'): SeedCreds {
  if (role === 'patient') {
    return {
      login: process.env.E2E_PATIENT_LOGIN,
      password: process.env.E2E_PATIENT_PASSWORD,
    };
  }

  return {
    login: process.env.E2E_ADMIN_LOGIN,
    password: process.env.E2E_ADMIN_PASSWORD,
  };
}

test.describe('Home login success redirects', () => {
  test('redirects seeded patient user to /patient after successful login', async ({ page }) => {
    const creds = getSeedCreds('patient');
    test.skip(
      !creds.login || !creds.password,
      'Missing E2E_PATIENT_LOGIN/E2E_PATIENT_PASSWORD environment variables'
    );

    await page.goto('/');
    await page.getByRole('button', { name: /login/i }).first().click();

    const modal = page.locator('.modal.show');
    await expect(modal).toBeVisible();

    await modal.locator('#email').fill(creds.login as string);
    await modal.locator('#password').fill(creds.password as string);

    await modal.getByRole('button', { name: /login/i }).click();

    await expect(page).toHaveURL(/\/patient(?:\/)?$/, { timeout: 60000 });
  });

  test('redirects seeded admin user to /admin after successful login', async ({ page }) => {
    const creds = getSeedCreds('admin');
    test.skip(
      !creds.login || !creds.password,
      'Missing E2E_ADMIN_LOGIN/E2E_ADMIN_PASSWORD environment variables'
    );

    await page.goto('/');
    await page.getByRole('button', { name: /login/i }).first().click();

    const modal = page.locator('.modal.show');
    await expect(modal).toBeVisible();

    await modal.locator('#email').fill(creds.login as string);
    await modal.locator('#password').fill(creds.password as string);

    await modal.getByRole('button', { name: /login/i }).click();

    await expect(page).toHaveURL(/\/admin(?:\/)?$/, { timeout: 60000 });
  });
});
