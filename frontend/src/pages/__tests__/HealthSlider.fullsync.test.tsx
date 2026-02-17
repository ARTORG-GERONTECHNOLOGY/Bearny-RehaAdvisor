import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import HealthSlider from '../HealthSlider';

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

  beforeEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();

    window.prompt = jest.fn(() => 'P01') as any;
    window.alert = jest.fn() as any;

    jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
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
      // @ts-ignore
      return document.createElement.wrappedMethod(tagName);
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
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));

    await waitFor(() => {
      expect(localStorage.getItem('patient_id')).toBe('P01');
    });

    expect(screen.getByText(/ID: P01/)).toBeInTheDocument();
  });

  it('shows “middle slider” modal if user clicks Weiter without moving (still 50)', async () => {
    render(<HealthSlider />);
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));

    // in practice mode -> "Start" button (not Weiter yet)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    // now in real mode -> Weiter exists
    fireEvent.click(await screen.findByRole('button', { name: 'Weiter' }));

    expect(
      await screen.findByText(/Möchten Sie den Schieber in der Mitte belassen/i)
    ).toBeInTheDocument();
  });

  it('sliderPosition resets to 50 after next (practice → real), and after successful real Next', async () => {
    render(<HealthSlider />);
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));

    // Practice -> Start should reset to 50 (it already is, but we prove it can move and is reset)
    const slider = screen.getByRole('slider');
    const track = slider.parentElement as HTMLElement;

    // move slider (pointer down at top => ~97)
    act(() => {
      fireEvent.pointerDown(track, { clientY: 0, pointerId: 1 });
      fireEvent.pointerUp(track, { pointerId: 1 });
    });

    expect(Number(slider.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(90);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '50');

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

  it('corrupted localStorage survey_index shows warning banner and clears keys', async () => {
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

  it('upload failure opens modal and download filenames include patientId + sessionId + qXX + timestamp', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-01T10:11:12.000Z'));

    // make upload fail
    (window.fetch as any).mockResolvedValueOnce({ ok: false, status: 500 });

    render(<HealthSlider />);
    fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));

    // practice -> Start
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

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
});
it('ding toggle: when Ton aus, no AudioContext is constructed on question cue', async () => {
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

  // Start mic -> leaves testMode, enters practice UI
  fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));

  // Turn ding OFF (button has aria-label "Ton an" initially)
  fireEvent.click(await screen.findByRole('button', { name: 'Ton an' }));

  // Now it should be "Ton aus"
  expect(screen.getByRole('button', { name: 'Ton aus' })).toBeInTheDocument();

  // Practice -> Start (transitions into real mode)
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));

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

it('preloads correct audio sources: practice uses ubung.m4a, real uses q01.m4a', async () => {
  // Capture new Audio(src) calls triggered by preload effect
  const audioCalls: string[] = [];
  const OriginalAudio = global.Audio as any;

  // @ts-ignore
  global.Audio = function (src?: string) {
    if (typeof src === 'string') audioCalls.push(src);
    return { preload: 'auto' } as any;
  } as any;

  render(<HealthSlider />);

  // Start mic -> practice mode view
  fireEvent.click(screen.getByRole('button', { name: /Übungslauf starten/i }));

  // The preload effect should have run for practice question at least once
  await waitFor(() => {
    expect(audioCalls.some((s) => s.includes('/audio/items/ubung.m4a'))).toBe(true);
  });

  // Go to real mode
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));

  // Wait for next preload cycle
  await waitFor(() => {
    expect(audioCalls.some((s) => s.includes('/audio/items/q01.m4a'))).toBe(true);
  });

  // restore
  global.Audio = OriginalAudio;
});
