import React from 'react';
import { render, screen } from '@testing-library/react';
import InterventionStatsModal from '../../../components/RehaTablePage/InterventionStatsModal';
import '@testing-library/jest-dom';
import type { Intervention } from '../../../types'; // adjust path if necessary

const mockTranslate = (key: string) => key;
interface FeedbackEntry {
  question: {
    translations: { language: string; text: string }[];
  };
  answer: {
    key: string;
    translations: { language: string; text: string }[];
  }[];
  comment?: string;
}

const baseExercise = {
  _id: '1',
  title: 'Test Exercise',
  content_type: 'Exercise',
  description: '',
  media_url: '',
  link: '',
  patient_types: [],
  benefitFor: [],
  tags: [],
  dates: [],
};

describe('InterventionStatsModal', () => {
  it('renders modal with calculated progress values', () => {
    const interventionData: Intervention = {
      _id: '123',
      title: 'Test Exercise',
      content_type: 'Exercise',
      description: 'Test description',
      media_url: '',
      link: '',
      patient_types: [],
      benefitFor: [],
      tags: [],
      currentTotalCount: 2,
      dates: [
        {
          status: 'completed',
          datetime: '2025-04-01T10:00:00Z',
          feedback: [
            {
              question: {
                id: 'q1', // ✅ Add the required `id`
                translations: [{ language: 'en', text: 'How was it?' }],
              },
              answer: [
                {
                  key: 'good',
                  translations: [{ language: 'en', text: 'Good' }],
                },
              ],
            },
          ],
        },
        {
          status: 'missed',
          datetime: '2025-04-02T10:00:00Z',
          feedback: [], // valid empty array
        },
        {
          status: 'upcoming',
          datetime: '2025-04-04T10:00:00Z',
          feedback: [],
        },
      ],
    };

    render(
      <InterventionStatsModal
        show={true}
        onClose={jest.fn()}
        exercise={baseExercise}
        interventionData={interventionData}
        t={mockTranslate}
      />
    );

    // Titles and labels
    expect(screen.getByText(/Test Exercise Information/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/Current Sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/Current Feedback Answered/i)).toBeInTheDocument();

    // Total sessions count
    expect(screen.getByText('3')).toBeInTheDocument();

    // Check progress bar width values directly in DOM
    const bars = document.querySelectorAll('.progress-bar');
    expect(bars.length).toBe(7);

    const totalCompletedWidth = (1 / 3) * 100; // 33.33%
    const totalMissedWidth = (1 / 3) * 100; // 33.33%
    const totalUpcomingWidth = (1 / 3) * 100; // 33.33%
    expect(bars[0]).toHaveStyle(`width: ${totalCompletedWidth}%`);
    expect(bars[1]).toHaveStyle(`width: ${totalMissedWidth}%`);
    expect(bars[2]).toHaveStyle(`width: ${totalUpcomingWidth}%`);

    const currentCompletedWidth = (1 / 2) * 100;
    const currentRemainingWidth = (1 / 2) * 100;

    expect(bars[3]).toHaveStyle(`width: ${currentCompletedWidth}%`);
    expect(bars[4]).toHaveStyle(`width: ${currentRemainingWidth}%`);

    const feedbackAnsweredWidth = (1 / 2) * 100;
    const feedbackMissingWidth = (1 / 2) * 100; // (100 - feedbackAnsweredWidth)

    expect(bars[5]).toHaveStyle(`width: ${feedbackAnsweredWidth}%`);
    expect(bars[6]).toHaveStyle(`width: ${feedbackMissingWidth}%`);

    // The missing portion is implied in remaining style (not explicitly rendered in your logic)
  });

  it('handles empty interventionData gracefully', () => {
    const emptyData = {
      ...baseExercise,
      currentTotalCount: 0,
      dates: [],
    };

    render(
      <InterventionStatsModal
        show={true}
        onClose={jest.fn()}
        exercise={baseExercise}
        interventionData={emptyData}
        t={mockTranslate}
      />
    );

    // Verify modal renders with 0 sessions
    expect(screen.getByText('Total Sessions:')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(document.querySelectorAll('.progress-bar').length).toBe(7);
  });
});
