/**
 * E2E tests for the Admin Dashboard — Health Questionnaires tab.
 *
 * Requires a seeded admin account:
 *   E2E_ADMIN_LOGIN    — admin username / email
 *   E2E_ADMIN_PASSWORD — admin password
 *   E2E_EMAIL_DIR      — directory where Django writes filebased emails (for 2FA)
 *
 * All tests skip gracefully when credentials are absent so CI stays green
 * without a seeded database.
 */
import { expect, test, type APIRequestContext } from '@playwright/test';

import { loginAsAdmin } from './helpers/auth';

const API_BASE = process.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

function creds() {
  return {
    login: process.env.E2E_ADMIN_LOGIN,
    password: process.env.E2E_ADMIN_PASSWORD,
  };
}

function skipUnlessSeeded() {
  const { login, password } = creds();
  test.skip(!login || !password, 'E2E_ADMIN_LOGIN / E2E_ADMIN_PASSWORD not set — skipping');
}

// ---------------------------------------------------------------------------
// Helpers — seed & teardown via API
// ---------------------------------------------------------------------------

async function createQuestionnaire(
  request: APIRequestContext,
  token: string,
  key: string,
  title: string
) {
  const res = await request.post(`${API_BASE}/questionnaires/health/`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { key, title, description: 'E2E test questionnaire', tags: ['e2e'] },
  });
  return res;
}

async function deleteQuestionnaire(request: APIRequestContext, token: string, id: string) {
  await request.delete(`${API_BASE}/admin/questionnaires/${id}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function getAdminToken(request: APIRequestContext): Promise<string | null> {
  const { login, password } = creds();
  if (!login || !password) return null;
  const res = await request.post(`${API_BASE}/auth/login/`, {
    data: { email: login, password },
  });
  const body = await res.json();
  return body?.access ?? null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Admin Dashboard — Questionnaires tab', () => {
  test('questionnaires tab is visible in the admin dashboard', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsAdmin(page);
    await page.goto('/admin');
    await expect(page.getByRole('tab', { name: /questionnaires/i })).toBeVisible();
  });

  test('questionnaires tab shows a table after clicking it', async ({ page }) => {
    skipUnlessSeeded();
    await loginAsAdmin(page);
    await page.goto('/admin');

    await page.getByRole('tab', { name: /questionnaires/i }).click();

    // Either the table header or the "no questionnaires" empty state should be visible
    const tableOrEmpty = page.locator(
      'table thead th:has-text("Key"), p:has-text("No questionnaires")'
    );
    await expect(tableOrEmpty.first()).toBeVisible({ timeout: 10_000 });
  });

  test('can search questionnaires by title', async ({ page, request }) => {
    skipUnlessSeeded();

    const token = await getAdminToken(request);
    if (!token) return;

    const uniqueKey = `e2e-q-${Date.now()}`;
    const uniqueTitle = `E2E Questionnaire ${Date.now()}`;
    const createRes = await createQuestionnaire(request, token, uniqueKey, uniqueTitle);
    const created = await createRes.json();
    const qId = created?._id ?? created?.questionnaire?._id;

    try {
      await loginAsAdmin(page);
      await page.goto('/admin');
      await page.getByRole('tab', { name: /questionnaires/i }).click();

      await page.waitForSelector('table', { timeout: 10_000 });

      // Search for the questionnaire
      await page.getByPlaceholder(/search by title, key or tag/i).fill(uniqueTitle);
      await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 5_000 });

      // Search for something that doesn't exist
      await page.getByPlaceholder(/search by title, key or tag/i).fill('zzz-nonexistent-zzz');
      await expect(page.getByText(/no questionnaires found/i)).toBeVisible({ timeout: 5_000 });
    } finally {
      if (qId) await deleteQuestionnaire(request, token, qId);
    }
  });

  test('can open and cancel edit modal', async ({ page, request }) => {
    skipUnlessSeeded();

    const token = await getAdminToken(request);
    if (!token) return;

    const uniqueKey = `e2e-edit-${Date.now()}`;
    const uniqueTitle = `E2E Edit ${Date.now()}`;
    const createRes = await createQuestionnaire(request, token, uniqueKey, uniqueTitle);
    const created = await createRes.json();
    const qId = created?._id ?? created?.questionnaire?._id;

    try {
      await loginAsAdmin(page);
      await page.goto('/admin');
      await page.getByRole('tab', { name: /questionnaires/i }).click();

      await page.waitForSelector('table', { timeout: 10_000 });
      await page.getByPlaceholder(/search by title, key or tag/i).fill(uniqueTitle);

      // Click Edit button in the row
      const row = page.locator('tr', { hasText: uniqueTitle });
      await row.getByRole('button', { name: /edit/i }).click();

      // Modal should open with the questionnaire title pre-filled
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible();
      await expect(modal.locator('input[type="text"]').first()).toHaveValue(uniqueTitle);

      // Cancel closes the modal
      await modal.getByRole('button', { name: /cancel/i }).click();
      await expect(modal).not.toBeVisible({ timeout: 3_000 });
    } finally {
      if (qId) await deleteQuestionnaire(request, token, qId);
    }
  });

  test('can delete a questionnaire via the admin UI', async ({ page, request }) => {
    skipUnlessSeeded();

    const token = await getAdminToken(request);
    if (!token) return;

    const uniqueKey = `e2e-del-${Date.now()}`;
    const uniqueTitle = `E2E Delete ${Date.now()}`;
    await createQuestionnaire(request, token, uniqueKey, uniqueTitle);

    await loginAsAdmin(page);
    await page.goto('/admin');
    await page.getByRole('tab', { name: /questionnaires/i }).click();

    await page.waitForSelector('table', { timeout: 10_000 });
    await page.getByPlaceholder(/search by title, key or tag/i).fill(uniqueTitle);

    const row = page.locator('tr', { hasText: uniqueTitle });
    await expect(row).toBeVisible({ timeout: 5_000 });

    // Click Delete → confirm dialog → confirm delete
    await row.getByRole('button', { name: /delete/i }).click();

    const confirmDialog = page.locator('[role="dialog"]');
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: /delete/i }).last().click();

    // After deletion, the row should disappear
    await expect(row).not.toBeVisible({ timeout: 8_000 });
  });
});
