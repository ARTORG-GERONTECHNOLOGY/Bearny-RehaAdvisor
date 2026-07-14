import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import HealthSlider from '@/pages/eva2';

const renderICF = (initialPath = '/icf') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/icf/:patientId?" element={<HealthSlider />} />
      </Routes>
    </MemoryRouter>
  );

function mockMedia() {
  // mock getUserMedia
  const getUserMedia = jest.fn().mockResolvedValue({
    getTracks: () => [{ stop: jest.fn() }],
  });

  // @ts-expect-error -- assigning to read-only navigator.mediaDevices in jsdom
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
  // @ts-expect-error -- replacing global MediaRecorder with mock class in jsdom
  global.MediaRecorder = MockMediaRecorder;

  return { getUserMedia };
}

describe('HealthSlider (Full Sync)', () => {
  const originalPrompt = window.prompt;
  const originalAlert = window.alert;

  // Helper to enter patient ID (since eva2 uses form, not prompt)
  const enterPatientId = async (patientId = 'P001-001T1') => {
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: patientId } });
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Teilnehmer:in-ID' })).not.toBeInTheDocument();
    });
  };

  // Click through the two intro screens (AssistanceScreen → DeviceScreen) to
  // reach practice mode. startMic() is called after the device selection.
  const startPracticeMode = async () => {
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));
    fireEvent.click(screen.getByRole('button', { name: /Alleine/i }));
    fireEvent.click(screen.getByRole('button', { name: /Smartphone, Handy/i }));
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();

    window.prompt = jest.fn(() => 'P001-001T1') as any;
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

    // capture downloads — use real anchor nodes (not plain objects) so that
    // document.body.appendChild(a) in downloadBlob doesn't throw; only stub
    // click() so jsdom doesn't attempt to navigate.
    const created: any[] = [];
    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'a') {
        const a = originalCreateElement('a') as HTMLAnchorElement;
        a.click = jest.fn();
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

  it('prompts for patient id (Pxxx-xxxTx) and stores it', async () => {
    renderICF();
    await enterPatientId();

    // Patient ID is encoded in the URL (no localStorage write) — verify it
    // appears in the footer once we enter the survey proper.
    await startPracticeMode();

    await waitFor(() => {
      expect(screen.getByText(/ID: P001-001T1/)).toBeInTheDocument();
    });
  });

  it('shows "middle slider" modal if user clicks Weiter without moving (still 50)', async () => {
    jest.useFakeTimers();

    renderICF();
    await enterPatientId();
    await startPracticeMode();
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

    // now in real mode -> advance past the 3s question lock, then click Weiter
    act(() => {
      jest.advanceTimersByTime(3100);
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Weiter' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    expect(
      await screen.findByText(/Möchten Sie den Schieber in der Mitte belassen/i)
    ).toBeInTheDocument();

    jest.useRealTimers();
  });

  it('sliderPosition resets to 50 after next (practice → real), and after successful real Next', async () => {
    jest.useFakeTimers();

    renderICF();
    await enterPatientId();
    await startPracticeMode();

    // Wait for practice mode to load
    await waitFor(() => {
      expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument();
    });

    // Practice -> Start should reset to 50 (it already is, but we prove it can move and is reset)
    const slider = screen.getByRole('slider');
    const track = screen.getByRole('group', { name: 'Schieberegler vertikal' });

    // move slider (click at top => 100)
    fireEvent.click(track, { clientY: 0 });

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

    // advance past the 3s question lock before interacting again
    act(() => {
      jest.advanceTimersByTime(3100);
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Weiter' })).not.toBeDisabled());

    // move slider again for Q1 so we avoid modal
    const track2 = screen.getByRole('group', { name: 'Schieberegler vertikal' });
    fireEvent.click(track2, { clientY: 0 });

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    // after successful upload -> it advances and resets to 50
    await waitFor(() => {
      expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '50');
    });

    jest.useRealTimers();
  });

  it('upload failure opens modal and download filenames include patientId + sessionId + qXX + timestamp', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-01T10:11:12.000Z').getTime());

    // make upload fail
    (window.fetch as any).mockResolvedValueOnce({ ok: false, status: 500 });

    renderICF();
    await enterPatientId();
    await startPracticeMode();

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

    // move slider so the "still 50" modal doesn't block
    const track = screen.getByRole('group', { name: 'Schieberegler vertikal' });
    fireEvent.click(track, { clientY: 0 });

    // let the 3s question lock lift, then pin the clock back to the fixed instant
    // so the downloaded filenames carry the exact expected timestamp
    act(() => {
      jest.advanceTimersByTime(3100);
    });
    jest.setSystemTime(new Date('2026-02-01T10:11:12.000Z').getTime());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Weiter' })).not.toBeDisabled());

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

    // base includes patientId + sessionId + q01 + timestamp. The millisecond
    // component may drift slightly because RTL auto-advances fake timers while
    // polling (findByText), so only the date/time-to-the-second is asserted exactly.
    expect(jsonName).toMatch(/^P001-001T1_.+_q01_2026-02-01T10-11-12-\d{3}Z\.json$/);
    expect(audioName).toMatch(/^P001-001T1_.+_q01_2026-02-01T10-11-12-\d{3}Z\.(webm|m4a)$/);

    jest.useRealTimers();
  }, 10_000);

  it('ding toggle: when Ton aus, no ding is played for the question cue', async () => {
    // jsdom has no real AudioContext, so other tests rely on it being absent
    // (the component's try/catch around AudioContext usage silently no-ops).
    // Save/restore it here so this test's mock doesn't leak into later tests.
    const originalAudioContext = (global as any).AudioContext;

    // The shared AudioContext is also used to route <audio> playback, so it gets
    // constructed as soon as the survey view mounts regardless of the ding toggle.
    // What the toggle actually gates is whether playDing() calls createOscillator(),
    // so that's what we spy on here instead of the AudioContext constructor itself.
    const createOscillator = jest.fn(() => ({
      type: 'sine',
      frequency: { setValueAtTime: jest.fn() },
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    }));
    const ACtor = jest.fn(() => ({
      createOscillator,
      createGain: () => ({
        gain: {
          setValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn(),
        },
        connect: jest.fn(),
      }),
      createMediaElementSource: () => ({ connect: jest.fn() }),
      createMediaStreamSource: () => ({ connect: jest.fn() }),
      createMediaStreamDestination: () => ({ stream: {} }),
      resume: jest.fn().mockResolvedValue(undefined),
      currentTime: 0,
      destination: {},
    }));

    // @ts-expect-error -- replacing global AudioContext with mock constructor in jsdom
    global.AudioContext = ACtor;

    jest.useFakeTimers();

    try {
      renderICF();
      await enterPatientId();

      // Start mic -> leaves testMode, enters practice UI
      await startPracticeMode();

      // Wait for practice mode to load
      await waitFor(() => {
        expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument();
      });

      // The initial cue for the practice question already rang (dingActive=true by default)
      await waitFor(() => expect(createOscillator).toHaveBeenCalledTimes(1));

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

      // advance past the 3s question lock before interacting again
      act(() => {
        jest.advanceTimersByTime(3100);
      });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Weiter' })).not.toBeDisabled()
      );

      // Move slider once to avoid the "middle" modal
      const track = screen.getByRole('group', { name: 'Schieberegler vertikal' });
      fireEvent.click(track, { clientY: 0 });

      // "Weiter" advances to next question and triggers the cue effect
      fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

      await waitFor(() => expect(screen.getByText('/ 29')).toBeInTheDocument());
      await act(async () => {});

      // Since dingActive=false, playDing should early-return before creating a new oscillator
      expect(createOscillator).toHaveBeenCalledTimes(1);
    } finally {
      global.AudioContext = originalAudioContext;
      jest.useRealTimers();
    }
  });

  // ─── Centering ────────────────────────────────────────────────────────────
  it('practice mode: Start button is visible and bell/play buttons are available', async () => {
    renderICF();
    await enterPatientId();
    await startPracticeMode();

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
    renderICF();
    await enterPatientId();
    await startPracticeMode();

    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(screen.queryByText(/ÜBUNGSMODUS/i)).not.toBeInTheDocument());

    expect(screen.getByRole('button', { name: /Ton an|Ton aus/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Frage abspielen/i })).toBeInTheDocument();
  });

  // ─── Slider moveable while locked ─────────────────────────────────────────
  it('slider can be moved while buttons are locked (isLocked)', async () => {
    renderICF();
    await enterPatientId();
    await startPracticeMode();
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

    renderICF();
    await enterPatientId();
    await startPracticeMode();
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
    renderICF();
    await enterPatientId();
    await startPracticeMode();
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

    renderICF();
    await enterPatientId();
    await startPracticeMode();
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

    renderICF();
    await enterPatientId();
    await startPracticeMode();

    await waitFor(() => expect(screen.getByText(/MediaRecorder fehlt/i)).toBeInTheDocument());

    (global as any).MediaRecorder = savedMR;
  });

  it('preloads correct audio sources: practice uses ubung.wav, real uses q01.wav', async () => {
    // Capture new Audio(src) calls triggered by preload effect
    const audioCalls: string[] = [];
    const OriginalAudio = global.Audio as any;

    // @ts-expect-error -- replacing global Audio with mock function in jsdom
    global.Audio = function (src?: string) {
      if (typeof src === 'string') audioCalls.push(src);
      return { preload: 'auto' } as any;
    } as any;

    renderICF();
    await enterPatientId();

    // Start mic -> practice mode view
    await startPracticeMode();

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
    renderICF();
    await enterPatientId();

    await startPracticeMode();
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByText('/ 29')).toBeInTheDocument());

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
    renderICF();
    await enterPatientId();

    await startPracticeMode();
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    // Advance to real mode so the progress row (with the dot) is rendered
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByText('/ 29')).toBeInTheDocument());

    // The REC dot is present while the recorder is active
    await waitFor(() => expect(screen.getByLabelText('Aufnahme läuft')).toBeInTheDocument());
  });

  it('REC dot disappears after recording stops (summary screen)', async () => {
    jest.useFakeTimers();

    // Pre-seed a mid-survey state at the last question. The mic auto-restarts on
    // resume (survey_sessionId present), so the REC dot IS shown during the survey.
    mockMedia();
    localStorage.setItem('survey_index', '28');
    localStorage.setItem('survey_sessionId', 'test-session');
    renderICF('/icf/P001-001T1');

    // Survey opens at Q29 with mic auto-started — REC dot should appear
    await waitFor(() => expect(screen.getByText('/ 29')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText('Aufnahme läuft')).toBeInTheDocument());

    // Advance past the 3s lock then submit the last answer via "Kann ich nicht
    // beantworten" — this bypasses the slider-moved guard so state-flush order
    // doesn't matter.
    const naBtn = screen.getByRole('button', { name: 'Kann ich nicht beantworten' });
    act(() => {
      jest.advanceTimersByTime(3100);
    });
    await waitFor(() => expect(naBtn).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(naBtn);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Summary screen appears (no Beenden button — removed in this branch)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Vielen Dank/ })).toBeInTheDocument()
    );
    expect(screen.queryByLabelText('Aufnahme läuft')).not.toBeInTheDocument();

    jest.useRealTimers();
  });

  it('MediaRecorder onerror: shows upload-fail modal with partial-audio download', async () => {
    // Give the mock recorder an onerror we can trigger manually
    const OriginalMR = (global as any).MediaRecorder;

    class ErrorableRecorder extends OriginalMR {
      constructor(stream: any, opts?: any) {
        super(stream, opts);
        // stash reference so the test can fire it
      }
      start() {
        // After start, expose onerror on the instance so the test can call it
        (global as any).__lastRecorder = this;
      }
    }
    (global as any).MediaRecorder = ErrorableRecorder;

    renderICF();
    await enterPatientId();

    await startPracticeMode();
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByText('/ 29')).toBeInTheDocument());

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
    jest.useFakeTimers();

    renderICF();
    await enterPatientId();

    await startPracticeMode();
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByText('/ 29')).toBeInTheDocument());

    // Advance past the 3s lock
    act(() => {
      jest.advanceTimersByTime(3100);
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Weiter' })).not.toBeDisabled());
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
    jest.useRealTimers();
  });

  it('visibilitychange: resumes AudioContext when tab becomes visible without crashing', async () => {
    renderICF();
    await enterPatientId();

    // Click past the mic screen into practice mode
    await startPracticeMode();
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

  // ─── Info overlay ─────────────────────────────────────────────────────────

  it('Info button opens the info overlay', async () => {
    renderICF();
    await enterPatientId();
    await startPracticeMode();
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Information' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Information' })).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'zurück' })).toBeInTheDocument();
    // Survey content remains in the DOM behind the overlay
    expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument();
  });

  it('"zurück" button closes the info overlay and leaves the survey intact', async () => {
    renderICF();
    await enterPatientId();
    await startPracticeMode();
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Information' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'zurück' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'zurück' }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Information' })).not.toBeInTheDocument()
    );
    // Survey is still present
    expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('info overlay shows the recording indicator when a recording is active', async () => {
    renderICF();
    await enterPatientId();
    await startPracticeMode();
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    // Enter real mode so the progress-row REC dot is rendered
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByText('/ 29')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText('Aufnahme läuft')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Information' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Information' })).toBeInTheDocument()
    );

    // The overlay's own recording indicator is rendered alongside the progress-row dot
    expect(screen.getAllByLabelText('Aufnahme läuft')).toHaveLength(2);
    expect(screen.getByText('Aufnahme läuft')).toBeInTheDocument();
  });

  it('closing the info overlay does not interrupt recording', async () => {
    renderICF();
    await enterPatientId();
    await startPracticeMode();
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByText('/ 29')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText('Aufnahme läuft')).toBeInTheDocument());

    // Open then close the info overlay
    fireEvent.click(screen.getByRole('button', { name: 'Information' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'zurück' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'zurück' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'zurück' })).not.toBeInTheDocument()
    );

    // The progress-row REC dot must still be present — recording was not stopped
    expect(screen.getByLabelText('Aufnahme läuft')).toBeInTheDocument();
  });

  // ─── Refresh / resume edge cases ──────────────────────────────────────────

  it('refresh during practice mode (survey_sessionId set, no survey_index) shows practice mode, not StartScreen', async () => {
    // Simulate a page refresh that happened while the user was in practice mode.
    // survey_sessionId is written to localStorage when mic starts, before practice
    // mode is shown. survey_index is only written when real-mode answers are saved.
    localStorage.setItem('survey_sessionId', 'practice-session-abc');
    // Deliberately NO survey_index

    renderICF('/icf/P001-001T1');

    // Must NOT show the welcome screen (testMode should be false)
    expect(screen.queryByText('Willkommen')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Übungslauf starten/i })).not.toBeInTheDocument();

    // Must show practice mode
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('fresh start with no localStorage shows PatientIdScreen', () => {
    // Ensure nothing in localStorage and no URL param
    renderICF();
    expect(screen.getByRole('heading', { name: 'Teilnehmer:in-ID' })).toBeInTheDocument();
    expect(screen.queryByText('Willkommen')).not.toBeInTheDocument();
    expect(screen.queryByText(/ÜBUNGSMODUS/i)).not.toBeInTheDocument();
  });

  it('localStorage is cleared when the last answer is submitted', async () => {
    jest.useFakeTimers();

    localStorage.setItem('survey_index', '28');
    localStorage.setItem('survey_sessionId', 'end-session');

    renderICF('/icf/P001-001T1');
    await waitFor(() => expect(screen.getByText('/ 29')).toBeInTheDocument());

    const naBtn = screen.getByRole('button', { name: 'Kann ich nicht beantworten' });
    act(() => {
      jest.advanceTimersByTime(3100);
    });
    await waitFor(() => expect(naBtn).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(naBtn);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Vielen Dank/ })).toBeInTheDocument()
    );

    expect(localStorage.getItem('survey_index')).toBeNull();
    expect(localStorage.getItem('survey_sessionId')).toBeNull();

    jest.useRealTimers();
  });

  it('end screen has no Beenden button and no Weiter button', async () => {
    jest.useFakeTimers();

    localStorage.setItem('survey_index', '28');
    localStorage.setItem('survey_sessionId', 'end-session-2');

    renderICF('/icf/P001-001T1');
    await waitFor(() => expect(screen.getByText('/ 29')).toBeInTheDocument());

    const naBtn = screen.getByRole('button', { name: 'Kann ich nicht beantworten' });
    act(() => {
      jest.advanceTimersByTime(3100);
    });
    await waitFor(() => expect(naBtn).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(naBtn);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Vielen Dank/ })).toBeInTheDocument()
    );

    expect(screen.queryByRole('button', { name: 'Beenden' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Weiter' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Kann ich nicht beantworten' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Sie haben alles geschafft!')).toBeInTheDocument();

    jest.useRealTimers();
  });

  it('survey_index is written to localStorage when advancing from question 1 to question 2', async () => {
    jest.useFakeTimers();

    renderICF();
    await enterPatientId();
    await startPracticeMode();
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    // Practice → real
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByText('/ 29')).toBeInTheDocument());

    // Advance past the lock timer
    act(() => {
      jest.advanceTimersByTime(3100);
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Weiter' })).not.toBeDisabled());

    // survey_index = 0 for question 1 should already be in localStorage
    expect(localStorage.getItem('survey_index')).toBe('0');
    expect(localStorage.getItem('survey_sessionId')).not.toBeNull();

    // Advance to Q2
    fireEvent.click(screen.getByRole('button', { name: 'Kann ich nicht beantworten' }));
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => expect(localStorage.getItem('survey_index')).toBe('1'));

    jest.useRealTimers();
  });

  it('rejects a malformed patient id and shows the format error', async () => {
    renderICF();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'not-a-valid-id' } });
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    expect(
      await screen.findByText(/ID muss dem Format Pxxx-xxxTx entsprechen/i)
    ).toBeInTheDocument();
  });

  it.each([
    ['NotAllowedError', /Mikrofon blockiert/i],
    ['NotFoundError', /Kein Mikrofon gefunden/i],
    ['NotReadableError', /Mikrofon belegt/i],
    ['SomeOtherError', /Mikrofon-Fehler: SomeOtherError/i],
  ])('maps getUserMedia error name %s to a helpful message', async (name, expectedMessage) => {
    renderICF();
    await enterPatientId();

    const err = new Error('boom');
    (err as any).name = name;
    (global.navigator.mediaDevices.getUserMedia as jest.Mock).mockRejectedValueOnce(err);

    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));
    fireEvent.click(screen.getByRole('button', { name: /Alleine/i }));
    fireEvent.click(screen.getByRole('button', { name: /Smartphone, Handy/i }));

    expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
  });

  it('shows a browser-unsupported message when getUserMedia is entirely unavailable', async () => {
    renderICF();
    await enterPatientId();

    // @ts-expect-error -- simulate a browser with no mediaDevices API at all
    delete global.navigator.mediaDevices;

    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));
    fireEvent.click(screen.getByRole('button', { name: /Alleine/i }));
    fireEvent.click(screen.getByRole('button', { name: /Smartphone, Handy/i }));

    expect(
      await screen.findByText(/Dieser Browser unterstützt Mikrofon-Aufnahmen nicht/i)
    ).toBeInTheDocument();
  });

  it('shows a recorder warning when starting the recorder fails during the practice-to-real transition', async () => {
    renderICF();
    await enterPatientId();
    await startPracticeMode();
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    // Make the next MediaRecorder construction (triggered by the Start click) throw.
    const OriginalMR = (global as any).MediaRecorder;
    (global as any).MediaRecorder = class {
      static isTypeSupported() {
        return false;
      }
      constructor() {
        throw new Error('No mic stream');
      }
    };

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/Mikrofon nicht mehr verfügbar/i);

    (global as any).MediaRecorder = OriginalMR;
  });

  it('shows an audio error when the hidden <audio> element fires an error event', async () => {
    renderICF();
    await enterPatientId();
    await startPracticeMode();
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    const audioEl = document.querySelector('audio')!;
    fireEvent.error(audioEl);

    expect(
      await screen.findByText(/Audio-Datei nicht gefunden oder nicht unterstützt/i)
    ).toBeInTheDocument();
  });

  it('keeps the slider at its current value when "Belassen und weiter" is clicked from the middle-slider modal', async () => {
    jest.useFakeTimers();

    renderICF();
    await enterPatientId();
    await startPracticeMode();
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByText('/ 29')).toBeInTheDocument());
    act(() => {
      jest.advanceTimersByTime(3100);
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Weiter' })).not.toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(
      await screen.findByText(/Möchten Sie den Schieber in der Mitte belassen/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Belassen und weiter' }));

    await waitFor(() => {
      expect(
        screen.queryByText(/Möchten Sie den Schieber in der Mitte belassen/i)
      ).not.toBeInTheDocument();
    });

    jest.useRealTimers();
  });

  it('resizes icon sizes when the window crosses the mobile breakpoint', async () => {
    renderICF();
    await enterPatientId();
    await startPracticeMode();
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 400 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    await waitFor(() => {
      const infoBtn = screen.getByRole('button', { name: 'Information' });
      expect(infoBtn.querySelector('svg')).toHaveAttribute('width', '30');
    });

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  it('falls back to fetching the audio as a blob when direct playback fails for every candidate source', async () => {
    renderICF();
    await enterPatientId();
    await startPracticeMode();
    await waitFor(() => expect(screen.getByText(/ÜBUNGSMODUS/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByText('/ 29')).toBeInTheDocument());

    const playMock = jest
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockImplementation(function (this: HTMLMediaElement) {
        if (this.src.startsWith('blob:')) return Promise.resolve();
        return Promise.reject(new Error('direct playback failed'));
      });
    const loadMock = jest
      .spyOn(window.HTMLMediaElement.prototype, 'load')
      .mockImplementation(() => {});
    (window.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'audio/wav' },
      blob: () => Promise.resolve(new Blob(['x'], { type: 'audio/wav' })),
    });

    fireEvent.click(screen.getByRole('button', { name: /Frage abspielen/i }));

    await waitFor(() => expect(playMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText(/Audio kann nicht abgespielt werden/i)).not.toBeInTheDocument()
    );

    playMock.mockRestore();
    loadMock.mockRestore();
  });
});
