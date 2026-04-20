import { expect, test } from '@playwright/test';

import { loginAsTherapist } from './helpers/auth';

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


test.describe('Therapist rehab table questionnaires', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessSeeded(test);
    await loginAsTherapist(page);

    const { patientId } = creds();
    await page.evaluate((pid) => {
      window.localStorage.setItem('selectedPatient', pid as string);
    }, patientId as string);
  });

  test('loads questionnaires tab and fetches questionnaire endpoints', async ({ page }) => {
    skipUnlessSeeded(test);

    await page.goto('/rehabtable');

    const dynamicRequest = page.waitForRequest((req) =>
      req.url().includes('/questionnaires/dynamic?subject=Healthstatus')
    );
    const assignedRequest = page.waitForRequest((req) =>
      req.url().includes('/questionnaires/patient/')
    );

    await page.getByRole('tab', { name: /questionnaires/i }).click();

    await dynamicRequest;
    await assignedRequest;

    await expect(page.getByText(/available questionnaires/i)).toBeVisible();
    await expect(page.getByText(/assigned questionnaires/i)).toBeVisible();
  });

  test('opens questionnaire schedule modal from questionnaires tab actions', async ({ page }) => {
    skipUnlessSeeded(test);

    await page.goto('/rehabtable');
    await page.getByRole('tab', { name: /questionnaires/i }).click();

    await page.waitForRequest((req) => req.url().includes('/questionnaires/patient/'));

    const addBtn = page.locator('button.btn-outline-success').first();
    const modifyBtn = page.locator('button.btn-outline-secondary').first();

    if ((await addBtn.count()) > 0) {
      await addBtn.click();
      await expect(page.getByText(/assign questionnaire/i)).toBeVisible();
      return;
    }

    if ((await modifyBtn.count()) > 0) {
      await modifyBtn.click();
      await expect(page.getByText(/modify questionnaire schedule/i)).toBeVisible();
      return;
    }

    test.skip(true, 'No questionnaire action button available in seeded data.');
  });

  test('therapist can view questionnaire questions and answer options', async ({ page }) => {
    skipUnlessSeeded(test);

    await page.route('**/questionnaires/health/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            _id: 'q_mood',
            key: '16_profile_mood',
            title: 'Mood Check',
            description: '',
            question_count: 2,
            created_by_name: 'System',
            questions: [
              {
                questionKey: '16_profile_mood_1',
                answerType: 'select',
                translations: [{ language: 'en', text: 'How is your mood today?' }],
                possibleAnswers: [
                  { key: '1', translations: [{ language: 'en', text: 'Bad' }] },
                  { key: '2', translations: [{ language: 'en', text: 'Okay' }] },
                  { key: '3', translations: [{ language: 'en', text: 'Good' }] },
                ],
              },
              {
                questionKey: '16_profile_mood_2',
                answerType: 'text',
                translations: [{ language: 'en', text: 'Any additional notes?' }],
                possibleAnswers: [],
              },
            ],
          },
        ]),
      });
    });

    await page.route('**/questionnaires/patient/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            _id: 'q_mood',
            title: 'Mood Check',
            frequency: 'Monthly',
            dates: ['2026-04-20T08:00:00Z'],
            question_count: 2,
            questions: [
              {
                questionKey: '16_profile_mood_1',
                answerType: 'select',
                translations: [{ language: 'en', text: 'How is your mood today?' }],
                possibleAnswers: [
                  { key: '1', translations: [{ language: 'en', text: 'Bad' }] },
                  { key: '2', translations: [{ language: 'en', text: 'Okay' }] },
                ],
              },
            ],
          },
        ]),
      });
    });

    await page.goto('/rehabtable');
    await page.getByRole('tab', { name: /questionnaires/i }).click();

    await expect(page.getByText('Mood Check')).toBeVisible();

    const availableCard = page
      .locator('div.border.rounded')
      .filter({ hasText: 'Mood Check' })
      .first();
    await availableCard.locator('button.btn-outline-primary').first().click();

    await expect(page.getByText('How is your mood today?')).toBeVisible();
    await expect(page.getByText('Answers: Bad, Okay, Good')).toBeVisible();
  });

  test('assigned questionnaires show answered results when available', async ({ page }) => {
    skipUnlessSeeded(test);

    await page.route('**/questionnaires/health/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            _id: 'q_profile',
            key: '16_profile',
            title: 'Profile (16)',
            description: '',
            question_count: 1,
            created_by_name: 'System',
            questions: [],
          },
        ]),
      });
    });

    await page.route('**/questionnaires/patient/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            _id: 'q_profile',
            title: 'Profile (16)',
            frequency: 'Monthly',
            dates: ['2026-04-20T08:00:00Z'],
            question_count: 1,
            questions: [],
            answered_entries: [
              {
                questionKey: '16_profile_q1',
                questionTranslations: [{ language: 'en', text: 'How are you today?' }],
                answerType: 'select',
                answers: [{ key: '2', translations: [{ language: 'en', text: 'Good' }] }],
                comment: 'Felt better.',
                answered_at: '2026-04-19T12:00:00Z',
              },
            ],
          },
        ]),
      });
    });

    await page.goto('/rehabtable');
    await page.getByRole('tab', { name: /questionnaires/i }).click();

    await expect(page.getByText('Answered results')).toBeVisible();
    await expect(page.getByText('How are you today?')).toBeVisible();
    await expect(page.getByText(/Comment: Felt better\./)).toBeVisible();
  });
});
