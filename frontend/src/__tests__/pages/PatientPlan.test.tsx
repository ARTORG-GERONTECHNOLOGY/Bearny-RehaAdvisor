// src/pages/__tests__/PatientPlan.test.tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatientPlan from '@/pages/PatientPlan';
import authStore from '@/stores/authStore';
import { patientInterventionsStore } from '@/stores/patientInterventionsStore';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';

// Mock authStore
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    isAuthenticated: true,
    userType: 'Patient',
    id: 'patient123',
  },
}));

// Mock patientUiStore
jest.mock('@/stores/patientUiStore', () => ({
  patientUiStore: {
    selectedDate: new Date('2026-03-03T12:00:00Z'),
  },
}));

// Mock patientInterventionsStore
jest.mock('@/stores/patientInterventionsStore', () => {
  const { format } = require('date-fns');

  const mockInterventions = [
    {
      intervention_id: 'int1',
      intervention_title: 'Morning Exercise',
      translated_title: 'Morning Exercise',
      dates: [new Date('2026-03-03T10:00:00Z'), new Date('2026-03-04T10:00:00Z')],
      duration: 30,
      intervention: { content_type: 'Video' },
      completed_dates: [],
    },
    {
      intervention_id: 'int2',
      intervention_title: 'Breathing Exercise',
      translated_title: 'Breathing Exercise',
      dates: [new Date('2026-03-03T14:00:00Z')],
      duration: 15,
      intervention: { content_type: 'Audio' },
      completed_dates: ['2026-03-03'],
    },
  ];

  return {
    patientInterventionsStore: {
      items: mockInterventions,
      fetchPlan: jest.fn(),
      toggleCompleted: jest.fn(),
      isCompletedOn: jest.fn((rec: any, date: Date) => {
        const dateKey = format(date, 'yyyy-MM-dd');
        return rec.completed_dates?.includes(dateKey) || false;
      }),
    },
  };
});

// Mock patientQuestionnairesStore
jest.mock('@/stores/patientQuestionnairesStore', () => ({
  patientQuestionnairesStore: {
    checkInitialQuestionnaire: jest.fn(),
    loadHealthQuestionnaire: jest.fn(),
    openInterventionFeedback: jest.fn(),
    closeFeedback: jest.fn(),
    closeHealth: jest.fn(),
    closeInitial: jest.fn(),
    showFeedbackPopup: false,
    showHealthPopup: false,
    showInitialPopup: false,
    feedbackQuestions: [],
    healthQuestions: [],
    feedbackInterventionId: null,
    feedbackDateKey: '',
  },
}));

jest.mock('@/components/Layout', () => ({
  __esModule: true,
  default: require('@/__mocks__/components/Layout').default,
}));

jest.mock('@/components/PatientPage/FeedbackPopup', () => ({
  __esModule: true,
  default: ({ show, onClose }: any) =>
    show ? (
      <div data-testid="feedback-popup">
        <button onClick={onClose}>Close Feedback</button>
      </div>
    ) : null,
}));

jest.mock('@/components/PatientPage/PatientQuestionaire', () => ({
  __esModule: true,
  default: ({ show, handleClose }: any) =>
    show ? (
      <div data-testid="initial-questionnaire">
        <button onClick={handleClose}>Close Questionnaire</button>
      </div>
    ) : null,
}));

// Mock SVG icons
jest.mock('@/assets/icons/circle-dashed-fill.svg?react', () => ({
  __esModule: true,
  default: (props: any) => <svg {...props} data-testid="circle-dashed" />,
}));

jest.mock('@/assets/icons/circle-check-fill.svg?react', () => ({
  __esModule: true,
  default: (props: any) => <svg {...props} data-testid="circle-check" />,
}));

// Mock react-router-dom
const navigateMock = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => navigateMock,
}));

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (key === 'Show {{day}}' && options?.day) {
        return `Show ${options.day}`;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

describe('PatientPlan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('id', 'patient123');
    (authStore.checkAuthentication as jest.Mock).mockResolvedValue(undefined);
    (patientInterventionsStore.toggleCompleted as jest.Mock).mockResolvedValue({
      completed: true,
      dateKey: '2026-03-03',
    });
    (patientQuestionnairesStore as any).showFeedbackPopup = false;
    (patientQuestionnairesStore as any).showHealthPopup = false;
    (patientQuestionnairesStore as any).showInitialPopup = false;
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Rendering', () => {
    it('renders the page with week range and filter badges', () => {
      render(<PatientPlan />);

      // Week range should be visible (02.03. - 08.03.)
      expect(screen.getByText(/02\.03\. - 08\.03\./)).toBeInTheDocument();
      expect(screen.getByText('March 2026')).toBeInTheDocument();

      // Day filter badges
      expect(screen.getByText('Whole Week')).toBeInTheDocument();
      expect(screen.getByText('Mon')).toBeInTheDocument();
      expect(screen.getByText('Tue')).toBeInTheDocument();
      expect(screen.getByText('Wed')).toBeInTheDocument();
      expect(screen.getByText('Thu')).toBeInTheDocument();
      expect(screen.getByText('Fri')).toBeInTheDocument();
      expect(screen.getByText('Sat')).toBeInTheDocument();
      expect(screen.getByText('Sun')).toBeInTheDocument();
    });

    it('renders interventions for the current week', () => {
      render(<PatientPlan />);

      const morningExercises = screen.getAllByText('Morning Exercise');
      expect(morningExercises.length).toBeGreaterThan(0);

      const breathingExercises = screen.getAllByText('Breathing Exercise');
      expect(breathingExercises.length).toBeGreaterThan(0);
    });

    it('displays completion status icons correctly', () => {
      render(<PatientPlan />);

      // Check that completion toggle buttons exist
      const markCompleteButtons = screen.getAllByLabelText('Mark as complete');
      expect(markCompleteButtons.length).toBeGreaterThan(0);

      const markIncompleteButtons = screen.getAllByLabelText('Mark as incomplete');
      expect(markIncompleteButtons.length).toBeGreaterThan(0);
    });

    it('displays intervention duration', () => {
      render(<PatientPlan />);

      // Check for duration text specifically
      const durations = screen.getAllByText((content, element) => {
        return element?.textContent === '30min' || element?.textContent === '15min';
      });
      expect(durations.length).toBeGreaterThan(0);
    });
  });

  describe('Day Filter', () => {
    it('filters interventions by selected day', async () => {
      const user = userEvent.setup();
      render(<PatientPlan />);

      // Click on Tuesday filter
      const tuesdayBadge = screen.getByText('Tue');
      await user.click(tuesdayBadge);

      // Should still show Monday's interventions since today is March 3 (Monday)
      await waitFor(() => {
        expect(screen.queryByText('Morning Exercise')).toBeInTheDocument();
      });
    });

    it('shows all days when "Whole Week" is selected', async () => {
      const user = userEvent.setup();
      render(<PatientPlan />);

      // Click on a specific day first
      const mondayBadge = screen.getByText('Mon');
      await user.click(mondayBadge);

      // Then click "Whole Week"
      const wholeWeekBadge = screen.getByText('Whole Week');
      await user.click(wholeWeekBadge);

      // Should show all interventions across multiple days
      await waitFor(() => {
        const morningExercises = screen.getAllByText('Morning Exercise');
        expect(morningExercises.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Store Initialization', () => {
    it('fetches interventions on mount', () => {
      render(<PatientPlan />);

      expect(patientInterventionsStore.fetchPlan).toHaveBeenCalledWith('patient123', 'en');
    });
  });

  describe('Toggle Completion', () => {
    it('toggles completion status when icon is clicked', async () => {
      const user = userEvent.setup();
      render(<PatientPlan />);

      // Find all icon buttons with Mark as complete
      const markCompleteButtons = screen.getAllByLabelText('Mark as complete');
      await user.click(markCompleteButtons[0]);

      await waitFor(() => {
        expect(patientInterventionsStore.toggleCompleted).toHaveBeenCalled();
      });
    });

    it('shows skeleton during loading state', async () => {
      const user = userEvent.setup();
      (patientInterventionsStore.toggleCompleted as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ completed: true }), 100))
      );

      render(<PatientPlan />);

      const markCompleteButtons = screen.getAllByLabelText('Mark as complete');
      await user.click(markCompleteButtons[0]);

      // Skeleton should be visible during the operation - it has the class animate-pulse
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('prevents double-clicking with busyKey', async () => {
      const user = userEvent.setup();
      (patientInterventionsStore.toggleCompleted as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ completed: true }), 200))
      );

      render(<PatientPlan />);

      const markCompleteButtons = screen.getAllByLabelText('Mark as complete');

      // Click multiple times rapidly
      await user.click(markCompleteButtons[0]);
      await user.click(markCompleteButtons[0]);
      await user.click(markCompleteButtons[0]);

      // Should only call once due to busyKey lock
      await waitFor(() => {
        expect(patientInterventionsStore.toggleCompleted).toHaveBeenCalledTimes(1);
      });
    });

    it('opens feedback popup after completing an intervention', async () => {
      const user = userEvent.setup();
      (patientQuestionnairesStore.openInterventionFeedback as jest.Mock).mockResolvedValue(
        undefined
      );

      render(<PatientPlan />);

      const markCompleteButtons = screen.getAllByLabelText('Mark as complete');
      await user.click(markCompleteButtons[0]);

      await waitFor(() => {
        expect(patientQuestionnairesStore.openInterventionFeedback).toHaveBeenCalled();
      });
    });

    it('stops propagation to prevent opening intervention detail', async () => {
      const user = userEvent.setup();
      render(<PatientPlan />);

      const markCompleteButtons = screen.getAllByLabelText('Mark as complete');
      await user.click(markCompleteButtons[0]);

      expect(navigateMock).not.toHaveBeenCalledWith(
        expect.stringContaining('/patient-intervention/')
      );
    });
  });

  describe('Keyboard Navigation', () => {
    it('navigates to intervention detail on Enter key', async () => {
      const user = userEvent.setup();
      render(<PatientPlan />);

      const interventionCards = screen.getAllByText('Morning Exercise');
      const interventionCard = interventionCards[0].closest('[role="button"]');
      expect(interventionCard).toBeInTheDocument();

      interventionCard?.focus();
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith('/patient-intervention/int1?date=2026-03-03');
      });
    });

    it('navigates to intervention detail on Space key', async () => {
      const user = userEvent.setup();
      render(<PatientPlan />);

      const interventionCards = screen.getAllByText('Morning Exercise');
      const interventionCard = interventionCards[0].closest('[role="button"]');
      interventionCard?.focus();
      await user.keyboard(' ');

      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith('/patient-intervention/int1?date=2026-03-03');
      });
    });

    it('toggles completion on Enter key when icon is focused', async () => {
      render(<PatientPlan />);

      // Find the completion icon button
      const iconButtons = screen.getAllByRole('button');
      const completionButton = iconButtons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('Mark as')
      );

      expect(completionButton).toBeInTheDocument();
      completionButton?.focus();

      fireEvent.keyDown(completionButton!, { key: 'Enter' });

      await waitFor(() => {
        expect(patientInterventionsStore.toggleCompleted).toHaveBeenCalled();
      });
    });
  });

  describe('Popups', () => {
    it('navigates to intervention detail when card is clicked', async () => {
      const user = userEvent.setup();
      render(<PatientPlan />);

      const interventionCards = screen.getAllByText('Morning Exercise');
      await user.click(interventionCards[0]);

      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith('/patient-intervention/int1?date=2026-03-03');
      });
    });

    it('shows feedback popup when store indicates', () => {
      (patientQuestionnairesStore as any).showFeedbackPopup = true;

      render(<PatientPlan />);

      expect(screen.getByTestId('feedback-popup')).toBeInTheDocument();
    });

    it('closes feedback popup and clears busyKey', async () => {
      const user = userEvent.setup();
      (patientQuestionnairesStore as any).showFeedbackPopup = true;

      render(<PatientPlan />);

      const closeButton = screen.getByText('Close Feedback');
      await user.click(closeButton);

      expect(patientQuestionnairesStore.closeFeedback).toHaveBeenCalled();
    });

    it('does not force-close feedback when opening intervention detail', async () => {
      const user = userEvent.setup();
      (patientQuestionnairesStore as any).showFeedbackPopup = true;

      render(<PatientPlan />);

      // Click on intervention card
      const interventionCards = screen.getAllByText('Morning Exercise');
      await user.click(interventionCards[0]);

      expect(patientQuestionnairesStore.closeFeedback).not.toHaveBeenCalled();
    });
  });

  describe('Authentication', () => {
    it('redirects to home when not authenticated', async () => {
      (authStore as any).isAuthenticated = false;

      render(<PatientPlan />);

      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith('/');
      });
    });

    it('redirects to home when user is not a Patient', async () => {
      (authStore as any).isAuthenticated = true;
      (authStore as any).userType = 'Therapist';

      render(<PatientPlan />);

      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith('/');
      });
    });

    it('does not redirect when authenticated as Patient', async () => {
      (authStore as any).isAuthenticated = true;
      (authStore as any).userType = 'Patient';

      render(<PatientPlan />);

      await waitFor(() => {
        expect(authStore.checkAuthentication).toHaveBeenCalled();
      });

      expect(navigateMock).not.toHaveBeenCalled();
    });
  });

  describe('Empty State', () => {
    it('shows "No interventions" message for days without interventions', () => {
      render(<PatientPlan />);

      // The week includes Monday (03-02) which has no interventions
      const noInterventionsElements = screen.getAllByText('No recommendation');
      expect(noInterventionsElements.length).toBeGreaterThan(0);
    });
  });

  describe('Accessibility', () => {
    it('has proper aria-labels for day filters', () => {
      render(<PatientPlan />);

      const wholeWeekBadge = screen.getByLabelText('Show all days');
      expect(wholeWeekBadge).toBeInTheDocument();
    });

    it('has proper aria-labels for interventions', () => {
      render(<PatientPlan />);

      // Look for intervention with completion status in aria-label
      const interventions = screen.getAllByRole('button');
      const hasCompletedLabel = interventions.some(
        (el) =>
          el.getAttribute('aria-label')?.includes('Breathing Exercise') &&
          el.getAttribute('aria-label')?.includes('Completed')
      );
      expect(hasCompletedLabel).toBe(true);
    });

    it('has proper aria-labels for completion toggles', () => {
      render(<PatientPlan />);

      const markCompleteButtons = screen.getAllByLabelText('Mark as complete');
      expect(markCompleteButtons.length).toBeGreaterThan(0);

      const markIncompleteButtons = screen.getAllByLabelText('Mark as incomplete');
      expect(markIncompleteButtons.length).toBeGreaterThan(0);
    });

    it('has proper region labels', () => {
      render(<PatientPlan />);

      expect(screen.getByLabelText('Weekly interventions')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by day')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('handles toggle completion errors gracefully', async () => {
      const user = userEvent.setup();
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      (patientInterventionsStore.toggleCompleted as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      render(<PatientPlan />);

      const markCompleteButtons = screen.getAllByLabelText('Mark as complete');
      await user.click(markCompleteButtons[0]);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('Toggle completed failed:', expect.any(Error));
      });

      consoleError.mockRestore();
    });

    it('handles feedback opening errors gracefully', async () => {
      const user = userEvent.setup();
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      (patientQuestionnairesStore.openInterventionFeedback as jest.Mock).mockRejectedValue(
        new Error('Failed to load feedback')
      );

      render(<PatientPlan />);

      const markCompleteButtons = screen.getAllByLabelText('Mark as complete');
      await user.click(markCompleteButtons[0]);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('[openFeedbackFor] failed:', expect.any(Error));
      });

      consoleError.mockRestore();
    });
  });
});
