import { expect, test, type Page } from '@playwright/test';

import { loginAsTherapist } from './helpers/auth';

type TherapistPatientRow = {
  _id: string;
  username: string;
  patient_code: string;
  first_name: string;
  name: string;
  sex: string;
  diagnosis: string[];
  age: string;
  created_at: string;
  last_online: string | null;
  last_feedback_at: string | null;
  questionnaires: unknown[];
  feedback_low: boolean;
  thresholds: Record<string, unknown>;
  biomarker: Record<string, unknown>;
  adherence_rate: number | null;
  adherence_total: number | null;
  intervention_feedback: {
    last_answered_at: string | null;
    days_since_last: number | null;
    answered_days_total: number;
    recent_days_count: number;
    recent_avg_score: number | null;
    previous_avg_score: number | null;
    trend_delta: number | null;
    trend_lower: boolean;
  };
};

function skipUnlessSeeded() {
  test.skip(
    !process.env.E2E_THERAPIST_LOGIN || !process.env.E2E_THERAPIST_PASSWORD,
    'Missing seeded therapist credentials for E2E therapist tests'
  );
}

async function mockTherapistPatients(page: Page, rows: TherapistPatientRow[]) {
  await page.route('**/api/therapists/*/patients*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rows),
    });
  });
}

function basePatient(overrides: Partial<TherapistPatientRow>): TherapistPatientRow {
  const nowIso = new Date().toISOString();
  return {
    _id: 'p-e2e-feedback',
    username: 'e2e-user',
    patient_code: 'P-E2E',
    first_name: 'E2E',
    name: 'Patient',
    sex: 'Male',
    diagnosis: ['Stroke'],
    age: '1990-01-01',
    created_at: nowIso,
    last_online: null,
    last_feedback_at: nowIso,
    questionnaires: [],
    feedback_low: false,
    thresholds: {},
    biomarker: {},
    adherence_rate: null,
    adherence_total: null,
    intervention_feedback: {
      last_answered_at: nowIso,
      days_since_last: 1,
      answered_days_total: 3,
      recent_days_count: 3,
      recent_avg_score: 4.0,
      previous_avg_score: 3.5,
      trend_delta: 0.5,
      trend_lower: false,
    },
    ...overrides,
  };
}

test.describe('Therapist feedback chips', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessSeeded();
    await loginAsTherapist(page);
  });

  test('shows good feedback chip and tooltip for recent high average intervention feedback', async ({
    page,
  }) => {
    await mockTherapistPatients(page, [
      basePatient({
        _id: 'p-feedback-good',
        first_name: 'Feedback',
        name: 'Good',
        intervention_feedback: {
          last_answered_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          days_since_last: 1,
          answered_days_total: 4,
          recent_days_count: 3,
          recent_avg_score: 4.0,
          previous_avg_score: 3.5,
          trend_delta: 0.5,
          trend_lower: false,
        },
      }),
    ]);

    await page.goto('/therapist');
    const row = page.locator('tr', { hasText: 'Feedback Good' });
    await expect(row).toBeVisible();

    const chip = row.getByLabel('Feedback good');
    await expect(chip).toBeVisible();
    await chip.hover();

    await expect(page.getByText(/Avg score \(last 3 answered days\): 4\.00/i)).toBeVisible();
  });

  test('shows bad feedback chip when trend is lower and hides health chip for ongoing patient', async ({
    page,
  }) => {
    await mockTherapistPatients(page, [
      basePatient({
        _id: 'p-feedback-bad',
        first_name: 'Trend',
        name: 'Down',
        intervention_feedback: {
          last_answered_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          days_since_last: 2,
          answered_days_total: 6,
          recent_days_count: 3,
          recent_avg_score: 2.5,
          previous_avg_score: 4.0,
          trend_delta: -1.5,
          trend_lower: true,
        },
      }),
    ]);

    await page.goto('/therapist');
    const row = page.locator('tr', { hasText: 'Trend Down' });
    await expect(row).toBeVisible();

    await expect(row.getByLabel('Feedback bad')).toBeVisible();
    await expect(row.getByLabel(/Health/i)).toHaveCount(0);
  });
});
