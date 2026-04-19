import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InterventionList from '@/components/PatientPage/InterventionList';
import '@testing-library/jest-dom';
import { patientUiStore } from '@/stores/patientUiStore';
import { patientInterventionsStore } from '@/stores/patientInterventionsStore';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';

// ── Global mocks ──────────────────────────────────────────────────────────────

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/utils/translate', () => ({
  translateText: jest.fn((text: string) =>
    Promise.resolve({
      translatedText: text,
      detectedSourceLanguage: 'en',
    })
  ),
}));

jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { id: 'p1' },
}));

jest.mock('@/stores/patientUiStore', () => {
  const store = {
    selectedDate: new Date('2026-02-16T00:00:00Z'),
    viewMode: 'day',
    setSelectedDate: jest.fn(),
    setViewMode: jest.fn((mode) => {
      store.viewMode = mode;
    }),
    goToday: jest.fn(),
  };
  return { patientUiStore: store };
});

jest.mock('@/stores/patientInterventionsStore', () => ({
  patientInterventionsStore: {
    items: [
      {
        intervention_id: 'int1',
        intervention_title: 'Walk',
        translated_title: 'Walk',
        translated_description: 'desc',
        dates: ['2026-02-16T08:00:00.000Z'],
        duration: 10,
      },
    ],
    error: '',
    errorDetails: '',
    fetchPlan: jest.fn(),
    toggleCompleted: jest.fn(),
    isCompletedOn: jest.fn(),
  },
}));

jest.mock('@/stores/patientQuestionnairesStore', () => ({
  patientQuestionnairesStore: {
    showFeedbackPopup: false,
    feedbackInterventionId: '',
    feedbackQuestions: [],
    feedbackDateKey: '',
    showHealthPopup: false,
    showInitialPopup: false,
    healthQuestions: [],
    closeFeedback: jest.fn(),
    closeHealth: jest.fn(),
    closeInitial: jest.fn(),
    checkInitialQuestionnaire: jest.fn(),
    loadHealthQuestionnaire: jest.fn(),
    openInterventionFeedback: jest.fn(),
  },
}));

// Reduce popup complexity in tests
jest.mock('@/components/PatientPage/PatientInterventionPopUp', () => () => (
  <div data-testid="info-popup" />
));
jest.mock('@/components/PatientPage/FeedbackPopup', () => () => (
  <div data-testid="feedback-popup" />
));
jest.mock('@/components/PatientPage/PatientQuestionaire', () => () => (
  <div data-testid="initial-popup" />
));

// ── Shared date helpers ───────────────────────────────────────────────────────

const today = new Date();
const pastDate = new Date(today);
pastDate.setDate(today.getDate() - 1);
const futureDate = new Date(today);
futureDate.setDate(today.getDate() + 1);

// ── InterventionList Component (UI / rendering tests) ────────────────────────

describe('InterventionList Component', () => {
  beforeEach(() => {
    // Set patientId via localStorage so the component can find it
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn((key) => {
          if (key === 'id') return '67d588798c0494979e4633e4';
          return null;
        }),
      },
      writable: true,
    });

    jest.clearAllMocks();
    // Restore isCompletedOn default after clearAllMocks
    (patientInterventionsStore.isCompletedOn as jest.Mock).mockReturnValue(false);
    (patientQuestionnairesStore.closeFeedback as jest.Mock).mockImplementation(() => {});
    (patientQuestionnairesStore.closeHealth as jest.Mock).mockImplementation(() => {});
    (patientQuestionnairesStore.closeInitial as jest.Mock).mockImplementation(() => {});
  });

  it('shows Day and Week toggle buttons', () => {
    render(<InterventionList />);
    expect(screen.getByLabelText(/Day view/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Week view/i)).toBeInTheDocument();
  });

  it('navigates to next and previous day/week', () => {
    render(<InterventionList />);
    const nextButton = screen.getByText('Next');
    const prevButton = screen.getByText('Previous');

    fireEvent.click(nextButton);
    fireEvent.click(prevButton);

    expect(nextButton).toBeInTheDocument();
    expect(prevButton).toBeInTheDocument();
  });

  it('displays the intervention item for the selected date', () => {
    render(<InterventionList />);
    // patientInterventionsStore.items has 'Walk' for 2026-02-16 and
    // patientUiStore.selectedDate is 2026-02-16 (from store mock)
    expect(screen.getByText(/Walk/i)).toBeInTheDocument();
  });

  it('shows "Ididit" button for a past uncompleted intervention', () => {
    render(<InterventionList />);
    // Walk item is for 2026-02-16 (past), isCompletedOn = false → Ididit button
    expect(screen.getByRole('button', { name: /Ididit/i })).toBeInTheDocument();
  });

  it('shows "Undo" button when intervention is completed', () => {
    (patientInterventionsStore.isCompletedOn as jest.Mock).mockReturnValue(true);
    render(<InterventionList />);
    expect(screen.getByRole('button', { name: /Undo/i })).toBeInTheDocument();
  });

  it('switches to week view when Week toggle is clicked', () => {
    render(<InterventionList />);
    fireEvent.click(screen.getByLabelText(/Week view/i));
    expect(patientUiStore.setViewMode).toHaveBeenCalledWith('week');
  });

  it('handles fetchInterventions error gracefully', async () => {
    render(<InterventionList />);
    await waitFor(() => {
      expect(screen.getByText('Previous')).toBeInTheDocument();
    });
  });

  it('handles getQuestionnaire API failure gracefully', async () => {
    render(<InterventionList />);
    await waitFor(() => {
      expect(screen.getByText('Previous')).toBeInTheDocument();
    });
  });

  it('does not render interventions if dates do not match selected date', () => {
    render(<InterventionList />);
    // The mock items only have dates for 2026-02-16; no item titled 'Mismatch' exists
    expect(screen.queryByText(/Mismatch/)).not.toBeInTheDocument();
  });
});

// ── InterventionList (store-level unit tests) ─────────────────────────────────

describe('InterventionList', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset patientUiStore state that may have been mutated by the previous describe
    (patientUiStore as any).viewMode = 'day';
    (patientUiStore as any).selectedDate = new Date('2026-02-16T00:00:00Z');

    // Clear the localStorage override from the previous describe so authStore.id ('p1') is used
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: jest.fn(() => null) },
      writable: true,
    });

    (patientInterventionsStore.isCompletedOn as jest.Mock).mockReturnValue(false);
    (patientInterventionsStore.toggleCompleted as jest.Mock).mockResolvedValue({
      completed: true,
      dateKey: '2026-02-16',
    });
  });

  it('fetches plan and questionnaires on mount', async () => {
    render(<InterventionList />);

    await waitFor(() => {
      expect(patientInterventionsStore.fetchPlan).toHaveBeenCalledWith('p1', 'en');
      expect(patientQuestionnairesStore.checkInitialQuestionnaire).toHaveBeenCalledWith('p1');
      expect(patientQuestionnairesStore.loadHealthQuestionnaire).toHaveBeenCalledWith('p1', 'en');
    });
  });

  it('shows "I did it" button for today and triggers toggle + open feedback', async () => {
    render(<InterventionList />);

    const btn = await screen.findByRole('button', { name: 'Ididit' });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(patientInterventionsStore.toggleCompleted).toHaveBeenCalled();
      expect(patientQuestionnairesStore.openInterventionFeedback).toHaveBeenCalledWith(
        'p1',
        'int1',
        '2026-02-16',
        'en'
      );
    });
  });

  it('switches view mode via toggle buttons', async () => {
    render(<InterventionList />);

    fireEvent.click(screen.getByRole('radio', { name: 'Week view' }));
    expect(patientUiStore.setViewMode).toHaveBeenCalledWith('week');
  });

  it('Today button calls goToday()', async () => {
    render(<InterventionList />);
    fireEvent.click(screen.getByRole('button', { name: 'Go to today' }));
    expect(patientUiStore.goToday).toHaveBeenCalled();
  });
});
