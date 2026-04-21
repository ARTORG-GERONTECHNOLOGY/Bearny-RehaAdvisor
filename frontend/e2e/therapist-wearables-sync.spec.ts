import { expect, test } from '@playwright/test';

import { loginAsTherapist } from './helpers/auth';

function envs() {
  return {
    therapistLogin: process.env.E2E_THERAPIST_LOGIN,
    therapistPassword: process.env.E2E_THERAPIST_PASSWORD,
    emailDir: process.env.E2E_EMAIL_DIR,
  };
}

function skipUnlessSeeded(t: typeof test) {
  const { therapistLogin, therapistPassword, emailDir } = envs();
  t.skip(
    !therapistLogin || !therapistPassword || !emailDir,
    'Missing E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD / E2E_EMAIL_DIR — skipping seeded E2E tests'
  );
}

async function mockPatientPopupPrereqs(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.route('**/users/*/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        _id: '680000000000000000000001',
        first_name: 'E2E',
        name: 'Patient',
        patient_code: 'P-E2E-001',
        redcap_project: 'COMPASS',
        redcap_identifier: 'P-E2E-001',
      }),
    });
  });

  await page.route('**/redcap/patient/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        matches: [
          {
            project: 'COMPASS',
            rows: [{ record_id: '99', pat_id: 'P-E2E-001' }],
          },
        ],
      }),
    });
  });

  await page.route('**/patients/*/thresholds/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        thresholds: {
          steps_goal: 10000,
          active_minutes_green: 30,
          active_minutes_yellow: 20,
          sleep_green_min: 420,
          sleep_yellow_min: 360,
          bp_sys_green_max: 129,
          bp_sys_yellow_max: 139,
          bp_dia_green_max: 84,
          bp_dia_yellow_max: 89,
        },
        thresholds_history: [],
      }),
    });
  });
}

async function openPatientPopup(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.goto('/therapist');

  const infoBtn = page.getByRole('button', { name: /info/i }).first();
  await expect(infoBtn).toBeVisible({ timeout: 15000 });
  await infoBtn.click();

  await expect(page.getByRole('button', { name: /sync wearables/i })).toBeVisible({
    timeout: 10000,
  });
}

test.describe('Therapist patient popup wearables sync', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessSeeded(test);
    await loginAsTherapist(page);
    await mockPatientPopupPrereqs(page);
  });

  test('shows per-period sync results and payload details when sync succeeds', async ({ page }) => {
    skipUnlessSeeded(test);

    await page.route('**/wearables/sync-to-redcap/*/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          results: {
            baseline: 'ok',
            followup: 'skipped',
          },
          sent_payloads: {
            baseline: {
              status: 'sent',
              record: {
                record_id: '99',
                monitoring_start: '03-01-2024',
                monitoring_end: '09-01-2024',
                monitoring_days: '7',
                fitbit_steps: '6843',
                redcap_event_name: 'visit_baseline_arm_1',
                wearables_complete: '1',
              },
            },
            followup: {
              status: 'skipped',
              reason: 'no_fitbit_data_in_period',
            },
          },
        }),
      });
    });

    await openPatientPopup(page);

    const syncReq = page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().includes('/wearables/sync-to-redcap/')
    );

    await page.getByRole('button', { name: /sync wearables/i }).click();

    await syncReq;

    const successAlert = page
      .locator('.alert-success')
      .filter({ hasText: /wearables synced to redcap/i });
    await expect(successAlert).toBeVisible({ timeout: 10000 });
    await expect(successAlert.getByText(/baseline/i)).toBeVisible();
    await expect(successAlert.getByText(/followup/i)).toBeVisible();
    await expect(successAlert.getByText(/no_fitbit_data_in_period/i)).toBeVisible();

    await expect(successAlert.getByText('record_id')).toBeVisible();
    await expect(successAlert.getByText('99')).toBeVisible();
    await expect(successAlert.getByText('redcap_event_name')).toBeVisible();
    await expect(successAlert.getByText('visit_baseline_arm_1')).toBeVisible();
    await expect(successAlert.getByText('wearables_complete')).toBeVisible();
  });

  test('shows backend error reason when sync fails', async ({ page }) => {
    skipUnlessSeeded(test);

    await page.route('**/wearables/sync-to-redcap/*/', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'No REDCap record found for patient_code=P-E2E-001 in project=COMPASS',
        }),
      });
    });

    await openPatientPopup(page);

    await page.getByRole('button', { name: /sync wearables/i }).click();

    const errorAlert = page.locator('.alert').filter({ hasText: /no redcap record found/i });
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
    await expect(errorAlert).toContainText('project=COMPASS');
  });
});
