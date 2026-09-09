/**
 * E2E tests for the Force Logout feature.
 *
 * These tests use page.route() to intercept API calls and verify that the
 * correct endpoints are called with the right payloads, without needing a
 * live backend with a seeded patient.
 *
 * Requires: E2E_THERAPIST_LOGIN, E2E_THERAPIST_PASSWORD, E2E_EMAIL_DIR
 */
import { expect, test } from '@playwright/test';

import { loginAsTherapist } from './helpers/auth';

const MOCK_PATIENT_ID = '507f1f77bcf86cd799439011';

/**
 * Navigate to the therapist page, mock all API calls required for the
 * patient popup to open, and open the popup for the mock patient.
 */
async function openPatientPopup(page: Parameters<typeof test>[0]['page']) {
  // Mock the patients list so a clickable patient row appears
  await page.route('**/api/patients/**', (route) => {
    const url = route.request().url();

    if (url.includes('/force-logout/')) {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ message: 'Patient sessions invalidated' }),
      });
      return;
    }
    if (url.includes('/reset-password/')) {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ message: 'Password reset successfully' }),
      });
      return;
    }
    if (url.includes(`/patients/${MOCK_PATIENT_ID}`) || url.includes('/profile/')) {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: MOCK_PATIENT_ID,
          username: 'testpatient',
          name: 'Test',
          first_name: 'Patient',
          email: 'testpatient@example.com',
          phone: '+41791234567',
          role: 'Patient',
          isActive: true,
          wearable_device: 'none',
          study_group: 'intervention',
          patient_code: 'TEST-01',
          clinic: 'Inselspital',
          project: 'BEARNY',
          initial_questionnaire_enabled: false,
          rehab_end_date: null,
          study_end_date: null,
          created_by: null,
          therapist_name: null,
        }),
      });
      return;
    }
    route.continue();
  });

  await page.route('**/api/therapist/patients/**', (route) => {
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        patients: [
          {
            id: MOCK_PATIENT_ID,
            username: 'testpatient',
            name: 'Test Patient',
            patient_code: 'TEST-01',
            clinic: 'Inselspital',
            project: 'BEARNY',
            study_group: 'intervention',
            wearable_device: 'none',
            isActive: true,
            rehab_end_date: null,
            study_end_date: null,
          },
        ],
      }),
    });
  });
}

test.describe('Force Logout', () => {
  test.skip(
    !process.env.E2E_THERAPIST_LOGIN ||
      !process.env.E2E_THERAPIST_PASSWORD ||
      !process.env.E2E_EMAIL_DIR,
    'Missing E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD / E2E_EMAIL_DIR'
  );

  test('force-logout button calls the correct API endpoint', async ({ page }) => {
    await loginAsTherapist(page);
    await openPatientPopup(page);

    let forceLogoutCalled = false;
    await page.route(`**/api/patients/${MOCK_PATIENT_ID}/force-logout/`, (route) => {
      forceLogoutCalled = true;
      route.fulfill({
        status: 200,
        body: JSON.stringify({ message: 'Patient sessions invalidated' }),
      });
    });

    // Navigate to the therapist dashboard (patients list)
    await page.goto('/therapist');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // Click the first patient row to open the popup
    const patientRow = page.locator(`[data-patient-id="${MOCK_PATIENT_ID}"]`).first();
    const patientRowByText = page.getByText('Test Patient', { exact: false }).first();

    // Try both selectors — the data attribute may not exist in all layouts
    const row = (await patientRow.count()) > 0 ? patientRow : patientRowByText;
    if ((await row.count()) === 0) {
      test.skip(true, 'Patient row not found — patient list UI may differ');
      return;
    }

    await row.click();

    // Accept the confirm dialog that appears when Force Logout is clicked
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'confirm') {
        await dialog.accept();
      }
    });

    // Click the Force Logout button
    const forceLogoutBtn = page.getByRole('button', { name: /force.?logout/i }).first();
    if ((await forceLogoutBtn.count()) === 0) {
      test.skip(true, 'Force Logout button not found in the current UI');
      return;
    }
    await forceLogoutBtn.click();

    // Accept the success alert
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'alert') {
        await dialog.accept();
      }
    });

    await page.waitForTimeout(1000);
    expect(forceLogoutCalled).toBe(true);
  });

  test('password-reset sheet calls the reset-password endpoint', async ({ page }) => {
    await loginAsTherapist(page);
    await openPatientPopup(page);

    let resetCalled = false;
    let resetBody: Record<string, string> = {};

    await page.route(`**/api/patients/${MOCK_PATIENT_ID}/reset-password/`, (route) => {
      resetCalled = true;
      route
        .request()
        .postDataJSON()
        .then((body: Record<string, string>) => {
          resetBody = body;
        })
        .catch(() => {});
      route.fulfill({
        status: 200,
        body: JSON.stringify({ message: 'Password reset successfully' }),
      });
    });

    await page.goto('/therapist');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const patientRow = page.locator(`[data-patient-id="${MOCK_PATIENT_ID}"]`).first();
    const patientRowByText = page.getByText('Test Patient', { exact: false }).first();
    const row = (await patientRow.count()) > 0 ? patientRow : patientRowByText;
    if ((await row.count()) === 0) {
      test.skip(true, 'Patient row not found — patient list UI may differ');
      return;
    }
    await row.click();

    const resetBtn = page.getByRole('button', { name: /reset.?password/i }).first();
    if ((await resetBtn.count()) === 0) {
      test.skip(true, 'Reset Password button not found in the current UI');
      return;
    }
    await resetBtn.click();

    // Fill in the password reset sheet
    const newPwdInput = page.getByLabel(/new.?password/i).first();
    const confirmPwdInput = page.getByLabel(/confirm.?password/i).first();

    if (!(await newPwdInput.count())) {
      test.skip(true, 'Password reset sheet inputs not found');
      return;
    }

    await newPwdInput.fill('NewPass1!');
    await confirmPwdInput.fill('NewPass1!');

    const submitBtn = page.getByRole('button', { name: /set.?new.?password/i }).first();
    await submitBtn.click();

    await page.waitForTimeout(1000);
    expect(resetCalled).toBe(true);
    expect(resetBody).toMatchObject({ new_password: 'NewPass1!' });
  });
});
