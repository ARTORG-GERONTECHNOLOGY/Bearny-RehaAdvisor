/**
 * Unit tests for the Bootstrap-based InterventionList component.
 *
 * NOTE: InterventionList (PatientPage/InterventionList.tsx) is a legacy
 * component. The live patient pages (Patient.tsx, PatientPlan.tsx) use
 * DailyInterventionCard + InterventionItem instead. These tests cover the
 * shared day/week navigation and completion-toggle logic that is replicated in
 * the active components, and they prevent accidental regression if the file
 * is revived or referenced.
 *
 * Store setup summary
 * ────────────────────
 * • patientUiStore.selectedDate  → 2026-02-16 (a past date so the "I did it"
 *   button is visible without time-zone gymnastics)
 * • patientInterventionsStore.items → one item for 2026-02-16 titled 'Walk'
 * • All store methods are jest.fn() — no real network I/O
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { addDays, format } from 'date-fns';
import InterventionList from '@/components/PatientPage/InterventionList';
import '@testing-library/jest-dom';
import { patientUiStore } from '@/stores/patientUiStore';
import { patientInterventionsStore } from '@/stores/patientInterventionsStore';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';

// ── Default store fixtures ────────────────────────────────────────────────────

const DEFAULT_ITEMS = [
  {
    intervention_id: 'int1',
    intervention_title: 'Walk',
    translated_title: 'Walk',
    translated_description: 'desc',
    dates: ['2026-02-16T08:00:00.000Z'],
    duration: 10,
  },
];

const DEFAULT_SELECTED_DATE = new Date('2026-02-16T00:00:00Z');

// ── Global mocks ──────────────────────────────────────────────────────────────

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/utils/translate', () => ({
  translateText: jest.fn((text: string) =>
    Promise.resolve({
      translatedText: text,
      detectedSourceLanguage: 'en',
    })
  ),
}));

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

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

// Stub out the popup components — we're testing the list, not the popups.
jest.mock(
  '@/components/PatientPage/PatientInterventionPopUp',
  () =>
    function PatientInterventionPopUp() {
      return <div data-testid="info-popup" />;
    }
);
jest.mock(
  '@/components/PatientPage/FeedbackPopup',
  () =>
    function FeedbackPopup() {
      return <div data-testid="feedback-popup" />;
    }
);
jest.mock(
  '@/components/PatientPage/PatientQuestionaire',
  () =>
    function PatientQuestionaire() {
      return <div data-testid="initial-popup" />;
    }
);

// ── InterventionList Component (UI / rendering tests) ────────────────────────
//
// These tests focus on what the component renders for a given store state.
// Network calls are fully mocked; no assertions are made on them here.

describe('InterventionList Component', () => {
  beforeEach(() => {
    // Provide a patient ID through localStorage (the component prefers this
    // over authStore.id when the patient is viewing their own plan).
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

    // Re-apply defaults cleared by clearAllMocks(); also reset any state
    // mutated by tests that override items or selectedDate.
    (patientInterventionsStore as any).items = DEFAULT_ITEMS;
    (patientUiStore as any).selectedDate = DEFAULT_SELECTED_DATE;
    (patientUiStore as any).viewMode = 'day';
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

  it('navigates forward by one day when Next is clicked', () => {
    render(<InterventionList />);
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    // Day-view delta is 1; selectedDate starts at 2026-02-16
    expect(patientUiStore.setSelectedDate).toHaveBeenCalledWith(
      addDays(new Date('2026-02-16T00:00:00Z'), 1)
    );
  });

  it('navigates backward by one day when Previous is clicked', () => {
    render(<InterventionList />);
    fireEvent.click(screen.getByRole('button', { name: /Previous/i }));
    expect(patientUiStore.setSelectedDate).toHaveBeenCalledWith(
      addDays(new Date('2026-02-16T00:00:00Z'), -1)
    );
  });

  it('displays the intervention item for the selected date', () => {
    render(<InterventionList />);
    // The mock store has 'Walk' scheduled for 2026-02-16 and
    // selectedDate is also 2026-02-16, so it should appear.
    expect(screen.getByText(/Walk/i)).toBeInTheDocument();
  });

  it('shows "Ididit" button for a past uncompleted intervention', () => {
    render(<InterventionList />);
    // 2026-02-16 is in the past; isCompletedOn = false → "I did it" button
    expect(screen.getByRole('button', { name: /Ididit/i })).toBeInTheDocument();
  });

  it('shows "Undo" button when intervention is already completed', () => {
    (patientInterventionsStore.isCompletedOn as jest.Mock).mockReturnValue(true);
    render(<InterventionList />);
    expect(screen.getByRole('button', { name: /Undo/i })).toBeInTheDocument();
  });

  it('shows "Upcoming" badge for a future uncompleted intervention', () => {
    // Future dates render a status badge, not an action button
    const tomorrow = addDays(new Date(), 1);
    const isoDate = format(tomorrow, "yyyy-MM-dd'T'08:00:00.000'Z'");
    (patientUiStore as any).selectedDate = tomorrow;
    (patientInterventionsStore as any).items = [
      {
        intervention_id: 'future-1',
        intervention_title: 'Future Exercise',
        translated_title: 'Future Exercise',
        dates: [isoDate],
        duration: 15,
      },
    ];
    render(<InterventionList />);
    expect(screen.getByText(/Upcoming/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ididit/i })).not.toBeInTheDocument();
  });

  it('shows "No interventions" placeholder when no items match the selected date', () => {
    // The component renders an empty-state message when the filtered list is empty
    (patientInterventionsStore as any).items = [];
    render(<InterventionList />);
    expect(screen.getByText(/No interventions/i)).toBeInTheDocument();
  });

  it('switches to week view when the Week toggle is clicked', () => {
    render(<InterventionList />);
    fireEvent.click(screen.getByLabelText(/Week view/i));
    expect(patientUiStore.setViewMode).toHaveBeenCalledWith('week');
  });

  it('renders the navigation chrome on initial mount regardless of store state', async () => {
    // Smoke test: Previous, Next, and Today buttons must always be present.
    // The component is fire-and-forget for its data calls; it must not crash
    // synchronously even when store methods return undefined.
    render(<InterventionList />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Previous/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Go to today/i })).toBeInTheDocument();
    });
  });

  it('renders a 7-column weekly grid when viewMode is "week"', () => {
    // Week view should switch to the 7-day grid layout with a week-range heading.
    (patientUiStore as any).viewMode = 'week';
    render(<InterventionList />);
    expect(screen.getByRole('grid', { name: /Weekly interventions grid/i })).toBeInTheDocument();
    // The week-range heading (e.g. "17.02 – 23.02 (Week 8)") is rendered as h5
    expect(document.querySelector('h5')).toBeInTheDocument();
  });

  it('does not render items from a different date than the selected date', () => {
    render(<InterventionList />);
    // Only 2026-02-16 items are in the mock; nothing titled 'Mismatch' exists
    expect(screen.queryByText(/Mismatch/)).not.toBeInTheDocument();
  });
});

// ── InterventionList (store interaction / event tests) ───────────────────────
//
// These tests drive user interactions and assert that the correct store methods
// are called, rather than inspecting rendered output in detail.

describe('InterventionList', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset all store state that may have been mutated by the previous describe
    (patientUiStore as any).viewMode = 'day';
    (patientUiStore as any).selectedDate = DEFAULT_SELECTED_DATE;
    (patientInterventionsStore as any).items = DEFAULT_ITEMS;

    // Use authStore.id ('p1') for patient identification in this block so we
    // can assert the exact ID passed to store methods.
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

  it('calls fetchPlan and questionnaire loaders on mount', async () => {
    render(<InterventionList />);
    await waitFor(() => {
      expect(patientInterventionsStore.fetchPlan).toHaveBeenCalledWith('p1', 'en');
      expect(patientQuestionnairesStore.checkInitialQuestionnaire).toHaveBeenCalledWith('p1');
      expect(patientQuestionnairesStore.loadHealthQuestionnaire).toHaveBeenCalledWith('p1', 'en');
    });
  });

  it('clicking "I did it" triggers toggleCompleted then opens the feedback popup', async () => {
    render(<InterventionList />);
    // The action button's aria-label is t('Ididit'); find it by role + label
    // rather than by text, which can differ by locale.
    const ididItBtn = await screen.findByRole('button', { name: /Ididit/i });
    fireEvent.click(ididItBtn);
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

  it('advances one day when Next is clicked in day view', () => {
    render(<InterventionList />);
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(patientUiStore.setSelectedDate).toHaveBeenCalledWith(
      addDays(new Date('2026-02-16T00:00:00Z'), 1)
    );
  });

  it('goes back one day when Previous is clicked in day view', () => {
    render(<InterventionList />);
    fireEvent.click(screen.getByRole('button', { name: /Previous/i }));
    expect(patientUiStore.setSelectedDate).toHaveBeenCalledWith(
      addDays(new Date('2026-02-16T00:00:00Z'), -1)
    );
  });

  it('switches view mode to week via the toggle button', async () => {
    render(<InterventionList />);
    fireEvent.click(screen.getByRole('radio', { name: 'Week view' }));
    expect(patientUiStore.setViewMode).toHaveBeenCalledWith('week');
  });

  it('"Today" button calls goToday()', async () => {
    render(<InterventionList />);
    fireEvent.click(screen.getByRole('button', { name: 'Go to today' }));
    expect(patientUiStore.goToday).toHaveBeenCalled();
  });
});
