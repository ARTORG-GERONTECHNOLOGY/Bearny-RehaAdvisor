import * as fs from 'fs';
import * as path from 'path';

import { expect, type Page } from '@playwright/test';

type PlaywrightPage = Page;

/**
 * Log in as the seeded E2E therapist, completing the mandatory 2FA step by
 * reading the verification code from the email file written by Django's
 * filebased email backend (requires E2E_EMAIL_DIR to be set).
 */
export async function loginAsTherapist(page: PlaywrightPage): Promise<void> {
  const login = process.env.E2E_THERAPIST_LOGIN as string;
  const password = process.env.E2E_THERAPIST_PASSWORD as string;
  const emailDir = process.env.E2E_EMAIL_DIR;

  if (!emailDir) {
    throw new Error(
      'E2E_EMAIL_DIR is not set. Set it to a directory path and start Django with the same env var ' +
        'so it writes verification emails as files instead of sending via SMTP.'
    );
  }

  await page.goto('/');
  await page.getByRole('button', { name: /login/i }).first().click();

  const modal = page.locator('[role="dialog"][data-state="open"]');
  await expect(modal).toBeVisible();

  await modal.locator('#email').fill(login);
  await modal.locator('#password').fill(password);

  // Snapshot files already present so we can detect the new one after login
  const existingFiles = new Set(readEmailFiles(emailDir));

  const loginResponsePromise = page.waitForResponse(
    (res) => res.url().includes('/auth/login/') && res.request().method() === 'POST'
  );
  const codeSentPromise = page.waitForResponse(
    (res) =>
      res.url().includes('/auth/send-verification-code/') && res.request().method() === 'POST',
    { timeout: 15_000 }
  );

  await modal.getByRole('button', { name: /login/i }).click();

  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);

  const loginBody = (await loginResponse.json()) as { require_2fa?: boolean };

  if (!loginBody.require_2fa) {
    await expect(page).toHaveURL(/\/therapist/);
    return;
  }

  // 2FA required — wait for the verification email to be sent
  await codeSentPromise;

  const code = await waitForVerificationCode(emailDir, existingFiles);

  const verifyDonePromise = page.waitForResponse(
    (res) => res.url().includes('/auth/verify-code/') && res.request().method() === 'POST'
  );

  // Click the OTP container to focus the underlying input, then type the code
  await modal.locator('#verificationCode').click();
  await page.keyboard.type(code);

  await modal.getByRole('button', { name: /submit code/i }).click();

  const verifyResponse = await verifyDonePromise;
  expect(verifyResponse.status()).toBe(200);

  await expect(page).toHaveURL(/\/therapist/);
}

function readEmailFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.log'));
  } catch {
    return [];
  }
}

async function waitForVerificationCode(
  emailDir: string,
  existingFiles: Set<string>,
  timeoutMs = 10_000
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const newFiles = readEmailFiles(emailDir).filter((f) => !existingFiles.has(f));
    for (const file of newFiles) {
      const content = fs.readFileSync(path.join(emailDir, file), 'utf-8');
      const match = content.match(/\b(\d{6})\b/);
      if (match) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `No 6-digit verification code found in ${emailDir} within ${timeoutMs}ms. ` +
      'Check that E2E_EMAIL_DIR is set for both Django and Playwright.'
  );
}
