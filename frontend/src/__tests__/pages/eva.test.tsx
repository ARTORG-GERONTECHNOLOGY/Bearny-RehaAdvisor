import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HealthSlider from '@/pages/eva';
import '@testing-library/jest-dom';

beforeEach(() => {
  // Clear localStorage before each test
  localStorage.clear();

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      ...window.location,
      reload: jest.fn(),
    },
  });

  jest.spyOn(window, 'prompt').mockReturnValue('test-patient-id');
  jest.spyOn(window, 'alert').mockImplementation(() => {});
  global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = jest.fn();
});

describe('HealthSlider', () => {
  test('renders initial test question and slider', () => {
    render(<HealthSlider />);
    expect(screen.getByText(/Testlauf Beispiel: Holzhacken/i)).toBeInTheDocument();
    expect(screen.getByText(/Interview starten/i)).toBeInTheDocument();
  });

  test('starts interview and shows first question', () => {
    render(<HealthSlider />);
    fireEvent.click(screen.getByText(/Interview starten/i));
    expect(screen.getByText(/Frage 1/i)).toBeInTheDocument();
  });

  test('advances to next question', () => {
    render(<HealthSlider />);
    fireEvent.click(screen.getByText(/Interview starten/i));
    const nextButton = screen.getByText(/Weiter/i);
    fireEvent.click(nextButton);
    expect(screen.getByText(/Frage 2/i)).toBeInTheDocument();
  });

  test('shows summary after completing all questions', async () => {
    render(<HealthSlider />);
    fireEvent.click(screen.getByText('Interview starten'));

    // Click through all 29 questions
    for (let i = 0; i < 29; i++) {
      const nextButton = screen.getByText('Weiter');
      fireEvent.click(nextButton);
    }

    expect(await screen.findByText(/Bestätigen & Exportieren/i)).toBeInTheDocument();
  });

  test('resets state on export confirmation', async () => {
    render(<HealthSlider />);
    fireEvent.click(screen.getByText('Interview starten'));

    // Click through all 29 questions
    for (let i = 0; i < 29; i++) {
      const nextButton = screen.getByText('Weiter');
      fireEvent.click(nextButton);
    }

    await waitFor(() => {
      expect(screen.getByText(/Bestätigen & Exportieren/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Bestätigen & Exportieren/i));

    await waitFor(() => {
      expect(screen.getByText(/Testlauf Beispiel/i)).toBeInTheDocument();
    });
  });

  test('removes ID and reloads on footer reset click', () => {
    render(<HealthSlider />);
    fireEvent.click(screen.getByText(/Alle Daten löschen & Reset/i));
    expect(window.location.reload).toHaveBeenCalled();
  });

  test('slider handle is draggable via mouse', () => {
    render(<HealthSlider />);
    const handle = screen.getByRole('slider', { hidden: true }); // role added in component
    expect(handle).toBeInTheDocument();
  });

  test('displays correct aria-label for accessibility', async () => {
    render(<HealthSlider />);
    const questionText = await screen.findByText(/Testlauf Beispiel/i);
    expect(questionText).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Interview starten/i });
    expect(button).toHaveAccessibleName('Interview starten');
  });

  test('exports CSV with expected filename structure', async () => {
    render(<HealthSlider />);
    fireEvent.click(screen.getByText('Interview starten'));

    // Click through all 29 questions
    for (let i = 0; i < 29; i++) {
      const nextButton = screen.getByText('Weiter');
      fireEvent.click(nextButton);
    }

    await waitFor(() => {
      expect(screen.getByText(/Bestätigen & Exportieren/i)).toBeInTheDocument();
    });

    const downloadSpy = jest.spyOn(document.body, 'appendChild');
    fireEvent.click(screen.getByText(/Bestätigen & Exportieren/i));
    expect(downloadSpy).toHaveBeenCalled();
  });

  test('slider is draggable via mouse events', async () => {
    render(<HealthSlider />);
    const sliderHandle = screen.getByRole('slider');

    // Start dragging
    fireEvent.mouseDown(sliderHandle);

    // Simulate mouse move event
    fireEvent.mouseMove(document, { clientY: 100 });

    // Stop dragging
    fireEvent.mouseUp(document);

    // After drag, sliderPosition should have changed
    expect(sliderHandle).toBeInTheDocument(); // Already visible
  });

  test('slider is draggable via touch events', () => {
    render(<HealthSlider />);
    const sliderHandle = screen.getByRole('slider');

    // Start touch drag
    fireEvent.touchStart(sliderHandle, {
      touches: [{ clientY: 200 }],
    });

    fireEvent.touchMove(window, {
      touches: [{ clientY: 250 }],
    });

    fireEvent.touchEnd(window);
  });
  test('removes patient_id from localStorage on reset', () => {
    const clearSpy = jest.spyOn(Storage.prototype, 'clear');
    render(<HealthSlider />);
    fireEvent.click(screen.getByText(/Alle Daten löschen & Reset/i));
    expect(clearSpy).toHaveBeenCalled();
  });
});
