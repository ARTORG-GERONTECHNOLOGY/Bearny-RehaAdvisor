/**
 * E2E tests — Template assign & apply (MongoEngine dirty-tracking regression)
 *
 * These tests exercise the full stack through real HTTP calls to the backend,
 * covering the bug where in-place dict mutations on MongoEngine EmbeddedDocument
 * fields were silently discarded by .save(), causing "0 interventions, 0 sessions"
 * when a template was applied after its schedule was updated.
 *
 * Two layers of coverage:
 *   1. API-level  — uses Playwright's `request` fixture, no browser needed.
 *   2. UI-level   — full browser flow through the Therapist Interventions page.
 *
 * Required environment variables (all tests skip gracefully when absent):
 *   E2E_THERAPIST_LOGIN    — therapist username / email
 *   E2E_THERAPIST_PASSWORD — therapist password
 *   E2E_PATIENT_ID         — ObjectId of an existing patient to apply the template to
 *
 * The API base URL is read from:
 *   VITE_API_URL  (default: http://127.0.0.1:8001/api)
 */

import { expect, test, type APIRequestContext } from '@playwright/test';

import { loginAsTherapist } from './helpers/auth';

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

const API_BASE = process.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

function creds() {
  return {
    login: process.env.E2E_THERAPIST_LOGIN,
    password: process.env.E2E_THERAPIST_PASSWORD,
    patientId: process.env.E2E_PATIENT_ID,
  };
}

function skipUnlessSeeded(t: typeof test) {
  const { login, password } = creds();
  t.skip(
    !login || !password,
    'Missing E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD — skipping seeded E2E tests'
  );
}

function skipUnlessPatient(t: typeof test) {
  const { login, password, patientId } = creds();
  t.skip(
    !login || !password || !patientId,
    'Missing E2E_THERAPIST_LOGIN / E2E_THERAPIST_PASSWORD / E2E_PATIENT_ID — skipping apply tests'
  );
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/** Obtain a JWT access token for the therapist. */
async function getToken(request: APIRequestContext): Promise<string> {
  const { login, password } = creds();
  const res = await request.post(`${API_BASE}/auth/login/`, {
    data: { username: login, password },
  });
  expect(res.ok(), `Login failed: ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return body.access_token as string;
}

/** Create a minimal template and return its id. */
async function createTemplate(request: APIRequestContext, token: string): Promise<string> {
  const res = await request.post(`${API_BASE}/templates/`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: `E2E Regression ${Date.now()}` },
  });
  expect(res.ok(), `Create template failed: ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return body.template._id as string;
}

/** Return the _id of the first intervention returned by /interventions/all/. */
async function getFirstInterventionId(
  request: APIRequestContext,
  token: string
): Promise<string | null> {
  const res = await request.get(`${API_BASE}/interventions/all/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return null;
  const body = await res.json();
  const list = Array.isArray(body) ? body : (body.data ?? body.results ?? []);
  if (!list.length) return null;
  return (list[0]._id ?? list[0].id) as string;
}

/** Assign an intervention to a template with a given end_day. */
async function assignIntervention(
  request: APIRequestContext,
  token: string,
  templateId: string,
  interventionId: string,
  endDay: number
) {
  const res = await request.post(`${API_BASE}/templates/${templateId}/interventions/`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { interventionId, end_day: endDay },
  });
  expect(res.ok(), `Assign failed: ${await res.text()}`).toBeTruthy();
  return res.json();
}

/** Apply a template to a patient and return the response body. */
async function applyTemplate(
  request: APIRequestContext,
  token: string,
  templateId: string,
  patientId: string,
  effectiveFrom: string
) {
  const res = await request.post(`${API_BASE}/templates/${templateId}/apply/`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { patientIds: [patientId], effectiveFrom },
  });
  expect(res.ok(), `Apply failed: ${await res.text()}`).toBeTruthy();
  return res.json();
}

/** Delete a template (cleanup). */
async function deleteTemplate(request: APIRequestContext, token: string, templateId: string) {
  await request.delete(`${API_BASE}/templates/${templateId}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Tomorrow as YYYY-MM-DD string. */
function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// UI helper
// ---------------------------------------------------------------------------


// ===========================================================================
// API-level E2E tests
// ===========================================================================

test.describe('Template assign/apply — API level', () => {
  // ---- Assign then apply produces sessions ----------------------------------

  test('fresh assign then apply returns applied=1 and sessions_created > 0', async ({
    request,
  }) => {
    skipUnlessPatient(test);

    const { patientId } = creds();
    const token = await getToken(request);

    const interventionId = await getFirstInterventionId(request, token);
    test.skip(!interventionId, 'No interventions available in the DB — skipping');

    const templateId = await createTemplate(request, token);

    try {
      // Assign with end_day=7
      await assignIntervention(request, token, templateId, interventionId as string, 7);

      // Apply
      const body = await applyTemplate(request, token, templateId, patientId as string, tomorrow());

      expect(body.success).toBe(true);
      expect(body.applied).toBe(1);
      expect(body.sessions_created).toBeGreaterThan(0);
    } finally {
      await deleteTemplate(request, token, templateId);
    }
  });

  // ---- Update existing schedule then apply (the dirty-tracking regression) --

  test('update existing schedule (second assign) then apply uses the NEW end_day', async ({
    request,
  }) => {
    skipUnlessPatient(test);

    const { patientId } = creds();
    const token = await getToken(request);

    const interventionId = await getFirstInterventionId(request, token);
    test.skip(!interventionId, 'No interventions available in the DB — skipping');

    const templateId = await createTemplate(request, token);

    try {
      // First assign: end_day=1 (short)
      await assignIntervention(request, token, templateId, interventionId as string, 1);

      // Second assign (UPDATE path — triggers the formerly-buggy branch): end_day=14
      const updateBody = await assignIntervention(
        request,
        token,
        templateId,
        interventionId as string,
        14
      );

      // The serialised response must already show end_day=14
      const rec = updateBody.template.recommendations[0];
      expect(rec.diagnosis_assignments._all[0].end_day).toBe(14);

      // Apply — DB-persisted schedule must also use end_day=14
      const applyBody = await applyTemplate(
        request,
        token,
        templateId,
        patientId as string,
        tomorrow()
      );

      expect(applyBody.success).toBe(true);
      expect(applyBody.applied).toBe(1);
      // A 14-day window starting tomorrow must produce more than 1 session
      expect(applyBody.sessions_created).toBeGreaterThan(1);
    } finally {
      await deleteTemplate(request, token, templateId);
    }
  });

  // ---- Remove a diagnosis block, confirm it is gone from DB ----------------

  test('removing a diagnosis block via DELETE ?diagnosis= persists after reload', async ({
    request,
  }) => {
    skipUnlessSeeded(test);

    const token = await getToken(request);
    const interventionId = await getFirstInterventionId(request, token);
    test.skip(!interventionId, 'No interventions available in the DB — skipping');

    const templateId = await createTemplate(request, token);

    try {
      // Assign same intervention under two diagnosis keys
      await assignIntervention(request, token, templateId, interventionId as string, 5);

      const res2 = await request.post(`${API_BASE}/templates/${templateId}/interventions/`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { interventionId, end_day: 5, diagnosis: 'MS' },
      });
      expect(res2.ok()).toBeTruthy();

      // Confirm both keys exist
      const detail1 = await request.get(`${API_BASE}/templates/${templateId}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const da1 = (await detail1.json()).template.recommendations[0].diagnosis_assignments;
      expect('MS' in da1).toBeTruthy();
      expect('_all' in da1).toBeTruthy();

      // Remove the MS block
      const removeRes = await request.delete(
        `${API_BASE}/templates/${templateId}/interventions/${interventionId}/?diagnosis=MS`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      expect(removeRes.ok(), `Remove failed: ${await removeRes.text()}`).toBeTruthy();

      // Re-fetch and verify MS is gone but _all remains
      const detail2 = await request.get(`${API_BASE}/templates/${templateId}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const da2 = (await detail2.json()).template.recommendations[0].diagnosis_assignments;
      expect('MS' in da2).toBeFalsy();
      expect('_all' in da2).toBeTruthy();
    } finally {
      await deleteTemplate(request, token, templateId);
    }
  });

  // ---- Apply an empty template returns applied=0 (sanity) ------------------

  test('applying an empty template returns applied=0 and sessions_created=0', async ({
    request,
  }) => {
    skipUnlessPatient(test);

    const { patientId } = creds();
    const token = await getToken(request);
    const templateId = await createTemplate(request, token);

    try {
      const body = await applyTemplate(request, token, templateId, patientId as string, tomorrow());

      expect(body.success).toBe(true);
      expect(body.applied).toBe(0);
      expect(body.sessions_created ?? 0).toBe(0);
    } finally {
      await deleteTemplate(request, token, templateId);
    }
  });
});

// ===========================================================================
// UI-level E2E tests
// ===========================================================================

test.describe('Template assign/apply — UI level', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessSeeded(test);
    await loginAsTherapist(page);
  });

  /** Open /interventions and click the Templates tab. */
  async function openTemplatesTab(page: Parameters<Parameters<typeof test>[1]>[0]) {
    await page.goto('/interventions');
    const tab = page.getByRole('tab', { name: /templates/i });
    await expect(tab).toBeVisible();
    await tab.click();
  }

  // ---- Create a template via the UI, then apply it, and verify the result --

  test('create template → add intervention → apply → result shows sessions_created > 0', async ({
    page,
    request,
  }) => {
    skipUnlessPatient(test);

    const { patientId } = creds();

    // Get a real token for direct API calls (cleanup + apply)
    const token = await getToken(request);
    const interventionId = await getFirstInterventionId(request, token);
    test.skip(!interventionId, 'No interventions available in the DB — skipping');

    await openTemplatesTab(page);

    // 1. Create a template via the UI
    await page.getByRole('button', { name: /\+ new/i }).click();
    const modal = page.locator('.modal.show');
    await expect(modal).toBeVisible();

    const uniqueName = `E2E Apply Test ${Date.now()}`;
    await modal.getByLabel(/template name/i).fill(uniqueName);

    const createRes = page.waitForResponse(
      (res) => res.url().includes('/api/templates/') && res.request().method() === 'POST'
    );
    await modal.getByRole('button', { name: /create/i }).click();
    const createResp = await createRes;
    const createBody = await createResp.json();
    const templateId: string = createBody.template._id;

    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // 2. Assign intervention via direct API call (the UI assign flow would
    //    require navigating to the intervention card, which is a separate test).
    await assignIntervention(request, token, templateId, interventionId as string, 7);

    // 3. Select the template in the UI and click Apply
    await page.reload();
    await openTemplatesTab(page);
    await page.getByRole('option', { name: uniqueName }).waitFor({ timeout: 5000 });
    await page.getByRole('combobox').first().selectOption({ label: uniqueName });

    const applyModal = page.locator('.modal.show');
    await page.getByRole('button', { name: /^apply$/i }).click();
    await expect(applyModal).toBeVisible();

    // 4. Intercept the apply response before clicking confirm in the modal
    const applyResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/templates/${templateId}/apply/`) &&
        res.request().method() === 'POST'
    );

    // Fill in the effective-from date if the modal has a date picker
    const datePicker = applyModal.locator('input[type="date"]');
    if (await datePicker.isVisible()) {
      await datePicker.fill(tomorrow());
    }

    // Select the patient if there is a patient selector
    const patientSelect = applyModal.getByRole('combobox');
    if (await patientSelect.isVisible()) {
      const options = await patientSelect.locator('option').all();
      if (options.length > 1) {
        await patientSelect.selectOption({ index: 1 });
      }
    }

    // Confirm apply
    await applyModal.getByRole('button', { name: /apply/i }).last().click();
    const applyResp = await applyResponse;
    const applyBody = await applyResp.json();

    expect(applyBody.success).toBe(true);
    expect(applyBody.applied).toBeGreaterThanOrEqual(1);
    expect(applyBody.sessions_created).toBeGreaterThan(0);

    // Cleanup
    await deleteTemplate(request, token, templateId);
  });

  // ---- The apply result dialog shows a non-zero session count --------------

  test('apply dialog reports sessions_created when template has interventions', async ({
    page,
    request,
  }) => {
    skipUnlessPatient(test);

    const { patientId } = creds();
    const token = await getToken(request);
    const interventionId = await getFirstInterventionId(request, token);
    test.skip(!interventionId, 'No interventions available in the DB — skipping');

    // Create template + assign via API (fast path)
    const templateId = await createTemplate(request, token);
    await assignIntervention(request, token, templateId, interventionId as string, 7);

    try {
      await openTemplatesTab(page);

      // Wait for the new template to appear in the selector
      const selector = page.getByRole('combobox').first();
      await page.waitForFunction(
        (id) =>
          [...document.querySelectorAll('option')].some((o) => o.getAttribute('value') === id),
        templateId,
        { timeout: 8000 }
      );
      await selector.selectOption(templateId);

      const applyResponse = page.waitForResponse(
        (res) =>
          res.url().includes(`/api/templates/${templateId}/apply/`) &&
          res.request().method() === 'POST'
      );

      await page.getByRole('button', { name: /^apply$/i }).click();
      const applyModal = page.locator('.modal.show');
      await expect(applyModal).toBeVisible();

      const datePicker = applyModal.locator('input[type="date"]');
      if (await datePicker.isVisible()) {
        await datePicker.fill(tomorrow());
      }

      // Use the patientId directly if the form accepts it, otherwise pick first option
      const patientSelect = applyModal.getByRole('combobox');
      if (await patientSelect.isVisible()) {
        const hasPatient = await patientSelect
          .locator(`option[value="${patientId}"]`)
          .isVisible()
          .catch(() => false);
        if (hasPatient) {
          await patientSelect.selectOption(patientId as string);
        } else {
          const options = await patientSelect.locator('option').all();
          if (options.length > 1) await patientSelect.selectOption({ index: 1 });
        }
      }

      await applyModal.getByRole('button', { name: /apply/i }).last().click();
      const resp = await applyResponse;
      const body = await resp.json();

      // The bug caused sessions_created=0 — assert it is positive
      expect(body.sessions_created).toBeGreaterThan(0);

      // The UI should show the result (success banner / count)
      await expect(
        page
          .getByText(/session/i)
          .or(page.getByText(/applied/i))
          .first()
      ).toBeVisible({ timeout: 5000 });
    } finally {
      await deleteTemplate(request, token, templateId);
    }
  });
});
