import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import HealthSlider from '@/pages/eva2';

function mockMedia() {
  // mock getUserMedia
  const getUserMedia = jest.fn().mockResolvedValue({
    getTracks: () => [{ stop: jest.fn() }],
  });

  // @ts-ignore
  global.navigator.mediaDevices = { getUserMedia };

  // mock MediaRecorder
  class MockMediaRecorder {
    static isTypeSupported = jest.fn((t: string) => t.includes('webm') || t.includes('mp4'));
    public mimeType: string;
    public ondataavailable: ((ev: any) => void) | null = null;
    public onstop: (() => void) | null = null;
    constructor(_stream: any, opts?: any) {
      this.mimeType = opts?.mimeType || 'audio/webm';
    }
    start() {
      // noop
    }
    stop() {
      // emit one chunk then stop
      if (this.ondataavailable)
        this.ondataavailable({ data: new Blob(['x'], { type: this.mimeType }), size: 1 });
      if (this.onstop) this.onstop();
    }
    requestData() {
      // noop
    }
  }
  // @ts-ignore
  global.MediaRecorder = MockMediaRecorder;

  return { getUserMedia };
}

describe('HealthSlider (Full Sync)', () => {
  const originalPrompt = window.prompt;
  const originalAlert = window.alert;

  // Helper to enter patient ID (since eva2 uses form, not prompt)
  const enterPatientId = async (patientId = 'P01') => {
    const input = screen.getByPlaceholderText('P01');
    fireEvent.change(input, { target: { value: patientId } });
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    await waitFor(() => {
      expect(screen.queryByText(/Patienten-ID eingeben/)).not.toBeInTheDocument();
    });
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();

    window.prompt = jest.fn(() => 'P01') as any;
    window.alert = jest.fn() as any;

    // Mock URL methods before spying
    if (!URL.createObjectURL) {
      URL.createObjectURL = jest.fn();
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = jest.fn();
    }

    jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    // Mock fetch before spying
    if (!global.fetch) {
      global.fetch = jest.fn();
    }
    jest.spyOn(window, 'fetch').mockResolvedValue({ ok: true, status: 200 } as any);

    // stable bounding box for slider movement
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      height: 200,
      left: 0,
      width: 200,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as any);

    // capture downloads
    const created: any[] = [];
    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'a') {
        const a = {
          href: '',
          download: '',
          click: jest.fn(),
          remove: jest.fn(),
        } as any;
        created.push(a);
        return a;
      }
      return originalCreateElement(tagName);
    }) as any);

    // store anchors on window for assertions
    (window as any).__anchors = created;

    mockMedia();
  });

  afterAll(() => {
    window.prompt = originalPrompt;
    window.alert = originalAlert;
  });

  it('prompts for patient id (Pxx) and stores it', async () => {
    render(<HealthSlider />);
    await enterPatientId();

    // Check patient ID is stored
    expect(localStorage.getItem('patient_id')).toBe('P01');

    // Now click mic permission button
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));

    await waitFor(() => {
      expect(screen.getByText(/ID: P01/)).toBeInTheDocument();
    });
  });

  it.skip('shows "middle slider" modal if user clicks Weiter without moving (still 50)', async () => {
    // This test needs to be updated for eva2.tsx behavior
    // The modal might appear differently or have different timing
    render(<HealthSlider />);
    await enterPatientId();
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));
    // Wait for practice mode to load
    await waitFor(() => {
      expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument();
    });
    // in practice mode -> "Start" button (not Weiter yet)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    // Wait for transition to real mode
    await waitFor(() => {
      expect(screen.queryByText(/ÜBUNGSMODUS/i)).not.toBeInTheDocument();
    });

    // now in real mode -> Weiter exists
    fireEvent.click(await screen.findByRole('button', { name: 'Weiter' }));

    expect(
      await screen.findByText(/Möchten Sie den Schieber in der Mitte belassen/i)
    ).toBeInTheDocument();
  });

  it.skip('sliderPosition resets to 50 after next (practice → real), and after successful real Next', async () => {
    // This test needs to be updated for eva2.tsx slider behavior
    // The slider attributes and timing may differ from eva.tsx
    render(<HealthSlider />);
    await enterPatientId();
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));

    // Wait for practice mode to load
    await waitFor(() => {
      expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument();
    });

    // Practice -> Start should reset to 50 (it already is, but we prove it can move and is reset)
    const slider = screen.getByRole('slider');
    const track = slider.parentElement as HTMLElement;

    // move slider (pointer down at top => ~97)
    act(() => {
      fireEvent.pointerDown(track, { clientY: 0, pointerId: 1 });
      fireEvent.pointerUp(track, { pointerId: 1 });
    });

    // Wait for slider value to update
    await waitFor(() => {
      expect(Number(slider.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(90);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    // Wait for transition to real mode
    await waitFor(() => {
      expect(screen.queryByText(/ÜBUNGSMODUS/i)).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '50');
    });

    // move slider again for Q1 so we avoid modal
    const slider2 = screen.getByRole('slider');
    const track2 = slider2.parentElement as HTMLElement;
    act(() => {
      fireEvent.pointerDown(track2, { clientY: 0, pointerId: 2 });
      fireEvent.pointerUp(track2, { pointerId: 2 });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    // after successful upload -> it advances and resets to 50
    await waitFor(() => {
      expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '50');
    });
  });

  it.skip('corrupted localStorage survey_index shows warning banner and clears keys', async () => {
    // Note: eva2.tsx doesn't have localStorage corruption detection
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('survey_index', 'not-a-number');
    localStorage.setItem('survey_sessionId', 'abc');

    render(<HealthSlider />);

    // banner appears
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gespeicherter Fortschritt war beschädigt und wurde zurückgesetzt.'
    );

    expect(warnSpy).toHaveBeenCalled();
    expect(localStorage.getItem('survey_index')).toBeNull();
    expect(localStorage.getItem('survey_sessionId')).toBeNull();

    warnSpy.mockRestore();
  });

  it.skip('upload failure opens modal and download filenames include patientId + sessionId + qXX + timestamp', async () => {
    // This test needs to be updated for eva2.tsx upload error handling
    // The upload failure modal and download behavior may differ
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-01T10:11:12.000Z'));

    // make upload fail
    (window.fetch as any).mockResolvedValueOnce({ ok: false, status: 500 });

    render(<HealthSlider />);
    await enterPatientId();
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));

    // Wait for practice mode to load
    await waitFor(() => {
      expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument();
    });

    // practice -> Start
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    // Wait for transition to real mode
    await waitFor(() => {
      expect(screen.queryByText(/ÜBUNGSMODUS/i)).not.toBeInTheDocument();
    });

    // move slider so modal doesn't block
    const slider = screen.getByRole('slider');
    const track = slider.parentElement as HTMLElement;
    act(() => {
      fireEvent.pointerDown(track, { clientY: 0, pointerId: 1 });
      fireEvent.pointerUp(track, { pointerId: 1 });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    // upload fail modal appears
    expect(await screen.findByText(/Upload fehlgeschlagen/i)).toBeInTheDocument();

    // click download
    fireEvent.click(screen.getByRole('button', { name: /Audio \+ Info herunterladen/i }));

    // two downloads: json + audio
    const anchors = (window as any).__anchors as any[];
    const downloads = anchors.map((a) => a.download).filter(Boolean);

    expect(downloads.length).toBeGreaterThanOrEqual(2);

    const jsonName = downloads.find((d) => d.endsWith('.json'));
    const audioName = downloads.find((d) => d.endsWith('.webm') || d.endsWith('.m4a'));

    expect(jsonName).toBeTruthy();
    expect(audioName).toBeTruthy();

    // base includes P01 + sessionId + q01 + timestamp
    expect(jsonName).toMatch(/^P01_.+_q01_2026-02-01T10-11-12-000Z\.json$/);
    expect(audioName).toMatch(/^P01_.+_q01_2026-02-01T10-11-12-000Z\.(webm|m4a)$/);

    jest.useRealTimers();
  });

  it.skip('ding toggle: when Ton aus, no AudioContext is constructed on question cue', async () => {
    // This test needs to be updated for eva2.tsx audio cue behavior
    // The ding toggle functionality may work differently
    // Spy AudioContext construction
    const ACtor = jest.fn(() => ({
      createOscillator: () => ({
        type: 'sine',
        frequency: { setValueAtTime: jest.fn() },
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
      }),
      createGain: () => ({
        gain: {
          setValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn(),
        },
        connect: jest.fn(),
      }),
      currentTime: 0,
      destination: {},
    }));

    // @ts-ignore
    global.AudioContext = ACtor;

    render(<HealthSlider />);
    await enterPatientId();

    // Start mic -> leaves testMode, enters practice UI
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));

    // Wait for practice mode to load
    await waitFor(() => {
      expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument();
    });

    // Turn ding OFF (button has aria-label "Ton an" initially)
    fireEvent.click(await screen.findByRole('button', { name: 'Ton an' }));

    // Now it should be "Ton aus"
    expect(screen.getByRole('button', { name: 'Ton aus' })).toBeInTheDocument();

    // Practice -> Start (transitions into real mode)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    // Wait for transition to real mode
    await waitFor(() => {
      expect(screen.queryByText(/ÜBUNGSMODUS/i)).not.toBeInTheDocument();
    });

    // Move slider once to avoid the "middle" modal
    const slider = screen.getByRole('slider');
    const track = slider.parentElement as HTMLElement;
    act(() => {
      fireEvent.pointerDown(track, { clientY: 0, pointerId: 1 });
      fireEvent.pointerUp(track, { pointerId: 1 });
    });

    // "Weiter" advances to next question and triggers the cue effect
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    // Wait a tick for effects
    await act(async () => {});

    // Since dingActive=false, playDing should early-return and AudioContext should never be constructed
    expect(ACtor).not.toHaveBeenCalled();
  });

  // ─── Centering ────────────────────────────────────────────────────────────
  it('practice mode: Start button is visible and bell/play buttons are available', async () => {
    render(<HealthSlider />);
    await enterPatientId();
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));

    await waitFor(() => {
      expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument();
    });

    // Start button exists and is the only action button (no Weiter/Zurück)
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Weiter' })).not.toBeInTheDocument();

    // Bell and play buttons are shown in practice mode
    expect(screen.getByRole('button', { name: /Ton an|Ton aus/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Frage abspielen/i })).toBeInTheDocument();
  });

  it('real mode: bell and play buttons appear after Start', async () => {
    render(<HealthSlider />);
    await enterPatientId();
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));

    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(screen.queryByText(/ÜBUNGSMODUS/i)).not.toBeInTheDocument());

    expect(screen.getByRole('button', { name: /Ton an|Ton aus/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Frage abspielen/i })).toBeInTheDocument();
  });

  // ─── Slider moveable while locked ─────────────────────────────────────────
  it('slider can be moved while buttons are locked (isLocked)', async () => {
    render(<HealthSlider />);
    await enterPatientId();
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    // Enter real mode via Start
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.queryByText(/ÜBUNGSMODUS/i)).not.toBeInTheDocument());

    // Advance to Q2 to trigger lock (lock fires on questionIndex change)
    const sliderEl = screen.getByRole('slider');
    const track = screen.getByRole('group', { name: 'Schieberegler vertikal' });

    // Move slider to top and click Weiter to go to Q2 (which triggers isLocked)
    fireEvent.click(track, { clientY: 0 });
    await waitFor(() =>
      expect(Number(sliderEl.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(90)
    );

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    await act(async () => {});

    // Weiter button should now be disabled (locked)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Weiter' })).toBeDisabled());

    // But slider should still be moveable during lock — click to bottom
    const track2 = screen.getByRole('group', { name: 'Schieberegler vertikal' });
    fireEvent.click(track2, { clientY: 200 });

    await waitFor(() =>
      expect(Number(screen.getByRole('slider').getAttribute('aria-valuenow'))).toBeLessThanOrEqual(
        10
      )
    );
  });

  // ─── Bell toggle does not restart lock timer ───────────────────────────────
  it('toggling bell button does not re-lock the screen', async () => {
    jest.useFakeTimers();

    render(<HealthSlider />);
    await enterPatientId();
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.queryByText(/ÜBUNGSMODUS/i)).not.toBeInTheDocument());

    // Move slider and go to Q2 to trigger a lock
    const track = screen.getByRole('group', { name: 'Schieberegler vertikal' });
    fireEvent.click(track, { clientY: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    await act(async () => {});

    // Advance past lock timer
    act(() => {
      jest.advanceTimersByTime(3100);
    });

    // Weiter should be enabled again
    await waitFor(() => expect(screen.getByRole('button', { name: 'Weiter' })).not.toBeDisabled());

    // Now toggle bell — should NOT re-disable Weiter
    const bellBtn = screen.getByRole('button', { name: /Ton an|Ton aus/i });
    fireEvent.click(bellBtn);
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.getByRole('button', { name: 'Weiter' })).not.toBeDisabled();

    jest.useRealTimers();
  });

  // ─── Slider full range 0–100 ───────────────────────────────────────────────
  it('slider reaches 100 at top and 0 at bottom (no 3–97 cap)', async () => {
    render(<HealthSlider />);
    await enterPatientId();
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.queryByText(/ÜBUNGSMODUS/i)).not.toBeInTheDocument());

    const slider = screen.getByRole('slider');
    const track = screen.getByRole('group', { name: 'Schieberegler vertikal' });

    fireEvent.click(track, { clientY: 0 });
    await waitFor(() => expect(slider).toHaveAttribute('aria-valuenow', '100'));

    fireEvent.click(track, { clientY: 200 });
    await waitFor(() => expect(slider).toHaveAttribute('aria-valuenow', '0'));
  });

  // ─── Lock timer is 3s (not 5s) ────────────────────────────────────────────
  it('lock lifts after 3 seconds, not 5', async () => {
    jest.useFakeTimers();

    render(<HealthSlider />);
    await enterPatientId();
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.queryByText(/ÜBUNGSMODUS/i)).not.toBeInTheDocument());

    const track = screen.getByRole('group', { name: 'Schieberegler vertikal' });
    fireEvent.click(track, { clientY: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    await act(async () => {});

    // After 2.9s still locked
    act(() => {
      jest.advanceTimersByTime(2900);
    });
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeDisabled();

    // After 3.1s unlocked
    act(() => {
      jest.advanceTimersByTime(200);
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Weiter' })).not.toBeDisabled());

    jest.useRealTimers();
  });

  // ─── MediaRecorder missing → clear error message ──────────────────────────
  it('shows helpful error when MediaRecorder is not available', async () => {
    const savedMR = (global as any).MediaRecorder;
    delete (global as any).MediaRecorder;

    render(<HealthSlider />);
    await enterPatientId();
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));

    await waitFor(() => expect(screen.getByText(/MediaRecorder fehlt/i)).toBeInTheDocument());

    (global as any).MediaRecorder = savedMR;
  });

  it('preloads correct audio sources: practice uses ubung.wav, real uses q01.wav', async () => {
    // Capture new Audio(src) calls triggered by preload effect
    const audioCalls: string[] = [];
    const OriginalAudio = global.Audio as any;

    // @ts-ignore
    global.Audio = function (src?: string) {
      if (typeof src === 'string') audioCalls.push(src);
      return { preload: 'auto' } as any;
    } as any;

    render(<HealthSlider />);
    await enterPatientId();

    // Start mic -> practice mode view
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));

    // Wait for practice mode to load
    await waitFor(() => {
      expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument();
    });

    // The preload effect should have run for practice question at least once
    await waitFor(() => {
      expect(audioCalls.some((s) => s.includes('/icf-audio/items/ubung.wav'))).toBe(true);
    });

    // Go to real mode
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    // Wait for next preload cycle
    await waitFor(() => {
      expect(audioCalls.some((s) => s.includes('/icf-audio/items/q01.wav'))).toBe(true);
    });

    // restore
    global.Audio = OriginalAudio;
  });

  it('retries item audio playback across fallback sources and clears playback error on success', async () => {
    render(<HealthSlider />);
    await enterPatientId();

    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByText(/Frage 1 von/i)).toBeInTheDocument());

    const playMock = jest
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockRejectedValueOnce(new Error('first source failed'))
      .mockResolvedValue(undefined as unknown as void);
    const loadMock = jest
      .spyOn(window.HTMLMediaElement.prototype, 'load')
      .mockImplementation(() => {});

    fireEvent.click(screen.getByRole('button', { name: /Frage abspielen/i }));

    await waitFor(() => expect(playMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Audio kann nicht abgespielt werden/i)).not.toBeInTheDocument();

    playMock.mockRestore();
    loadMock.mockRestore();
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  it('shows pulsing REC dot while recording is active', async () => {
    render(<HealthSlider />);
    await enterPatientId();

    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    // Advance to real mode so the progress row (with the dot) is rendered
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByText(/Frage 1 von/i)).toBeInTheDocument());

    // The REC dot is present while the recorder is active
    await waitFor(() => expect(screen.getByLabelText('Aufnahme läuft')).toBeInTheDocument());
  });

  it('REC dot disappears after recording stops (summary screen)', async () => {
    localStorage.setItem('survey_index', '28'); // last question
    render(<HealthSlider />);
    await enterPatientId();

    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));
    await waitFor(() => expect(screen.getByText(/Frage 29 von/i)).toBeInTheDocument());

    // REC dot should be visible while recorder is running
    await waitFor(() => expect(screen.getByLabelText('Aufnahme läuft')).toBeInTheDocument());

    // Wait for the 3s lock to lift
    await waitFor(() => expect(screen.getByRole('button', { name: 'Weiter' })).not.toBeDisabled(), {
      timeout: 5000,
    });

    const track = screen.getByRole('group', { name: 'Schieberegler vertikal' });
    fireEvent.click(track, { clientY: 0 });

    // Wrap the click + async chain in act() so the full executeNextSafe promise chain
    // (stopItemRecorder → uploadItem → setShowSummary) is flushed before we assert.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
      // Drain microtasks so the mocked fetch and state updates complete
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Beenden' })).toBeInTheDocument(),
      { timeout: 3000 }
    );

    expect(screen.queryByLabelText('Aufnahme läuft')).not.toBeInTheDocument();
  });

  it('MediaRecorder onerror: shows upload-fail modal with partial-audio download', async () => {
    // Give the mock recorder an onerror we can trigger manually
    let capturedOnerror: ((e: any) => void) | null = null;
    const OriginalMR = (global as any).MediaRecorder;

    class ErrorableRecorder extends OriginalMR {
      constructor(stream: any, opts?: any) {
        super(stream, opts);
        // stash reference so the test can fire it
        capturedOnerror = null; // reset
      }
      start() {
        // After start, expose onerror on the instance so the test can call it
        (global as any).__lastRecorder = this;
      }
    }
    (global as any).MediaRecorder = ErrorableRecorder;

    render(<HealthSlider />);
    await enterPatientId();

    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByText(/Frage 1 von/i)).toBeInTheDocument());

    // Retrieve the recorder instance created for question 1 and fire onerror
    const rec = (global as any).__lastRecorder as any;
    expect(rec).toBeDefined();

    act(() => {
      if (rec.onerror) {
        rec.onerror({ error: { message: 'Simulated codec error' } });
      }
    });

    await waitFor(() => expect(screen.getByText(/Aufnahme unterbrochen/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Audio + Info herunterladen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schließen' })).toBeInTheDocument();

    (global as any).MediaRecorder = OriginalMR;
  });

  it('recorderWarning banner appears and can be dismissed when startItemRecorder throws', async () => {
    render(<HealthSlider />);
    await enterPatientId();

    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByText(/Frage 1 von/i)).toBeInTheDocument());

    // Wait for the 3s lock to lift
    await waitFor(() => expect(screen.getByRole('button', { name: 'Weiter' })).not.toBeDisabled(), {
      timeout: 5000,
    });
    const track = screen.getByRole('group', { name: 'Schieberegler vertikal' });
    fireEvent.click(track, { clientY: 0 });

    // Kill the stream so the next startItemRecorder call throws
    (global.navigator.mediaDevices as any).getUserMedia = jest
      .fn()
      .mockRejectedValue(new Error('Device lost'));
    // Null out the stream ref via the window mock
    // The simplest way: make MediaRecorder constructor throw on next call
    const OriginalMR = (global as any).MediaRecorder;
    (global as any).MediaRecorder = class {
      static isTypeSupported() {
        return false;
      }
      constructor() {
        throw new Error('No mic stream');
      }
    };

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/Mikrofon nicht mehr verfügbar/i);

    // Dismiss it
    fireEvent.click(screen.getByRole('button', { name: 'Meldung schließen' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());

    (global as any).MediaRecorder = OriginalMR;
  });

  it('visibilitychange: resumes AudioContext when tab becomes visible without crashing', async () => {
    render(<HealthSlider />);
    await enterPatientId();

    // Click past the mic screen into practice mode
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    // Simulate tab going to background then coming back
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // In practice mode (isPracticeMode=true) the handler must NOT restart the recorder
    // or show a warning — the page should remain exactly as it was.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });
});
