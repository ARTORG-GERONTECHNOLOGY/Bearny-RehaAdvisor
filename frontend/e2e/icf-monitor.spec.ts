/**
 * E2E tests for the ICF Monitor page (/icf)
 *
 * These tests mock browser audio APIs (getUserMedia / MediaRecorder) so they can
 * run without real microphone access. Network POSTs to /api/healthslider/submit-item/
 * are intercepted and stubbed to return 200 OK.
 */
import { expect, test, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Inject mocks for MediaRecorder and getUserMedia before any page script runs. */
async function mockAudioAPIs(page: Page) {
  await page.addInitScript(() => {
    // Mock getUserMedia to immediately resolve with a fake stream
    const fakeStream = {
      getTracks: () => [{ stop: () => {} }],
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: () => Promise.resolve(fakeStream),
      },
    });

    // Mock MediaRecorder — records the timeslice passed to start() for assertions
    class FakeMediaRecorder extends EventTarget {
      static isTypeSupported(mime: string) {
        return mime.includes('webm') || mime.includes('mp4');
      }
      static lastStartTimeslice: number | undefined = undefined;
      mimeType: string;
      ondataavailable: ((ev: any) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(_stream: any, opts?: any) {
        super();
        this.mimeType = opts?.mimeType ?? 'audio/webm';
      }
      start(timeslice?: number) {
        FakeMediaRecorder.lastStartTimeslice = timeslice;
      }
      stop() {
        if (this.ondataavailable) {
          this.ondataavailable({ data: new Blob(['x'], { type: this.mimeType }), size: 1 });
        }
        // Simulate slight async delay before onstop (mirrors real browser behaviour)
        setTimeout(() => {
          if (this.onstop) this.onstop();
        }, 10);
      }
      requestData() {}
    }
    (window as any).MediaRecorder = FakeMediaRecorder;
    (window as any).FakeMediaRecorder = FakeMediaRecorder;
  });
}

/**
 * Pre-seed localStorage to simulate a mid-survey state so the page
 * opens directly at the given question index without going through
 * the start screen or practice mode.
 */
async function seedMidSurveyState(
  page: Page,
  opts: { questionIndex?: number; patientId?: string } = {}
) {
  const { questionIndex = 0, patientId = 'P01-001T1' } = opts;
  await page.addInitScript(
    ({ idx, pid, sid }) => {
      localStorage.setItem('survey_index', String(idx));
      localStorage.setItem('survey_sessionId', sid);
      localStorage.setItem('patient_id', pid);
    },
    { idx: questionIndex, pid: patientId, sid: `seeded_session_${Date.now()}` }
  );
}

/** Navigate to /icf with a patient ID already provided in the URL (skips ID-entry screen). */
async function gotoWithPatientId(page: Page, patientId = 'P01') {
  await page.goto(`/icf/${patientId}`);
}

/** Navigate past the mic-permission screen by clicking "Übungslauf starten". */
async function startMicAndPractice(page: Page) {
  await page.getByRole('button', { name: 'Übungslauf starten' }).click();
  // Wait for the practice mode banner to appear
  await expect(page.getByText('ÜBUNGSMODUS')).toBeVisible();
}

/** Stub the submit-item endpoint so uploads don't fail during tests. */
async function stubSubmitItem(page: Page) {
  await page.route('**/api/healthslider/submit-item/**', (route) =>
    route.fulfill({ status: 200, body: '{}' })
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('ICF Monitor — patient ID entry', () => {
  // #327 — heading renamed from "Patienten-ID" to "Teilnehmer:in-ID"
  test('shows Teilnehmer:in-ID heading when no patient ID is in the URL', async ({ page }) => {
    await mockAudioAPIs(page);
    await page.goto('/icf');

    await expect(page.getByRole('heading', { name: 'Teilnehmer:in-ID' })).toBeVisible();
  });

  // #327 — format hint label removed to prevent unauthorised access
  test('does not show the format hint label on the ID entry screen', async ({ page }) => {
    await mockAudioAPIs(page);
    await page.goto('/icf');

    await expect(page.getByText(/Format.*P001/i)).not.toBeVisible();
    await expect(page.getByText(/Patienten-ID/i)).not.toBeVisible();
  });

  test('accepts /icf/:patientId URL and skips the ID form', async ({ page }) => {
    await mockAudioAPIs(page);
    await gotoWithPatientId(page, 'P99');

    // Should land directly on the mic-permission / welcome screen
    await expect(page.getByText('Willkommen')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Übungslauf starten' })).toBeVisible();
  });

  test('validates that the ID must match the expected format', async ({ page }) => {
    await mockAudioAPIs(page);
    await page.goto('/icf');

    await page.getByRole('textbox').fill('BADID');
    await page.getByRole('button', { name: 'Weiter' }).click();

    await expect(page.getByText(/ID muss dem Format/)).toBeVisible();
  });

  test('accepts a valid ID and advances to the mic screen', async ({ page }) => {
    await mockAudioAPIs(page);
    await page.goto('/icf');

    await page.getByRole('textbox').fill('P001-001T1');
    await page.getByRole('button', { name: 'Weiter' }).click();

    await expect(page.getByRole('button', { name: 'Übungslauf starten' })).toBeVisible();
  });
});

test.describe('ICF Monitor — practice mode UI', () => {
  test.beforeEach(async ({ page }) => {
    await mockAudioAPIs(page);
    await stubSubmitItem(page);
    await gotoWithPatientId(page);
    await startMicAndPractice(page);
  });

  test('practice mode shows the ÜBUNGSMODUS banner', async ({ page }) => {
    await expect(page.getByText('ÜBUNGSMODUS')).toBeVisible();
  });

  test('practice mode shows the Start button (not Weiter)', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    // "Weiter" and "Kann ich nicht beantworten" must not appear in practice mode
    await expect(page.getByRole('button', { name: 'Weiter' })).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Kann ich nicht beantworten' })
    ).not.toBeVisible();
  });

  test('practice mode shows the info, bell and play audio buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Information' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ton an|Ton aus/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Frage abspielen' })).toBeVisible();
  });

  test('practice question text is visible and the slider is present', async ({ page }) => {
    await expect(page.getByText('Übungslauf Beispiel')).toBeVisible();
    await expect(page.getByRole('slider')).toBeVisible();
  });
});

test.describe('ICF Monitor — real survey mode', () => {
  test.beforeEach(async ({ page }) => {
    await mockAudioAPIs(page);
    await stubSubmitItem(page);
    await gotoWithPatientId(page);
    await startMicAndPractice(page);
    // Advance from practice mode into the real survey
    await page.getByRole('button', { name: 'Start' }).click();
    // Wait for progress bar / real question
    await expect(page.getByText('/ 29')).toBeVisible();
  });

  test('real mode shows Weiter and "Kann ich nicht beantworten" buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Weiter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kann ich nicht beantworten' })).toBeVisible();
  });

  test('real mode shows info, bell and play audio buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Information' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ton an|Ton aus/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Frage abspielen' })).toBeVisible();
  });

  test('Weiter is disabled immediately after entering a new question (3s lock)', async ({
    page,
  }) => {
    // Buttons are locked for 3 s when a new question loads
    const weiterBtn = page.getByRole('button', { name: 'Weiter' });
    await expect(weiterBtn).toBeDisabled();
  });

  test('Weiter becomes enabled after the 3-second lock lifts', async ({ page }) => {
    const weiterBtn = page.getByRole('button', { name: 'Weiter' });
    // Wait up to 5 s for it to become enabled
    await expect(weiterBtn).toBeEnabled({ timeout: 5000 });
  });

  test('slider can be dragged while Weiter buttons are still locked', async ({ page }) => {
    const slider = page.getByRole('slider');
    // Confirm buttons are locked right after question load
    await expect(page.getByRole('button', { name: 'Weiter' })).toBeDisabled();

    // Read initial value
    const initialValue = await slider.getAttribute('aria-valuenow');

    // Drag the slider upward by 100 px (should move toward 100)
    const sliderBox = await slider.boundingBox();
    if (!sliderBox) throw new Error('Slider not found');

    const centerX = sliderBox.x + sliderBox.width / 2;
    const centerY = sliderBox.y + sliderBox.height / 2;

    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX, centerY - 100, { steps: 10 });
    await page.mouse.up();

    // Slider value should have changed
    const newValue = await slider.getAttribute('aria-valuenow');
    expect(newValue).not.toBe(initialValue);
  });

  test('slider reaches values near 100 at the top of the track', async ({ page }) => {
    // Wait for the lock to lift so we can interact more freely
    await expect(page.getByRole('button', { name: 'Weiter' })).toBeEnabled({ timeout: 5000 });

    const track = page.getByRole('group', { name: 'Schieberegler vertikal' });
    const trackBox = await track.boundingBox();
    if (!trackBox) throw new Error('Track not found');

    // Click at the very top of the track → value should be 100
    await page.mouse.click(trackBox.x + trackBox.width / 2, trackBox.y + 2);

    const slider = page.getByRole('slider');
    const value = Number(await slider.getAttribute('aria-valuenow'));
    expect(value).toBeGreaterThanOrEqual(95);
  });

  test('slider reaches values near 0 at the bottom of the track', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Weiter' })).toBeEnabled({ timeout: 5000 });

    const track = page.getByRole('group', { name: 'Schieberegler vertikal' });
    const trackBox = await track.boundingBox();
    if (!trackBox) throw new Error('Track not found');

    // Click at the very bottom of the track → value should be 0
    await page.mouse.click(trackBox.x + trackBox.width / 2, trackBox.y + trackBox.height - 2);

    const slider = page.getByRole('slider');
    const value = Number(await slider.getAttribute('aria-valuenow'));
    expect(value).toBeLessThanOrEqual(5);
  });

  test('toggling the bell button does not restart the lock timer', async ({ page }) => {
    // Wait for the lock to expire normally
    await expect(page.getByRole('button', { name: 'Weiter' })).toBeEnabled({ timeout: 5000 });

    // Toggle the bell off and back on
    const bellBtn = page.getByRole('button', { name: /Ton an|Ton aus/i });
    await bellBtn.click(); // off
    await bellBtn.click(); // on

    // Weiter should still be enabled (bell toggle must not restart the 3s lock)
    await expect(page.getByRole('button', { name: 'Weiter' })).toBeEnabled();
  });

  test('footer shows the patient ID', async ({ page }) => {
    await expect(page.getByText('ID: P01')).toBeVisible();
  });

  test('Info button opens the overlay and zurück closes it', async ({ page }) => {
    await page.getByRole('button', { name: 'Information' }).click();

    // Overlay is visible with heading and close button
    await expect(page.getByRole('heading', { name: 'Information' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'zurück' })).toBeVisible();

    // Survey content is still in the DOM behind the overlay
    await expect(page.getByText('/ 29')).toBeVisible();

    // Close the overlay
    await page.getByRole('button', { name: 'zurück' }).click();
    await expect(page.getByRole('heading', { name: 'Information' })).not.toBeVisible();

    // Survey is intact
    await expect(page.getByText('/ 29')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Weiter' })).toBeVisible();
  });
});

test.describe('ICF Monitor — MediaRecorder not available', () => {
  test('shows a helpful error message when MediaRecorder is missing', async ({ page }) => {
    // Provide getUserMedia but NOT MediaRecorder
    await page.addInitScript(() => {
      const fakeStream = { getTracks: () => [{ stop: () => {} }] };
      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        value: { getUserMedia: () => Promise.resolve(fakeStream) },
      });
      // Explicitly delete MediaRecorder (simulate old Safari / WebView)
      delete (window as any).MediaRecorder;
    });

    await gotoWithPatientId(page);
    await page.getByRole('button', { name: 'Übungslauf starten' }).click();

    await expect(page.getByText(/MediaRecorder fehlt|nicht unterstützt/i)).toBeVisible();
  });
});

test.describe('ICF Monitor — upload failure recovery', () => {
  test('shows upload-failure modal with download option when backend returns an error', async ({
    page,
  }) => {
    await mockAudioAPIs(page);

    // Stub the endpoint to fail
    await page.route('**/api/healthslider/submit-item/**', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' })
    );

    await gotoWithPatientId(page);
    await startMicAndPractice(page);

    // Move through practice
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('/ 29')).toBeVisible();

    // Wait for lock to lift, then submit
    await expect(page.getByRole('button', { name: 'Weiter' })).toBeEnabled({ timeout: 5000 });
    await page.getByRole('button', { name: 'Weiter' }).click();

    // Slider alert may appear if slider wasn't moved → confirm middle position
    const sliderAlert = page.getByText('Möchten Sie den Schieber');
    if (await sliderAlert.isVisible()) {
      await page.getByRole('button', { name: 'Belassen und weiter' }).click();
    }

    // The upload-failure modal should appear
    await expect(page.getByText('Upload fehlgeschlagen')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Audio + Info herunterladen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Schließen' })).toBeVisible();
  });
});

test.describe('ICF Monitor — item audio playback', () => {
  test('play button retries playback source and does not show audio error when a retry succeeds', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as any).__playAttempts = [];
      const origPlay = HTMLMediaElement.prototype.play;
      let attempts = 0;

      HTMLMediaElement.prototype.play = function () {
        const src = (this as HTMLMediaElement).currentSrc || (this as HTMLMediaElement).src || '';
        (window as any).__playAttempts.push(src);
        attempts += 1;

        if (attempts === 1) return Promise.reject(new Error('simulated first-source failure'));
        return Promise.resolve();
      };

      // keep a reference in case future tests need it
      (window as any).__origPlay = origPlay;
    });

    await mockAudioAPIs(page);
    await stubSubmitItem(page);
    await gotoWithPatientId(page);
    await startMicAndPractice(page);
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('/ 29')).toBeVisible();

    await page.getByRole('button', { name: 'Frage abspielen' }).click();

    await expect
      .poll(async () => {
        return page.evaluate(() => ((window as any).__playAttempts || []).length);
      })
      .toBeGreaterThanOrEqual(2);

    await expect(page.getByText(/Audio kann nicht abgespielt werden/i)).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests for issues #324–#329
// ---------------------------------------------------------------------------

test.describe('#329 — first real question text', () => {
  test('first real question is the topic form, not the old question form', async ({ page }) => {
    await mockAudioAPIs(page);
    await stubSubmitItem(page);
    await gotoWithPatientId(page);
    await startMicAndPractice(page);

    // Advance from practice mode into the real survey
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('/ 29')).toBeVisible();

    // New wording (#329)
    await expect(
      page.getByRole('heading', { name: 'Gesundheit, Befinden und Wohlbefinden allgemein' })
    ).toBeVisible();

    // Old wording must be gone
    await expect(
      page.getByText(/wie geht es Ihnen heute und in den letzten Tagen/i)
    ).not.toBeVisible();
  });
});

test.describe('#327 — Teilnehmer:in-ID and end-screen behaviour', () => {
  test('ID entry screen shows Teilnehmer:in-ID heading without format hint', async ({ page }) => {
    await mockAudioAPIs(page);
    await page.goto('/icf');

    await expect(page.getByRole('heading', { name: 'Teilnehmer:in-ID' })).toBeVisible();
    // Format hint and old "Patienten-ID" label must not be present
    await expect(page.getByText(/Patienten-ID/)).not.toBeVisible();
    await expect(page.getByText(/P001-001T1/)).not.toBeVisible();
  });

  test('end screen shows Vielen Dank without a Beenden button and does not auto-redirect', async ({
    page,
  }) => {
    await mockAudioAPIs(page);
    await stubSubmitItem(page);

    // Seed localStorage so the page opens on the last question directly
    await seedMidSurveyState(page, { questionIndex: 28, patientId: 'P01-001T1' });
    await page.goto('/icf/P01-001T1');

    await expect(page.getByText('/ 29')).toBeVisible();

    // Wait for the 3-second lock to lift, then submit the last answer
    const naBtn = page.getByRole('button', { name: 'Kann ich nicht beantworten' });
    await expect(naBtn).toBeEnabled({ timeout: 5000 });
    await naBtn.click();

    // End screen must appear
    await expect(page.getByText('Vielen Dank')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Sie haben alles geschafft!')).toBeVisible();

    // The Beenden button must NOT exist on the end screen
    await expect(page.getByRole('button', { name: 'Beenden' })).not.toBeVisible();

    // "Weiter" and "Kann ich nicht beantworten" must also be gone
    await expect(page.getByRole('button', { name: 'Weiter' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Kann ich nicht beantworten' })).not.toBeVisible();

    // Page must not auto-redirect to ID entry
    await expect(page.getByRole('heading', { name: 'Teilnehmer:in-ID' })).not.toBeVisible();
  });

  test('localStorage is cleared immediately when the last answer is submitted', async ({
    page,
  }) => {
    await mockAudioAPIs(page);
    await stubSubmitItem(page);

    await seedMidSurveyState(page, { questionIndex: 28, patientId: 'P01-001T1' });
    await page.goto('/icf/P01-001T1');

    await expect(page.getByText('/ 29')).toBeVisible();
    const naBtn = page.getByRole('button', { name: 'Kann ich nicht beantworten' });
    await expect(naBtn).toBeEnabled({ timeout: 5000 });
    await naBtn.click();

    await expect(page.getByText('Vielen Dank')).toBeVisible({ timeout: 5000 });

    // All three localStorage keys must be gone after survey completion
    const keys = await page.evaluate(() => ({
      surveyIndex: localStorage.getItem('survey_index'),
      sessionId: localStorage.getItem('survey_sessionId'),
      patientId: localStorage.getItem('patient_id'),
    }));
    expect(keys.surveyIndex).toBeNull();
    expect(keys.sessionId).toBeNull();
    expect(keys.patientId).toBeNull();
  });
});

test.describe('#328 — refresh mid-survey resumes at the saved question', () => {
  test('opens directly on the saved question when survey_index is in localStorage', async ({
    page,
  }) => {
    await mockAudioAPIs(page);
    await stubSubmitItem(page);

    // Simulate a mid-survey state at question index 5 (question 6/29)
    await seedMidSurveyState(page, { questionIndex: 5, patientId: 'P01-001T1' });
    await page.goto('/icf/P01-001T1');

    // Should skip StartScreen entirely and show the survey at question 6
    await expect(page.getByText('Willkommen')).not.toBeVisible();
    await expect(page.getByText('ÜBUNGSMODUS')).not.toBeVisible();
    await expect(page.getByText('/ 29')).toBeVisible();

    // Progress counter should reflect the saved position
    await expect(page.getByText('6')).toBeVisible();
  });

  test('shows the StartScreen when no saved survey progress exists', async ({ page }) => {
    await mockAudioAPIs(page);
    await gotoWithPatientId(page);

    // Fresh visit — no localStorage — should land on the welcome screen
    await expect(page.getByText('Willkommen')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Übungslauf starten' })).toBeVisible();
  });
});

test.describe('#325 / #326 — start and info screen content', () => {
  test('StartScreen shows full question phrasing and scale description', async ({ page }) => {
    await mockAudioAPIs(page);
    await gotoWithPatientId(page);

    await expect(page.getByText('Willkommen')).toBeVisible();
    // Scale question phrasing is shown on the start screen
    await expect(page.getByText(/Von sehr schlecht bis sehr gut/i)).toBeVisible();
    // Instructions for rating then explaining are present
    await expect(page.getByText(/auf der Skala bewerten/i)).toBeVisible();
    await expect(page.getByText(/frei dazu erzählen/i)).toBeVisible();
    // Mic and privacy instructions are present
    await expect(page.getByText(/Mikrofon/i)).toBeVisible();
    await expect(page.getByText(/verschlüsselt übermittelt/i)).toBeVisible();
  });

  test('InfoScreen shows full question phrasing and scale description', async ({ page }) => {
    await mockAudioAPIs(page);
    await stubSubmitItem(page);
    await gotoWithPatientId(page);
    await startMicAndPractice(page);
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('/ 29')).toBeVisible();

    // Open info overlay
    await page.getByRole('button', { name: 'Information' }).click();
    await expect(page.getByRole('heading', { name: 'Information' })).toBeVisible();

    // Scale question phrasing and instructions are shown in the info overlay
    await expect(page.getByText(/Von sehr schlecht bis sehr gut/i)).toBeVisible();
    await expect(page.getByText(/auf der Skala bewerten/i)).toBeVisible();
    await expect(page.getByText(/frei dazu erzählen/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests for refresh / resume edge cases (#328 extended)
// ---------------------------------------------------------------------------

test.describe('#328 — refresh during practice mode skips StartScreen', () => {
  test('refresh while in practice mode (survey_sessionId set, no survey_index) shows ÜBUNGSMODUS', async ({
    page,
  }) => {
    await mockAudioAPIs(page);
    await stubSubmitItem(page);

    // Simulate a refresh mid-practice: survey_sessionId was written when mic started,
    // but survey_index was not yet written (only written when real-mode answers are saved).
    await page.addInitScript(
      ({ pid, sid }) => {
        localStorage.setItem('survey_sessionId', sid);
        localStorage.setItem('patient_id', pid);
        // Intentionally NO survey_index
      },
      { pid: 'P01-001T1', sid: 'practice_session_refresh' }
    );

    await page.goto('/icf/P01-001T1');

    // Must NOT show the welcome screen (testMode=false because survey_sessionId is set)
    await expect(page.getByText('Willkommen')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Übungslauf starten' })).not.toBeVisible();

    // Must show practice mode directly
    await expect(page.getByText('ÜBUNGSMODUS')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();

    // Navigation buttons for real survey must not appear yet
    await expect(page.getByRole('button', { name: 'Weiter' })).not.toBeVisible();
  });
});

test.describe('End-screen — no interactive buttons', () => {
  test('end screen has no Beenden, Weiter, or "Kann ich nicht beantworten" buttons', async ({
    page,
  }) => {
    await mockAudioAPIs(page);
    await stubSubmitItem(page);

    await seedMidSurveyState(page, { questionIndex: 28, patientId: 'P01-001T1' });
    await page.goto('/icf/P01-001T1');

    await expect(page.getByText('/ 29')).toBeVisible();
    const naBtn = page.getByRole('button', { name: 'Kann ich nicht beantworten' });
    await expect(naBtn).toBeEnabled({ timeout: 5000 });
    await naBtn.click();

    await expect(page.getByText('Vielen Dank')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Sie haben alles geschafft!')).toBeVisible();

    // Survey action buttons must be gone
    await expect(page.getByRole('button', { name: 'Beenden' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Weiter' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Kann ich nicht beantworten' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).not.toBeVisible();
  });
});

test.describe('Mid-survey resume — correct question shown', () => {
  test('resuming from question 10 shows 10/29 and the correct question text', async ({ page }) => {
    await mockAudioAPIs(page);
    await stubSubmitItem(page);

    // Question index 9 = question 10 (0-based)
    await seedMidSurveyState(page, { questionIndex: 9, patientId: 'P01-001T1' });
    await page.goto('/icf/P01-001T1');

    // Counter should show 10 / 29
    await expect(page.getByText('10')).toBeVisible();
    await expect(page.getByText('/ 29')).toBeVisible();

    // The 10th question text (index 9 in REAL_QUESTIONS)
    await expect(
      page.getByRole('heading', { name: /Herzfunktion, Atmung, Leistungsfähigkeit/i })
    ).toBeVisible();

    // Practice mode banner must be absent
    await expect(page.getByText('ÜBUNGSMODUS')).not.toBeVisible();
  });

  test('resuming from question 1 shows 1/29 and skips practice mode', async ({ page }) => {
    await mockAudioAPIs(page);
    await stubSubmitItem(page);

    await seedMidSurveyState(page, { questionIndex: 0, patientId: 'P01-001T1' });
    await page.goto('/icf/P01-001T1');

    await expect(page.getByText('1')).toBeVisible();
    await expect(page.getByText('/ 29')).toBeVisible();
    await expect(page.getByText('ÜBUNGSMODUS')).not.toBeVisible();
    await expect(page.getByText('Willkommen')).not.toBeVisible();
  });

  test('advancing through real questions increments the counter', async ({ page }) => {
    await mockAudioAPIs(page);
    await stubSubmitItem(page);

    await seedMidSurveyState(page, { questionIndex: 0, patientId: 'P01-001T1' });
    await page.goto('/icf/P01-001T1');

    await expect(page.getByText('/ 29')).toBeVisible();

    // Wait for lock to lift, then answer Q1
    const naBtn = page.getByRole('button', { name: 'Kann ich nicht beantworten' });
    await expect(naBtn).toBeEnabled({ timeout: 5000 });
    await naBtn.click();

    // Counter should advance to 2
    await expect(page.getByText('2')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('/ 29')).toBeVisible();
  });
});

test.describe('#324 — MediaRecorder started with timeslice', () => {
  test('recorder is started with a 250ms timeslice to prevent empty blobs on iOS', async ({
    page,
  }) => {
    await mockAudioAPIs(page);
    await stubSubmitItem(page);
    await gotoWithPatientId(page);

    // Click start — this triggers startMic() → startItemRecorder() → rec.start(250)
    await page.getByRole('button', { name: 'Übungslauf starten' }).click();
    await expect(page.getByText('ÜBUNGSMODUS')).toBeVisible();

    // Read the timeslice that was passed to FakeMediaRecorder.start()
    const timeslice = await page.evaluate(
      () => (window as any).FakeMediaRecorder?.lastStartTimeslice
    );
    expect(timeslice).toBe(250);
  });
});
