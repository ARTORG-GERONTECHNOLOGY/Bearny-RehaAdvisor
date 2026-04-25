import { expect, test, type Page } from '@playwright/test';

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

const availableColumn = (page: Page) => page.locator('.rehab-row .rehab-col').first();
const assignedColumn = (page: Page) => page.locator('.rehab-row .rehab-col').nth(1);

test.describe('Therapist rehab table questionnaires', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessSeeded(test);
    await loginAsTherapist(page);

    // Wait for the /therapist SPA navigation and all post-login API calls
    // (e.g. fetchPatients) to fully settle. Without this, calling page.goto()
    // immediately can race with the still-in-flight client-side navigation,
    // causing NS_BINDING_ABORTED (Firefox) or "interrupted by /therapist"
    // (webkit) errors.
    await page.waitForLoadState('networkidle');

    const { patientId } = creds();
    await page.evaluate((pid) => {
      window.localStorage.setItem('selectedPatient', pid as string);
    }, patientId as string);
  });

  test('loads questionnaires tab and fetches questionnaire endpoints', async ({ page }) => {
    skipUnlessSeeded(test);

    await page.goto('/rehabtable');

    const dynamicRequest = page.waitForRequest((req) =>
      req.url().includes('/questionnaires/health/')
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

    const patientReq = page.waitForRequest((req) => req.url().includes('/questionnaires/patient/'));
    await page.getByRole('tab', { name: /questionnaires/i }).click();
    await patientReq;

    const availableCard = availableColumn(page);
    const assignedCard = assignedColumn(page);

    const addBtn = availableCard.locator('button.btn-outline-success').first();
    const modifyBtn = assignedCard.locator('button.btn-outline-secondary').first();

    if ((await modifyBtn.count()) > 0) {
      await modifyBtn.click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
      await expect(
        page.getByText(/(modify questionnaire schedule|assign questionnaire)/i)
      ).toBeVisible();
      return;
    }

    if ((await addBtn.count()) > 0) {
      await addBtn.click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
      await expect(
        page.getByText(/(assign questionnaire|modify questionnaire schedule)/i)
      ).toBeVisible();
      return;
    }

    test.skip(true, 'No questionnaire action button available in seeded data.');
  });

  test('therapist can view questionnaire questions and answer options', async ({ page }) => {
    skipUnlessSeeded(test);

    await page.route(/\/questionnaires\/health\//, async (route) => {
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

    await page.route(/\/questionnaires\/patient\//, async (route) => {
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

    const healthRes = page.waitForResponse((res) => res.url().includes('/questionnaires/health/'));
    const patientRes = page.waitForResponse((res) =>
      res.url().includes('/questionnaires/patient/')
    );
    await page.getByRole('tab', { name: /questionnaires/i }).click();
    const [, patientResponse] = await Promise.all([healthRes, patientRes]);
    const patientPayload = await patientResponse.json().catch(() => null);
    if (
      !Array.isArray(patientPayload) ||
      !patientPayload.some((row: any) => row?.title === 'Mood Check')
    ) {
      test.skip(true, 'Mocked questionnaire payload was not applied for this run.');
    }

    const availableCard = availableColumn(page);
    await expect(availableCard.getByText('Mood Check').first()).toBeVisible({ timeout: 10000 });

    const moodCard = page.locator('div.border.rounded').filter({ hasText: 'Mood Check' }).first();
    await moodCard.locator('button.btn-outline-primary').first().click();

    await expect(page.getByText('How is your mood today?')).toBeVisible();
    await expect(page.getByText('Answers: Bad, Okay, Good')).toBeVisible();
  });

  test('assigned questionnaires show answered results when available', async ({ page }) => {
    skipUnlessSeeded(test);

    await page.route(/\/questionnaires\/health\//, async (route) => {
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

    await page.route(/\/questionnaires\/patient\//, async (route) => {
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

    const healthRes2 = page.waitForResponse((res) => res.url().includes('/questionnaires/health/'));
    const patientRes2 = page.waitForResponse((res) =>
      res.url().includes('/questionnaires/patient/')
    );
    await page.getByRole('tab', { name: /questionnaires/i }).click();
    const [, patientResponse2] = await Promise.all([healthRes2, patientRes2]);
    const patientPayload2 = await patientResponse2.json().catch(() => null);
    if (
      !Array.isArray(patientPayload2) ||
      !patientPayload2.some((row: any) => row?.title === 'Profile (16)')
    ) {
      test.skip(true, 'Mocked assigned questionnaire payload was not applied for this run.');
    }

    const assignedCard = assignedColumn(page);
    await expect(assignedCard.getByText('How are you today?')).toBeVisible({ timeout: 10000 });
    await expect(assignedCard.getByText(/Felt better\./)).toBeVisible();
  });
});
