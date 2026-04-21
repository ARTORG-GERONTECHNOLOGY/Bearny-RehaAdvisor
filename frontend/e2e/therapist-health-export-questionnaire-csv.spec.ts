import { expect, test, type Page } from '@playwright/test';

import { loginAsTherapist } from './helpers/auth';
import { readFile } from 'node:fs/promises';

function creds() {
  return {
    login: process.env.E2E_THERAPIST_LOGIN,
    password: process.env.E2E_THERAPIST_PASSWORD,
    patientId: process.env.E2E_PATIENT_ID,
  };
}

function skipUnlessSeeded(t: typeof test) {
  const { login, password, patientId } = creds();
  t.skip(
    !login || !password || !patientId,
    'Missing E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD / E2E_PATIENT_ID — skipping seeded E2E tests'
  );
}

test.describe('Therapist health CSV export', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessSeeded(test);
    await loginAsTherapist(page);

    const { patientId } = creds();
    await page.evaluate((pid) => {
      window.localStorage.setItem('selectedPatient', pid as string);
      window.localStorage.setItem('selectedPatientName', 'CSV Export Patient');
    }, patientId as string);
  });

  test('exports questionnaire CSV rows with question text, multi-answers, comments, and media URLs', async ({
    page,
  }) => {
    skipUnlessSeeded(test);

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
        }),
      });
    });

    await page.route('**/patients/health-combined-history/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fitbit: [],
          adherence: [],
          questionnaire: [
            {
              date: '2026-04-10',
              questionKey: '16_profile_mood_1',
              questionTranslations: [{ language: 'en', text: 'How is your mood today?' }],
              answers: [
                { key: '1', translations: [{ language: 'en', text: 'Bad' }] },
                { key: '3', translations: [{ language: 'en', text: 'Good' }] },
              ],
              comment: 'Patient noted mild fatigue in afternoon.',
              media_urls: ['https://files.example/audio1.m4a', 'https://files.example/video1.webm'],
            },
          ],
        }),
      });
    });

    await page.goto('/health');
    await expect(page.getByText(/questionnaire results by date/i)).toBeVisible();

    await page.getByRole('button', { name: /export/i }).click();
    await expect(page.getByRole('button', { name: /export csv/i })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /export csv/i }).click(),
    ]);

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const csv = await readFile(downloadPath as string, 'utf8');
    expect(csv).toContain('Question Key;Question Text;Answer Keys;Answer Texts;Comment;Media URLs');
    expect(csv).toContain('16_profile_mood_1');
    expect(csv).toContain('How is your mood today?');
    expect(csv).toContain('1 | 3');
    expect(csv).toContain('Bad | Good');
    expect(csv).toContain('Patient noted mild fatigue in afternoon.');
    expect(csv).toContain('https://files.example/audio1.m4a | https://files.example/video1.webm');
  });
});
