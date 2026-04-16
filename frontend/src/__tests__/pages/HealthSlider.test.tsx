import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import HealthSlider from '@/pages/eva';

describe('HealthSlider', () => {
  const originalPrompt = window.prompt;
  const originalAlert = window.alert;
  const originalCreateElement = document.createElement.bind(document);

  function setLocalStorage(key: string, value: string) {
    window.localStorage.setItem(key, value);
  }

  beforeEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();

    window.prompt = jest.fn(() => 'PAT_123') as any;
    window.alert = jest.fn() as any;

    jest.spyOn(window.location, 'reload').mockImplementation(() => {});

    // Mock URL methods before spying on them
    if (!URL.createObjectURL) {
      URL.createObjectURL = jest.fn();
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = jest.fn();
    }

    jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    jest.spyOn(document.body, 'appendChild');
    jest.spyOn(document.body, 'removeChild');

    // mock anchor - create real element but spy on click
    jest.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'a') {
        const a = originalCreateElement('a') as HTMLAnchorElement;
        a.click = jest.fn();
        return a;
      }
      return originalCreateElement(tagName);
    }) as any);

    // stable bounding box for slider math
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      width: 140,
      height: 200,
      right: 140,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as any);
  });

  afterAll(() => {
    window.prompt = originalPrompt;
    window.alert = originalAlert;
  });

  it('prompts for patient id on first mount and stores it', () => {
    render(<HealthSlider />);
    expect(window.prompt).toHaveBeenCalled();
    expect(window.localStorage.getItem('patient_id')).toBe('PAT_123');
    expect(screen.getByText('ID: PAT_123')).toBeInTheDocument();
  });

  it('does NOT prompt if patient_id exists, uses stored id', () => {
    setLocalStorage('patient_id', 'ABC');
    render(<HealthSlider />);
    expect(window.prompt).not.toHaveBeenCalled();
    expect(screen.getByText('ID: ABC')).toBeInTheDocument();
  });

  it('restores progress from localStorage: questionIndex, answers, testMode, showSummary', () => {
    setLocalStorage('patient_id', 'ABC');
    setLocalStorage('survey_index', '2');
    setLocalStorage(
      'survey_answers',
      JSON.stringify([
        ['Q1', 10],
        ['Q2', -1],
      ])
    );
    setLocalStorage('survey_testMode', 'false');
    setLocalStorage('survey_showSummary', 'false');

    render(<HealthSlider />);
    expect(screen.getByText(/Frage 3 von/)).toBeInTheDocument();
  });

  it('auto-saves to localStorage when state changes (goNext)', () => {
    setLocalStorage('patient_id', 'ABC');
    render(<HealthSlider />);

    fireEvent.click(screen.getByRole('button', { name: 'Interview starten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kann ich nicht beantworten' }));

    expect(window.localStorage.getItem('survey_testMode')).toBe('false');
    expect(window.localStorage.getItem('survey_index')).toBe('1');

    const savedAnswers = JSON.parse(window.localStorage.getItem('survey_answers') || '[]');
    expect(savedAnswers.length).toBe(1);
    expect(savedAnswers[0][1]).toBe(-1);
  });

  it('goBack removes last answer and decrements index (non-test mode)', () => {
    setLocalStorage('patient_id', 'ABC');
    render(<HealthSlider />);

    fireEvent.click(screen.getByRole('button', { name: 'Interview starten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));

    expect(window.localStorage.getItem('survey_index')).toBe('0');
    const savedAnswers = JSON.parse(window.localStorage.getItem('survey_answers') || '[]');
    expect(savedAnswers.length).toBe(0);
  });

  it('disables Zurück in testMode or at first question', () => {
    setLocalStorage('patient_id', 'ABC');
    render(<HealthSlider />);

    expect(screen.getByRole('button', { name: 'Zurück' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Interview starten' }));
    expect(screen.getByRole('button', { name: 'Zurück' })).toBeDisabled();
  });

  it('clicking track changes slider aria-valuenow (full range 0..100)', () => {
    setLocalStorage('patient_id', 'ABC');
    render(<HealthSlider />);

    fireEvent.click(screen.getByRole('button', { name: 'Interview starten' }));
    const slider = screen.getByRole('slider', { name: 'Wert einstellen' });

    fireEvent.click(screen.getByRole('group', { name: 'Schieberegler vertikal' }), { clientY: 0 });
    expect(slider).toHaveAttribute('aria-valuenow', '100');

    fireEvent.click(screen.getByRole('group', { name: 'Schieberegler vertikal' }), {
      clientY: 200,
    });
    expect(slider).toHaveAttribute('aria-valuenow', '0');
  });

  it('dragging knob updates sliderPosition via global mousemove when isDragging=true', () => {
    setLocalStorage('patient_id', 'ABC');
    render(<HealthSlider />);

    fireEvent.click(screen.getByRole('button', { name: 'Interview starten' }));
    const slider = screen.getByRole('slider', { name: 'Wert einstellen' });

    fireEvent.mouseDown(slider);

    act(() => {
      fireEvent.mouseMove(window, { clientY: 100 });
    });

    const v = Number(slider.getAttribute('aria-valuenow'));
    expect(v).toBeGreaterThanOrEqual(45);
    expect(v).toBeLessThanOrEqual(55);

    act(() => {
      fireEvent.mouseUp(window);
    });
  });

  it('touchmove prevents default when cancelable and dragging', () => {
    setLocalStorage('patient_id', 'ABC');
    render(<HealthSlider />);

    fireEvent.click(screen.getByRole('button', { name: 'Interview starten' }));
    const slider = screen.getByRole('slider', { name: 'Wert einstellen' });

    fireEvent.touchStart(slider, { touches: [{ clientY: 50 }] });

    const preventDefault = jest.fn();
    const touchEvent = new Event('touchmove', { bubbles: true, cancelable: true }) as any;
    touchEvent.touches = [{ clientY: 50 }];
    touchEvent.preventDefault = preventDefault;

    act(() => {
      window.dispatchEvent(touchEvent);
    });

    expect(preventDefault).toHaveBeenCalled();
  });

  it('finishing last question shows summary with "Bestätigen & Exportieren"', () => {
    setLocalStorage('patient_id', 'ABC');
    setLocalStorage('survey_testMode', 'false');
    // last index (len=29 -> last=28)
    setLocalStorage('survey_index', '28');
    setLocalStorage('survey_answers', JSON.stringify([]));
    setLocalStorage('survey_showSummary', 'false');

    render(<HealthSlider />);

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByRole('button', { name: 'Bestätigen & Exportieren' })).toBeInTheDocument();
  });

  it('confirmAndExport: creates CSV, alerts, clears survey keys + patient_id, resets state and reloads', () => {
    setLocalStorage('patient_id', 'ABC');
    setLocalStorage('survey_testMode', 'false');
    setLocalStorage('survey_showSummary', 'true');
    setLocalStorage(
      'survey_answers',
      JSON.stringify([
        ['Q1', 10],
        ['Q2', -1],
      ])
    );
    setLocalStorage('survey_index', '1');

    const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');

    render(<HealthSlider />);

    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen & Exportieren' }));

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith('Fragebogen abgeschlossen!');

    // Verify removeItem was called for each key
    expect(removeItemSpy).toHaveBeenCalledWith('survey_index');
    expect(removeItemSpy).toHaveBeenCalledWith('survey_answers');
    expect(removeItemSpy).toHaveBeenCalledWith('survey_testMode');
    expect(removeItemSpy).toHaveBeenCalledWith('survey_showSummary');
    expect(removeItemSpy).toHaveBeenCalledWith('patient_id');

    expect(window.location.reload).toHaveBeenCalled();
  });

  it('does not render reset link in footer', () => {
    setLocalStorage('patient_id', 'ABC');
    setLocalStorage('survey_index', '3');

    render(<HealthSlider />);

    expect(
      screen.queryByRole('button', { name: 'Alle Daten löschen & Reset' })
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem('patient_id')).toBe('ABC');
    expect(window.localStorage.getItem('survey_index')).toBe('3');
  });

  it('cleans up global listeners on unmount', () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    const removeSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = render(<HealthSlider />);

    expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: false });
    expect(addSpy).toHaveBeenCalledWith('touchend', expect.any(Function));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('touchmove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('touchend', expect.any(Function));
  });

  // ✅ NEW: CSV filename includes patient id + version + date
  it('export CSV filename includes patient id + version + date', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-23T10:15:00.000Z').getTime());

    setLocalStorage('patient_id', 'PAT_777');
    setLocalStorage('survey_testMode', 'false');
    setLocalStorage('survey_showSummary', 'true');
    setLocalStorage('survey_answers', JSON.stringify([['Q1', 10]]));
    setLocalStorage('survey_index', '0');

    const clickSpy = jest.fn();
    (document.createElement as jest.Mock).mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        const a = originalCreateElement('a') as HTMLAnchorElement;
        a.click = clickSpy;
        return a;
      }
      return originalCreateElement(tagName);
    });

    render(<HealthSlider />);

    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen & Exportieren' }));

    expect(clickSpy).toHaveBeenCalled();

    const results = (document.createElement as jest.Mock).mock.results.map((r) => r.value);
    const lastAnchor = [...results]
      .reverse()
      .find((v) => v && typeof v === 'object' && 'download' in v);
    expect(lastAnchor).toBeTruthy();

    const filename = (lastAnchor as any).download as string;

    const expectedVersionPart = 'Version_8_1_Auto_Save_23_01_2026';
    const expectedDatePart = '2026-01-23';

    expect(filename).toContain(`SUBJ_PAT_777-${expectedVersionPart}-Date_${expectedDatePart}.csv`);

    jest.useRealTimers();
  });

  // ✅ NEW: sliderPosition resets to 50 after next and restores previous value after back
  it('sliderPosition resets to 50 after Next and restores previous value after Back', () => {
    setLocalStorage('patient_id', 'ABC');
    render(<HealthSlider />);

    fireEvent.click(screen.getByRole('button', { name: 'Interview starten' }));

    const slider = screen.getByRole('slider', { name: 'Wert einstellen' });
    const track = screen.getByRole('group', { name: 'Schieberegler vertikal' });

    // set to 100
    fireEvent.click(track, { clientY: 0 });
    expect(slider).toHaveAttribute('aria-valuenow', '100');

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(slider).toHaveAttribute('aria-valuenow', '50');

    // set to 0
    fireEvent.click(track, { clientY: 200 });
    expect(slider).toHaveAttribute('aria-valuenow', '0');

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(slider).toHaveAttribute('aria-valuenow', '50');

    // go back -> restore last answer (100, the first one we set)
    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(slider).toHaveAttribute('aria-valuenow', '100');
  });

  // ✅ NEW: corrupted localStorage triggers banner + clears keys
  it('corrupted localStorage answers shows warning banner and clears survey keys', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    setLocalStorage('patient_id', 'ABC');
    setLocalStorage('survey_testMode', 'false');
    setLocalStorage('survey_index', '0');
    setLocalStorage('survey_answers', '}{not-json');
    setLocalStorage('survey_showSummary', 'false');

    render(<HealthSlider />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Stored survey progress was corrupted and has been reset.'
      );
    });

    expect(warnSpy).toHaveBeenCalled();

    // After corruption, state is reset to defaults (not null)
    expect(window.localStorage.getItem('survey_index')).toBe('0');
    expect(window.localStorage.getItem('survey_answers')).toBe('[]');
    expect(window.localStorage.getItem('survey_testMode')).toBe('true');
    expect(window.localStorage.getItem('survey_showSummary')).toBe('false');

    warnSpy.mockRestore();
  });
});
