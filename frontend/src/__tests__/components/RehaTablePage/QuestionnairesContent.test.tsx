import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuestionnairesContent from '@/components/RehaTablePage/QuestionnairesContent';
import apiClient from '@/api/client';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

jest.mock(
  '@/components/RehaTablePage/QuestionnaireScheduleModal',
  () =>
    function QuestionnaireScheduleModal() {
      return null;
    }
);
jest.mock(
  '@/components/RehaTablePage/QuestionnaireBuilderModal',
  () =>
    function QuestionnaireBuilderModal() {
      return null;
    }
);

describe('QuestionnairesContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/questionnaires/health/')) {
        return Promise.resolve({
          data: [
            {
              _id: '16_profile',
              key: '16_profile',
              title: 'Profile (16)',
              question_count: 8,
              created_by_name: 'System',
            },
          ],
        });
      }
      if (url.includes('/questionnaires/patient/')) {
        return Promise.resolve({
          data: [
            {
              _id: '16_profile',
              title: 'Profile (16)',
              frequency: 'Monthly',
              dates: [],
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
          ],
        });
      }
      return Promise.resolve({ data: {} });
    });
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
});
