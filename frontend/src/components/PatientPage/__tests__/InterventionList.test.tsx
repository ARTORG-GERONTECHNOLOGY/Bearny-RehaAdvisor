// src/components/PatientPage/__tests__/InterventionList.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InterventionList from '../InterventionList';
import authStore from '../../../stores/authStore';
import { patientUiStore } from '../../../stores/patientUiStore';
import { patientInterventionsStore } from '../../../stores/patientInterventionsStore';
import { patientQuestionnairesStore } from '../../../stores/patientQuestionnairesStore';

jest.mock('../../../stores/authStore', () => ({
  __esModule: true,
  default: { id: 'p1' },
}));

jest.mock('../../../stores/patientUiStore', () => ({
  patientUiStore: {
    selectedDate: new Date('2026-02-16T00:00:00Z'),
    viewMode: 'day',
    setSelectedDate: jest.fn(),
    setViewMode: jest.fn(),
    goToday: jest.fn(),
  },
}));

jest.mock('../../../stores/patientInterventionsStore', () => ({
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

jest.mock('../../../stores/patientQuestionnairesStore', () => ({
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

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (x: any) => x, i18n: { language: 'en' } }),
}));

// Reduce complexity: don’t render popups here
jest.mock('../PatientInterventionPopUp', () => () => <div data-testid="info-popup" />);
jest.mock('../FeedbackPopup', () => () => <div data-testid="feedback-popup" />);
jest.mock('../PatientQuestionaire', () => () => <div data-testid="initial-popup" />);

describe('InterventionList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    fireEvent.click(screen.getByRole('radio', { name: 'Day view' }));
    expect(patientUiStore.setViewMode).toHaveBeenCalledWith('day');
  });

  it('Today button calls goToday()', async () => {
    render(<InterventionList />);
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(patientUiStore.goToday).toHaveBeenCalled();
  });
});
