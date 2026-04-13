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

    // Mock MediaRecorder
    class FakeMediaRecorder extends EventTarget {
      static isTypeSupported(mime: string) {
        return mime.includes('webm') || mime.includes('mp4');
      }
      mimeType: string;
      ondataavailable: ((ev: any) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(_stream: any, opts?: any) {
        super();
        this.mimeType = opts?.mimeType ?? 'audio/webm';
      }
      start() {}
      stop() {
        if (this.ondataavailable) {
          this.ondataavailable({ data: new Blob(['x'], { type: this.mimeType }), size: 1 });
        }
        if (this.onstop) this.onstop();
      }
      requestData() {}
    }
    (window as any).MediaRecorder = FakeMediaRecorder;
  });
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
  test('shows ID entry form when no patient ID is in the URL', async ({ page }) => {
    await mockAudioAPIs(page);
    await page.goto('/icf');

    await expect(page.getByText('Patienten-ID eingeben')).toBeVisible();
    await expect(page.getByPlaceholder('P01')).toBeVisible();
  });

  test('accepts /icf/:patientId URL and skips the ID form', async ({ page }) => {
    await mockAudioAPIs(page);
    await gotoWithPatientId(page, 'P99');

    // Should land directly on the mic-permission / welcome screen
    await expect(page.getByText('Willkommen')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Übungslauf starten' })).toBeVisible();
  });

  test('validates that the ID must start with P followed by digits', async ({ page }) => {
    await mockAudioAPIs(page);
    await page.goto('/icf');

    await page.getByPlaceholder('P01').fill('BADID');
    await page.getByRole('button', { name: 'Weiter' }).click();

    await expect(page.getByText(/ID muss mit P beginnen/)).toBeVisible();
  });

  test('accepts a valid ID and advances to the mic screen', async ({ page }) => {
    await mockAudioAPIs(page);
    await page.goto('/icf');

    await page.getByPlaceholder('P01').fill('P42');
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

  test('practice mode does not show the bell or play audio buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Ton an|Ton aus/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Frage abspielen' })).not.toBeVisible();
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
    await expect(page.getByText('Frage 1 von')).toBeVisible();
  });

  test('real mode shows Weiter and "Kann ich nicht beantworten" buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Weiter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kann ich nicht beantworten' })).toBeVisible();
  });

  test('real mode shows bell and play audio buttons', async ({ page }) => {
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
    await expect(page.getByText('Frage 1 von')).toBeVisible();

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
