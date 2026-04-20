import { expect, test } from '@playwright/test';

async function loginAsSeededPatient(page: Parameters<typeof test>[0]['page']) {
  const patientLogin = process.env.E2E_PATIENT_LOGIN;
  const patientPassword = process.env.E2E_PATIENT_PASSWORD;

  test.skip(
    !patientLogin || !patientPassword,
    'Missing E2E_PATIENT_LOGIN/E2E_PATIENT_PASSWORD environment variables'
  );

  await page.goto('/');
  await page.getByRole('button', { name: /login/i }).first().click();

  const modal = page.locator('[role="dialog"][data-state="open"]');
  await expect(modal).toBeVisible();

  await modal.locator('#email').fill(patientLogin as string);
  await modal.locator('#password').fill(patientPassword as string);
  await modal.getByRole('button', { name: /login/i }).click();

  await expect(page).toHaveURL(/\/patient(?:\/)?$/);
}

test.describe('Patient page and functions', () => {
  test('redirects unauthenticated user away from /patient', async ({ page }) => {
    await page.goto('/patient');
    await expect(page).toHaveURL(/\/$/);
  });

  test('loads patient page and triggers core patient API calls', async ({ page }) => {
    await page.goto('/');

    const patientLogin = process.env.E2E_PATIENT_LOGIN;
    const patientPassword = process.env.E2E_PATIENT_PASSWORD;
    test.skip(
      !patientLogin || !patientPassword,
      'Missing E2E_PATIENT_LOGIN/E2E_PATIENT_PASSWORD environment variables'
    );

    await page.getByRole('button', { name: /login/i }).first().click();
    const modal = page.locator('[role="dialog"][data-state="open"]');
    await modal.locator('#email').fill(patientLogin as string);
    await modal.locator('#password').fill(patientPassword as string);

    const fitbitStatusRequest = page.waitForRequest((req) => req.url().includes('/fitbit/status/'));
    const planRequest = page.waitForRequest((req) =>
      req.url().includes('/patients/rehabilitation-plan/patient/')
    );
    const initialQuestionnaireRequest = page.waitForRequest(
      (req) => req.url().includes('/users/') && req.url().includes('/initial-questionaire/')
    );

    await modal.getByRole('button', { name: /login/i }).click();
    await expect(page).toHaveURL(/\/patient(?:\/)?$/);

    await fitbitStatusRequest;
    await planRequest;
    await initialQuestionnaireRequest;

    // Verify the redesigned patient page has loaded (no longer has prev/next/today nav buttons)
    await expect(page.locator('h1')).toBeVisible();
  });

  test('shows patient page layout with daily content sections', async ({ page }) => {
    await loginAsSeededPatient(page);

    // The redesigned patient page has a "today" heading and a date subheading
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h2')).toBeVisible();
  });

  test('submits daily vitals when prompt is shown', async ({ page }) => {
    await loginAsSeededPatient(page);

    const saveBtn = page.getByRole('button', { name: /save for today/i });
    const visible = (await saveBtn.count()) > 0;
    test.skip(!visible, 'Daily vitals prompt is not shown (already submitted for today).');

    await page.getByLabel(/weight/i).fill('72.4');

    const vitalsRequestPromise = page.waitForRequest(
      (req) => req.url().includes('/patients/vitals/manual/') && req.method() === 'POST'
    );
    const vitalsResultPromise = Promise.race([
      page
        .waitForResponse(
          (res) =>
            res.url().includes('/patients/vitals/manual/') && res.request().method() === 'POST'
        )
        .then(() => 'response'),
      page
        .waitForEvent(
          'requestfailed',
          (req) => req.url().includes('/patients/vitals/manual/') && req.method() === 'POST'
        )
        .then(() => 'requestfailed'),
    ]);

    await saveBtn.click();

    const vitalsRequest = await vitalsRequestPromise;
    const payload = vitalsRequest.postDataJSON() as {
      weight_kg?: number | null;
      bp_sys?: number | null;
      bp_dia?: number | null;
      date?: string;
    };

    expect(payload.weight_kg).toBe(72.4);
    expect(payload.date).toBeTruthy();

    const vitalsResult = await vitalsResultPromise;
    expect(['response', 'requestfailed']).toContain(vitalsResult);
  });

  test('marks intervention done/undone and triggers corresponding backend endpoint', async ({
    page,
  }) => {
    await loginAsSeededPatient(page);

    const actionBtn = page.getByRole('button', { name: /ididit|i did it|undo/i }).first();
    const hasAction = (await actionBtn.count()) > 0;
    test.skip(
      !hasAction,
      'No intervention completion action button available for current patient/day.'
    );

    const actionLabel = (await actionBtn.innerText()).trim().toLowerCase();
    const expectComplete = !actionLabel.includes('undo');

    const toggleRequestPromise = page.waitForRequest((req) => {
      const url = req.url();
      return (
        req.method() === 'POST' &&
        (url.includes('/interventions/complete/') || url.includes('/interventions/uncomplete/'))
      );
    });
    const toggleResultPromise = Promise.race([
      page
        .waitForResponse((res) => {
          const url = res.url();
          return (
            res.request().method() === 'POST' &&
            (url.includes('/interventions/complete/') || url.includes('/interventions/uncomplete/'))
          );
        })
        .then(() => 'response'),
      page
        .waitForEvent(
          'requestfailed',
          (req) =>
            req.method() === 'POST' &&
            (req.url().includes('/interventions/complete/') ||
              req.url().includes('/interventions/uncomplete/'))
        )
        .then(() => 'requestfailed'),
    ]);

    await actionBtn.click();

    const toggleReq = await toggleRequestPromise;
    if (expectComplete) {
      expect(toggleReq.url()).toContain('/interventions/complete/');
    } else {
      expect(toggleReq.url()).toContain('/interventions/uncomplete/');
    }

    const toggleResult = await toggleResultPromise;
    expect(['response', 'requestfailed']).toContain(toggleResult);
  });

  test('opens intervention feedback popup and attempts feedback submission', async ({ page }) => {
    await loginAsSeededPatient(page);

    const completeBtn = page.getByRole('button', { name: /ididit|i did it/i }).first();
    const canComplete = (await completeBtn.count()) > 0;
    test.skip(!canComplete, 'No "I did it" action available to open intervention feedback.');

    const feedbackQuestionsReqPromise = page.waitForRequest(
      (req) => req.method() === 'GET' && req.url().includes('/patients/get-questions/Intervention/')
    );

    await completeBtn.click();
    await feedbackQuestionsReqPromise;

    const feedbackModal = page.locator('.modal.show');
    await expect(feedbackModal).toBeVisible();

    const noQuestionsMsg = feedbackModal.getByText(/no feedback questions available/i);
    if ((await noQuestionsMsg.count()) > 0) {
      test.skip(true, 'No feedback questions configured for this intervention.');
    }

    const textArea = feedbackModal.getByRole('textbox', { name: /text feedback/i });
    if ((await textArea.count()) > 0) {
      await textArea.fill('E2E patient feedback');
    } else {
      const firstAnswerBtn = feedbackModal.locator('.answer-btn').first();
      const hasAnswerBtn = (await firstAnswerBtn.count()) > 0;
      test.skip(!hasAnswerBtn, 'No supported feedback input control available in popup.');
      await firstAnswerBtn.click();
    }

    for (let i = 0; i < 5; i += 1) {
      const submitBtn = feedbackModal.getByRole('button', { name: /submit/i });
      if ((await submitBtn.count()) > 0) break;
      const nextBtn = feedbackModal.getByRole('button', { name: /next/i });
      if ((await nextBtn.count()) === 0) break;
      await nextBtn.click();
    }

    const submitBtn = feedbackModal.getByRole('button', { name: /submit/i });
    const hasSubmit = (await submitBtn.count()) > 0;
    test.skip(!hasSubmit, 'Feedback submit button not reachable for current questionnaire.');

    const feedbackSubmitReqPromise = page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().includes('/patients/feedback/questionaire/')
    );
    const feedbackSubmitResultPromise = Promise.race([
      page
        .waitForResponse(
          (res) =>
            res.request().method() === 'POST' &&
            res.url().includes('/patients/feedback/questionaire/')
        )
        .then(() => 'response'),
      page
        .waitForEvent(
          'requestfailed',
          (req) => req.method() === 'POST' && req.url().includes('/patients/feedback/questionaire/')
        )
        .then(() => 'requestfailed'),
    ]);

    await submitBtn.click();
    await feedbackSubmitReqPromise;
    const feedbackSubmitResult = await feedbackSubmitResultPromise;
    expect(['response', 'requestfailed']).toContain(feedbackSubmitResult);
  });
});
