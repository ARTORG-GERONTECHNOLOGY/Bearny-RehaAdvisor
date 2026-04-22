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

test.describe('Therapist patient popup characteristics input', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessSeeded(test);
    await loginAsTherapist(page);
  });

  test('allows multi-word characteristics input and saves normalized comma-separated values', async ({
    page,
  }) => {
    skipUnlessSeeded(test);

    const patientId = '680000000000000000000001';
    const mockedPatients = [
      {
        _id: patientId,
        first_name: 'E2E',
        name: 'Patient',
        diagnosis: ['Stroke'],
        sex: 'Male',
        duration: 30,
        created_at: '2026-01-10T00:00:00.000Z',
      },
    ];

    let profile = {
      _id: patientId,
      first_name: 'E2E',
      name: 'Patient',
      email: 'e2e.patient@example.com',
      phone: '+41790000000',
      function: ['Cardiology'],
      diagnosis: ['Stroke'],
      lifestyle: [],
      personal_goals: [],
      social_support: [],
      restrictions: '',
    };

    await page.route('**/therapists/*/patients', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockedPatients),
      });
    });

    await page.route(`**/users/${patientId}/profile*`, async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(profile),
        });
        return;
      }

      if (req.method() === 'PUT') {
        const body = JSON.parse(req.postData() || '{}');
        profile = { ...profile, ...body };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Profile updated', updated: body }),
        });
        return;
      }

      await route.fulfill({ status: 405, body: 'Method not allowed' });
    });

    await page.route(`**/patients/${patientId}/thresholds/`, async (route) => {
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

    await page.goto('/therapist');

    const infoButton = page.getByRole('button', { name: /info/i }).first();
    await expect(infoButton).toBeVisible({ timeout: 15000 });
    await infoButton.click();

    await page.getByRole('button', { name: /edit/i }).click();
    await page.getByRole('tab', { name: /characteristics/i }).click();

    const lifestyleInput = page.locator('#lifestyle');
    await expect(lifestyleInput).toBeVisible();
    await lifestyleInput.fill('Very active person, Morning walk group');

    const saveRequest = page.waitForRequest(
      (req) => req.method() === 'PUT' && req.url().includes(`/users/${patientId}/profile`)
    );

    await page.getByRole('button', { name: /save changes/i }).click();

    const req = await saveRequest;
    const payload = JSON.parse(req.postData() || '{}');
    expect(payload.lifestyle).toEqual(['Very active person', 'Morning walk group']);

    await expect(page.getByRole('button', { name: /edit/i })).toBeVisible({ timeout: 10000 });
  });
});
