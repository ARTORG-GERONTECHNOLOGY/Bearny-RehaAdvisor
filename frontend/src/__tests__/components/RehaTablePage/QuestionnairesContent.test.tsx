import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuestionnairesContent from '@/components/RehaTablePage/QuestionnairesContent';
import apiClient from '@/api/client';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

// Render enough of the real props to assert on state transitions (mode/questionnaire/defaults),
// plus buttons to trigger onHide/onSuccess so the surrounding refresh logic gets exercised.
jest.mock(
  '@/components/RehaTablePage/QuestionnaireScheduleModal',
  () =>
    function QuestionnaireScheduleModal(props: any) {
      if (!props.show) return null;
      return (
        <div data-testid="schedule-modal">
          <div data-testid="schedule-mode">{props.mode}</div>
          <div data-testid="schedule-questionnaire">{props.questionnaire?.title}</div>
          <div data-testid="schedule-defaults">{JSON.stringify(props.defaults)}</div>
          <button onClick={props.onHide}>close schedule</button>
          <button onClick={props.onSuccess}>succeed schedule</button>
        </div>
      );
    }
);
jest.mock(
  '@/components/RehaTablePage/QuestionnaireBuilderModal',
  () =>
    function QuestionnaireBuilderModal(props: any) {
      if (!props.show) return null;
      return (
        <div data-testid="builder-modal">
          <button onClick={props.onHide}>close builder</button>
          <button onClick={props.onSuccess}>succeed builder</button>
        </div>
      );
    }
);

const healthPayload = [
  {
    _id: '16_profile',
    key: '16_profile',
    title: 'Profile (16)',
    question_count: 8,
    created_by_name: 'System',
  },
];

const patientPayload = [
  {
    _id: '16_profile',
    title: 'Profile (16)',
    frequency: 'Monthly',
    dates: [],
    schedule: {
      interval: 2,
      unit: 'week',
      selectedDays: ['Mon'],
      startTime: '09:00',
      end: { type: 'never' },
    },
    answered_entries: [
      {
        questionKey: '16_profile_q1',
        questionTranslations: [{ language: 'en', text: 'How are you today?' }],
        answerType: 'select',
        answers: [{ key: '2', translations: [{ language: 'en', text: 'Good' }] }],
        comment: 'Felt better.',
        answered_at: '2026-02-01T10:00:00Z',
      },
    ],
  },
];

const mockGetImpl = (opts: { healthOk?: boolean; patientOk?: boolean } = {}) => {
  const { healthOk = true, patientOk = true } = opts;
  (apiClient.get as jest.Mock).mockImplementation((url: string) => {
    if (url.includes('/questionnaires/health/')) {
      return healthOk
        ? Promise.resolve({ data: healthPayload })
        : Promise.reject({ response: { data: { error: 'Health fetch failed' } } });
    }
    if (url.includes('/questionnaires/patient/')) {
      return patientOk
        ? Promise.resolve({ data: patientPayload })
        : Promise.reject({ response: { data: { error: 'Patient fetch failed' } } });
    }
    return Promise.resolve({ data: {} });
  });
};

describe('QuestionnairesContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetImpl();
  });

  test('loads and renders available/assigned questionnaires for the given patient', async () => {
    render(<QuestionnairesContent patientId="P01" />);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/questionnaires/health/');
      expect(apiClient.get).toHaveBeenCalledWith('/questionnaires/patient/P01/');
    });

    expect(await screen.findByText('Available questionnaires')).toBeInTheDocument();
    expect(await screen.findByText('Assigned questionnaires')).toBeInTheDocument();
    const profileCards = await screen.findAllByText('Profile (16)');
    expect(profileCards).toHaveLength(2);

    // Sheet content is only rendered after opening — click the assigned card
    fireEvent.click(profileCards[1]);
    expect(await screen.findByText('Answered results')).toBeInTheDocument();
    expect(await screen.findByText('How are you today?')).toBeInTheDocument();
    expect(await screen.findByText(/Comment: Felt better\./)).toBeInTheDocument();
  });

  test('does not fetch questionnaires when patientId is empty', () => {
    render(<QuestionnairesContent patientId="" />);

    expect(apiClient.get).not.toHaveBeenCalled();
  });

  test('shows an error alert when fetching the health catalog fails, dismissible via close', async () => {
    mockGetImpl({ healthOk: false });
    render(<QuestionnairesContent patientId="P01" />);

    expect(await screen.findByText('Health fetch failed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByText('Health fetch failed')).not.toBeInTheDocument();
  });

  test('shows an error alert when fetching assigned questionnaires fails', async () => {
    mockGetImpl({ patientOk: false });
    render(<QuestionnairesContent patientId="P01" />);

    expect(await screen.findByText('Patient fetch failed')).toBeInTheDocument();
  });

  test('opens the create-assignment modal with fresh defaults when Assign is clicked', async () => {
    // Use a catalog item that isn't yet assigned, so the Assign button (not "Assigned") shows.
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/questionnaires/health/')) {
        return Promise.resolve({
          data: [{ _id: 'new-q', key: 'new-q', title: 'New Survey', question_count: 3 }],
        });
      }
      if (url.includes('/questionnaires/patient/')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: {} });
    });

    render(<QuestionnairesContent patientId="P01" />);
    await screen.findByText('New Survey');

    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));

    expect(await screen.findByTestId('schedule-modal')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-mode')).toHaveTextContent('create');
    expect(screen.getByTestId('schedule-questionnaire')).toHaveTextContent('New Survey');
    const defaults = JSON.parse(screen.getByTestId('schedule-defaults').textContent!);
    expect(defaults).toEqual({
      interval: 1,
      unit: 'month',
      selectedDays: [],
      end: { type: 'never' },
      startTime: '08:00',
    });
  });

  test('opens the modify-assignment modal pre-filled from the existing schedule', async () => {
    render(<QuestionnairesContent patientId="P01" />);
    await screen.findAllByText('Profile (16)');

    fireEvent.click(screen.getByRole('button', { name: 'Edit questionnaire' }));

    expect(await screen.findByTestId('schedule-modal')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-mode')).toHaveTextContent('modify');
    const defaults = JSON.parse(screen.getByTestId('schedule-defaults').textContent!);
    expect(defaults).toEqual(
      expect.objectContaining({
        interval: 2,
        unit: 'week',
        selectedDays: ['Mon'],
        startTime: '09:00',
        end: { type: 'never' },
      })
    );
  });

  test('refetches assigned questionnaires when the schedule modal succeeds', async () => {
    render(<QuestionnairesContent patientId="P01" />);
    await screen.findAllByText('Profile (16)');
    fireEvent.click(screen.getByRole('button', { name: 'Edit questionnaire' }));
    await screen.findByTestId('schedule-modal');

    (apiClient.get as jest.Mock).mockClear();
    fireEvent.click(screen.getByText('succeed schedule'));

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/questionnaires/patient/P01/');
    });
    await waitFor(() => {
      expect(screen.queryByTestId('schedule-modal')).not.toBeInTheDocument();
    });
  });

  test('closes the schedule modal via onHide without refetching', async () => {
    render(<QuestionnairesContent patientId="P01" />);
    await screen.findAllByText('Profile (16)');
    fireEvent.click(screen.getByRole('button', { name: 'Edit questionnaire' }));
    await screen.findByTestId('schedule-modal');

    fireEvent.click(screen.getByText('close schedule'));

    expect(screen.queryByTestId('schedule-modal')).not.toBeInTheDocument();
  });

  test('removes an assigned questionnaire and refetches the assigned list', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({});
    render(<QuestionnairesContent patientId="P01" />);
    await screen.findAllByText('Profile (16)');

    (apiClient.get as jest.Mock).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Remove questionnaire' }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/questionnaires/remove/', {
        patientId: 'P01',
        dynamicKey: '16_profile',
        questionnaireId: '16_profile',
      });
    });
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/questionnaires/patient/P01/');
    });
  });

  test('shows an error alert when removing an assigned questionnaire fails', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: { data: { error: 'Remove failed' } },
    });
    render(<QuestionnairesContent patientId="P01" />);
    await screen.findAllByText('Profile (16)');

    fireEvent.click(screen.getByRole('button', { name: 'Remove questionnaire' }));

    expect(await screen.findByText('Remove failed')).toBeInTheDocument();
  });

  test('opens the questionnaire builder modal and refetches the catalog on success', async () => {
    render(<QuestionnairesContent patientId="P01" />);
    await screen.findAllByText('Profile (16)');

    fireEvent.click(screen.getByRole('button', { name: /Create/i }));
    expect(await screen.findByTestId('builder-modal')).toBeInTheDocument();

    (apiClient.get as jest.Mock).mockClear();
    fireEvent.click(screen.getByText('succeed builder'));

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/questionnaires/health/');
    });
  });

  test('normalizes a catalog item that has tags, created_by, and questions populated', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/questionnaires/health/')) {
        return Promise.resolve({
          data: [
            {
              _id: 'full-q',
              key: 'full-q',
              title: 'Full Survey',
              description: 'A full survey',
              tags: ['mood', 'sleep'],
              question_count: 2,
              created_by: 'therapist-9',
              created_by_name: 'Dr. Who',
              questions: [{ questionKey: 'q1', answerType: 'text' }],
            },
          ],
        });
      }
      if (url.includes('/questionnaires/patient/')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: {} });
    });

    render(<QuestionnairesContent patientId="P01" />);
    expect(await screen.findByText('Full Survey')).toBeInTheDocument();
  });

  test('normalizes a non-array health/patient response into an empty list without crashing', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/questionnaires/health/')) {
        return Promise.resolve({ data: null });
      }
      if (url.includes('/questionnaires/patient/')) {
        return Promise.resolve({ data: null });
      }
      return Promise.resolve({ data: {} });
    });

    render(<QuestionnairesContent patientId="P01" />);
    expect(await screen.findByText('Available questionnaires')).toBeInTheDocument();
    expect(screen.queryByText('Profile (16)')).not.toBeInTheDocument();
  });

  test('opens the modify-assignment modal with default schedule values when the assigned entry has no schedule', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/questionnaires/health/')) {
        return Promise.resolve({ data: healthPayload });
      }
      if (url.includes('/questionnaires/patient/')) {
        return Promise.resolve({ data: [{ _id: '16_profile', title: 'Profile (16)' }] });
      }
      return Promise.resolve({ data: {} });
    });

    render(<QuestionnairesContent patientId="P01" />);
    await screen.findAllByText('Profile (16)');

    fireEvent.click(screen.getByRole('button', { name: 'Edit questionnaire' }));

    expect(await screen.findByTestId('schedule-modal')).toBeInTheDocument();
    const defaults = JSON.parse(screen.getByTestId('schedule-defaults').textContent!);
    expect(defaults).toEqual(
      expect.objectContaining({
        interval: 1,
        unit: 'month',
        selectedDays: [],
        startTime: '08:00',
        end: { type: 'never' },
      })
    );
  });

  test('closes the builder modal via onHide', async () => {
    render(<QuestionnairesContent patientId="P01" />);
    await screen.findAllByText('Profile (16)');

    fireEvent.click(screen.getByRole('button', { name: /Create/i }));
    await screen.findByTestId('builder-modal');

    fireEvent.click(screen.getByText('close builder'));
    expect(screen.queryByTestId('builder-modal')).not.toBeInTheDocument();
  });
});
