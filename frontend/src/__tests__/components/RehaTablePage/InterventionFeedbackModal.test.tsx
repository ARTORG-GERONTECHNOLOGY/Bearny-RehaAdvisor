import { render, screen, fireEvent } from '@testing-library/react';
import InterventionFeedbackModal from '@/components/RehaTablePage/InterventionFeedbackModal';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

describe('InterventionFeedbackModal', () => {
  it('renders modal with correct intervention title', () => {
    const intervention = {
      _id: 'exercise-123',
      title: 'Mock Exercise',
      dates: [],
    };

    render(
      <InterventionFeedbackModal show={true} onHide={jest.fn()} intervention={intervention} />
    );

    expect(screen.getByText(/Mock Exercise/)).toBeInTheDocument();
    expect(screen.getByText(/Feedback/)).toBeInTheDocument();
  });

  it('shows "No scheduled events found" when dates array is empty', () => {
    const intervention = {
      _id: 'exercise-123',
      title: 'Mock Exercise',
      dates: [],
    };

    render(
      <InterventionFeedbackModal show={true} onHide={jest.fn()} intervention={intervention} />
    );

    expect(screen.getByText(/No scheduled events found/)).toBeInTheDocument();
  });

  it('shows "No feedback available" when dates exist but have no feedback', () => {
    const intervention = {
      _id: 'exercise-123',
      title: 'Mock Exercise',
      dates: [
        {
          status: 'completed',
          datetime: '2025-04-30T10:00:00Z',
          feedback: [],
        },
      ],
    };

    render(
      <InterventionFeedbackModal show={true} onHide={jest.fn()} intervention={intervention} />
    );

    expect(screen.getByText(/No feedback available/)).toBeInTheDocument();
  });

  it('renders feedback questions and answers properly', () => {
    const intervention = {
      _id: 'exercise-123',
      title: 'Mock Exercise',
      dates: [
        {
          status: 'completed',
          datetime: '2025-04-30T10:00:00Z',
          feedback: [
            {
              question: {
                translations: [
                  { language: 'en', text: 'How was the exercise?' },
                  { language: 'de', text: 'Wie war die Übung?' },
                ],
              },
              answer: [
                {
                  key: 'good',
                  translations: [
                    { language: 'en', text: 'Good' },
                    { language: 'de', text: 'Gut' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    render(
      <InterventionFeedbackModal show={true} onHide={jest.fn()} intervention={intervention} />
    );

    expect(screen.getByText('How was the exercise?')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();
  });

  it('calls onHide callback when modal close button clicked', () => {
    const onHideMock = jest.fn();
    const intervention = {
      _id: 'exercise-123',
      title: 'Mock Exercise',
      dates: [],
    };

    render(
      <InterventionFeedbackModal show={true} onHide={onHideMock} intervention={intervention} />
    );

    const closeButton = screen.getByLabelText(/close/i);
    fireEvent.click(closeButton);

    expect(onHideMock).toHaveBeenCalled();
  });

  it('displays answered feedback count correctly', () => {
    const intervention = {
      _id: 'exercise-123',
      title: 'Mock Exercise',
      dates: [
        {
          status: 'completed',
          datetime: '2025-04-30T10:00:00Z',
          feedback: [
            {
              question: {
                translations: [{ language: 'en', text: 'Question 1?' }],
              },
              answer: [
                {
                  key: 'answer1',
                  translations: [{ language: 'en', text: 'Answer 1' }],
                },
              ],
            },
          ],
        },
        {
          status: 'completed',
          datetime: '2025-05-01T10:00:00Z',
          feedback: [],
        },
      ],
    };

    render(
      <InterventionFeedbackModal show={true} onHide={jest.fn()} intervention={intervention} />
    );

    // Check for the feedback count summary text
    expect(screen.getByText(/Answered feedback for/)).toBeInTheDocument();
    expect(screen.getByText(/out of/)).toBeInTheDocument();
    expect(screen.getByText(/scheduled events/)).toBeInTheDocument();
  });

  it('shows video feedback when available', () => {
    const intervention = {
      _id: 'exercise-123',
      title: 'Mock Exercise',
      dates: [
        {
          status: 'completed',
          datetime: '2025-04-30T10:00:00Z',
          feedback: [],
          video: {
            video_url: 'https://example.com/video.mp4',
          },
        },
      ],
    };

    render(
      <InterventionFeedbackModal show={true} onHide={jest.fn()} intervention={intervention} />
    );

    // Video feedback should count as answered - check the summary text exists
    expect(screen.getByText(/Answered feedback for/)).toBeInTheDocument();
    expect(screen.getByText(/out of/)).toBeInTheDocument();
  });
});
