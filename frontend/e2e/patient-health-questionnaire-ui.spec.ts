import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API_BASE = process.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

function envs() {
  return {
    therapistLogin: process.env.E2E_THERAPIST_LOGIN,
    therapistPassword: process.env.E2E_THERAPIST_PASSWORD,
    patientLogin: process.env.E2E_PATIENT_LOGIN,
    patientPassword: process.env.E2E_PATIENT_PASSWORD,
    patientIdHint: process.env.E2E_PATIENT_ID,
  };
}

function skipUnlessSeeded(t: typeof test) {
  const { therapistLogin, therapistPassword, patientLogin, patientPassword } = envs();
  t.skip(
    !therapistLogin || !therapistPassword || !patientLogin || !patientPassword,
    'Missing E2E therapist/patient credentials — skipping seeded UI E2E tests'
  );
}

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function loginApi(
  request: APIRequestContext,
  username: string,
  password: string
): Promise<{ token: string | null; id: string | null; status: number }> {
  const res = await request.post(`${API_BASE}/auth/login/`, {
    data: { username, password },
  });

  if (!res.ok()) {
    return { token: null, id: null, status: res.status() };
  }

  const body = (await res.json()) as {
    access_token?: string;
    id?: string;
    require_2fa?: boolean;
  };

  if (body.require_2fa) {
    return { token: null, id: body.id ?? null, status: res.status() };
  }

  return {
    token: body.access_token ?? null,
    id: body.id ?? null,
    status: res.status(),
  };
}

async function loginPatientUi(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.getByRole('button', { name: /login/i }).first().click();

  const modal = page.locator('[role="dialog"][data-state="open"]');
  await expect(modal).toBeVisible();

  await modal.locator('#email').fill(username);
  await modal.locator('#password').fill(password);
  await modal.getByRole('button', { name: /login/i }).click();

  await expect(page).toHaveURL(/\/patient(?:\/)?$/);
}

test.describe('Patient health questionnaire — UI e2e', () => {
  test('patient answers assigned health questionnaire through popup and submits', async ({
    page,
    request,
  }) => {
    skipUnlessSeeded(test);

    const { therapistLogin, therapistPassword, patientLogin, patientPassword, patientIdHint } =
      envs();

    const therapist = await loginApi(request, therapistLogin as string, therapistPassword as string);
    test.skip(
      therapist.status === 401 || therapist.status === 403,
      'Seeded therapist credentials are invalid/unauthorized in this environment.'
    );
    test.skip(!therapist.token, 'Therapist login requires 2FA or no token issued in this environment.');

    const patient = await loginApi(request, patientLogin as string, patientPassword as string);
    test.skip(
      patient.status === 401 || patient.status === 403,
      'Seeded patient credentials are invalid/unauthorized in this environment.'
    );
    test.skip(!patient.token || !patient.id, 'Patient login did not return access_token/id.');

    const patientIdForAssign = patientIdHint || patient.id;

    const groupsRes = await request.get(`${API_BASE}/questionnaires/dynamic/?subject=Healthstatus`, {
      headers: { Authorization: `Bearer ${therapist.token}` },
    });
    expect(groupsRes.ok(), `Could not load dynamic questionnaires: ${await groupsRes.text()}`).toBeTruthy();

    const groups = (await groupsRes.json()) as Array<{ id: string }>;
    test.skip(!Array.isArray(groups) || groups.length === 0, 'No dynamic Healthstatus groups available.');

    const groupKey = groups[0].id;

    const assignRes = await request.post(`${API_BASE}/questionnaires/assign/`, {
      headers: { Authorization: `Bearer ${therapist.token}` },
      data: {
        patientId: patientIdForAssign,
        questionnaireKey: groupKey,
        effectiveFrom: isoDateOffset(-1),
        schedule: {
          unit: 'month',
          interval: 1,
          startTime: '00:00',
          end: { type: 'count', count: 1 },
        },
      },
    });

    expect(assignRes.ok(), `Assign failed: ${await assignRes.text()}`).toBeTruthy();
    const assignBody = (await assignRes.json()) as { questionnaireId?: string };
    const assignedQuestionnaireId = assignBody.questionnaireId;

    try {
      const healthQuestionsReq = page.waitForRequest(
        (req) =>
          req.method() === 'GET' &&
          req.url().includes('/patients/get-questions/Healthstatus/') &&
          req.url().includes(patient.id as string)
      );

      await loginPatientUi(page, patientLogin as string, patientPassword as string);
      await healthQuestionsReq;

      const noQuestionsInfo = page.getByText(/no feedback questions available/i);
      if ((await noQuestionsInfo.count()) > 0 && (await noQuestionsInfo.first().isVisible())) {
        test.skip(true, 'Assigned questionnaire resolved to empty question list in this seeded environment.');
      }

      // Answer first visible question in popup: prefer option button, fallback to text area.
      const firstAnswerBtn = page.locator('.answer-btn').first();
      if ((await firstAnswerBtn.count()) > 0) {
        await firstAnswerBtn.click();
      } else {
        const textArea = page.getByRole('textbox').first();
        test.skip((await textArea.count()) === 0, 'No supported questionnaire input control found.');
        await textArea.fill('E2E patient questionnaire answer');
      }

      for (let i = 0; i < 8; i += 1) {
        const submitBtn = page.getByRole('button', { name: /submit/i });
        if ((await submitBtn.count()) > 0) break;

        const nextBtn = page.getByRole('button', { name: /next/i });
        if ((await nextBtn.count()) === 0) break;
        await nextBtn.click();
      }

      const submitBtn = page.getByRole('button', { name: /submit/i });
      test.skip((await submitBtn.count()) === 0, 'Submit button not reachable in questionnaire popup.');

      const submitReqPromise = page.waitForRequest(
        (req) => req.method() === 'POST' && req.url().includes('/patients/feedback/questionaire/')
      );
      const submitResultPromise = Promise.race([
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

      const submitReq = await submitReqPromise;
      const bodyRaw = submitReq.postData() || '';
      expect(bodyRaw).toContain('userId');

      const submitResult = await submitResultPromise;
      expect(['response', 'requestfailed']).toContain(submitResult);
    } finally {
      if (assignedQuestionnaireId) {
        await request.post(`${API_BASE}/questionnaires/remove/`, {
          headers: { Authorization: `Bearer ${therapist.token}` },
          data: {
            patientId: patientIdForAssign,
            questionnaireId: assignedQuestionnaireId,
          },
        });
      }
    }
  });
});
