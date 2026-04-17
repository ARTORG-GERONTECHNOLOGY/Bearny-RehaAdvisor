import { expect, test, type APIRequestContext } from '@playwright/test';

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
    'Missing E2E therapist/patient credentials — skipping seeded API E2E tests'
  );
}

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function login(
  request: APIRequestContext,
  username: string,
  password: string
): Promise<{ token: string | null; id: string | null; require2fa: boolean; status: number }> {
  const res = await request.post(`${API_BASE}/auth/login/`, {
    data: { username, password },
  });

  if (!res.ok()) {
    return {
      token: null,
      id: null,
      require2fa: false,
      status: res.status(),
    };
  }

  const body = (await res.json()) as {
    access_token?: string;
    id?: string;
    require_2fa?: boolean;
  };

  return {
    token: body.access_token ?? null,
    id: body.id ?? null,
    require2fa: Boolean(body.require_2fa),
    status: res.status(),
  };
}

test.describe('Patient assigned questionnaires — API e2e', () => {
  test('patient receives assigned questionnaire questions and can submit answers', async ({
    request,
  }) => {
    skipUnlessSeeded(test);

    const { therapistLogin, therapistPassword, patientLogin, patientPassword, patientIdHint } =
      envs();

    const therapist = await login(request, therapistLogin as string, therapistPassword as string);
    test.skip(
      therapist.status === 401 || therapist.status === 403,
      'Seeded therapist credentials are invalid/unauthorized in this environment.'
    );
    test.skip(
      !therapist.token,
      'Therapist login requires 2FA or did not issue a token in this environment.'
    );

    const patient = await login(request, patientLogin as string, patientPassword as string);
    test.skip(
      patient.status === 401 || patient.status === 403,
      'Seeded patient credentials are invalid/unauthorized in this environment.'
    );
    test.skip(!patient.token || !patient.id, 'Patient login did not return access_token/id.');

    const patientIdForAssign = patientIdHint || patient.id;

    const groupsRes = await request.get(
      `${API_BASE}/questionnaires/dynamic/?subject=Healthstatus`,
      {
        headers: { Authorization: `Bearer ${therapist.token}` },
      }
    );
    expect(
      groupsRes.ok(),
      `Could not load dynamic questionnaires: ${await groupsRes.text()}`
    ).toBeTruthy();

    const groups = (await groupsRes.json()) as Array<{ id: string }>;
    test.skip(
      !Array.isArray(groups) || groups.length === 0,
      'No dynamic Healthstatus groups available.'
    );

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
      const questionsRes = await request.get(
        `${API_BASE}/patients/get-questions/Healthstatus/${patient.id}/`,
        {
          headers: { Authorization: `Bearer ${patient.token}` },
        }
      );
      expect(
        questionsRes.ok(),
        `Healthstatus fetch failed: ${await questionsRes.text()}`
      ).toBeTruthy();

      const questionsBody = (await questionsRes.json()) as {
        questions?: Array<{
          questionKey: string;
          possibleAnswers?: Array<{ key: string }>;
        }>;
      };

      const questions = Array.isArray(questionsBody.questions) ? questionsBody.questions : [];
      expect(questions.length).toBeGreaterThan(0);
      expect(questions.some((q) => q.questionKey.startsWith(`${groupKey}_`))).toBeTruthy();

      const firstQuestion = questions[0];
      const answerValue =
        Array.isArray(firstQuestion.possibleAnswers) && firstQuestion.possibleAnswers.length > 0
          ? firstQuestion.possibleAnswers[0].key
          : '1';

      const submitRes = await request.post(`${API_BASE}/patients/feedback/questionaire/`, {
        headers: { Authorization: `Bearer ${patient.token}` },
        form: {
          userId: patient.id,
          [firstQuestion.questionKey]: answerValue,
          date: isoDateOffset(0),
        },
      });

      expect(submitRes.ok(), `Submit failed: ${await submitRes.text()}`).toBeTruthy();
      const submitBody = (await submitRes.json()) as { message?: string };
      expect(submitBody.message || '').toContain('Feedback submitted successfully');
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
