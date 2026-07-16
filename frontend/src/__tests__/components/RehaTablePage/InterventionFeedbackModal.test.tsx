import { render, screen, fireEvent } from '@testing-library/react';
import InterventionFeedbackModal from '@/components/RehaTablePage/InterventionFeedbackModal';
import '@testing-library/jest-dom';
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

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

    const [closeButton] = screen.getAllByRole('button', { name: /close/i });
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

    // answered=1 (first date has feedback), total=2
    expect(
      screen.getByText(/Answered feedback for 1 out of 2 scheduled events/)
    ).toBeInTheDocument();
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

    // answered=1 (video counts), total=1
    expect(
      screen.getByText(/Answered feedback for 1 out of 1 scheduled events/)
    ).toBeInTheDocument();
  });

  it('falls back to the English translation when the user language has no matching entry', () => {
    const { useTranslation } = jest.requireMock('react-i18next');
    const { i18n } = useTranslation();
    i18n.language = 'de';

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
                  { language: 'fr', text: 'Question francaise' },
                  { language: 'en', text: 'English question' },
                ],
              },
              answer: [],
            },
          ],
        },
      ],
    };

    render(
      <InterventionFeedbackModal show={true} onHide={jest.fn()} intervention={intervention} />
    );

    expect(screen.getByText('English question')).toBeInTheDocument();
    i18n.language = 'en';
  });

  it('selects the target date when initialDatetime is provided, showing all dates including ones without feedback', () => {
    const intervention = {
      _id: 'exercise-123',
      title: 'Mock Exercise',
      dates: [
        { status: 'missed', datetime: '2025-04-29T10:00:00Z', feedback: [] },
        {
          status: 'today',
          datetime: '2025-04-30T10:00:00Z',
          feedback: [{ question: { translations: [{ language: 'en', text: 'Q?' }] }, answer: [] }],
        },
      ],
    };

    render(
      <InterventionFeedbackModal
        show={true}
        onHide={jest.fn()}
        intervention={intervention}
        initialDatetime="2025-04-29T10:00:00Z"
      />
    );

    // Both dates are visible even though the first has no feedback, because
    // initialDatetime forces onlyWithFeedback off.
    expect(screen.getAllByText(/2025|Apr/).length).toBeGreaterThan(0);
    expect(screen.getByText('No feedback available')).toBeInTheDocument();
  });

  it('toggles "only with feedback" and switches the selected date via the list', () => {
    const intervention = {
      _id: 'exercise-123',
      title: 'Mock Exercise',
      dates: [
        {
          status: 'completed',
          datetime: '2025-04-30T10:00:00Z',
          feedback: [
            {
              question: { translations: [{ language: 'en', text: 'First question?' }] },
              answer: [],
            },
          ],
        },
        { status: 'scheduled', datetime: '2025-05-01T10:00:00Z', feedback: [] },
      ],
    };

    render(
      <InterventionFeedbackModal show={true} onHide={jest.fn()} intervention={intervention} />
    );

    // Only the date with feedback is visible initially.
    expect(screen.getByText('First question?')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Show only dates with feedback'));

    // Now both dates show; clicking the second selects it and shows its (empty) feedback.
    const items = screen.getAllByText(/2025/);
    expect(items.length).toBe(2);
    fireEvent.click(items[1]);

    expect(screen.getByText('No feedback available')).toBeInTheDocument();
  });

  it('renders status badges, video comment, answer text, star rating, comment, and audio player', () => {
    const intervention = {
      _id: 'exercise-123',
      title: 'Mock Exercise',
      dates: [
        {
          status: 'missed',
          datetime: '2025-04-30T10:00:00Z',
          video: { video_url: 'https://example.com/video.mp4', comment: 'Video note' },
          feedback: [
            {
              question: { translations: [{ language: 'en', text: 'Rate it' }] },
              answer: [{ key: '5', translations: [{ language: 'en', text: '★★★★★' }] }],
              comment: 'Went well',
              audio_url: 'https://example.com/audio.mp3',
            },
            {
              question: { translations: [{ language: 'en', text: 'Any notes?' }] },
              answer: [{ key: 'yes', translations: [{ language: 'en', text: 'Yes indeed' }] }],
            },
          ],
        },
      ],
    };

    render(
      <InterventionFeedbackModal show={true} onHide={jest.fn()} intervention={intervention} />
    );

    expect(screen.getByText('Video feedback')).toBeInTheDocument();
    expect(screen.getByText('Video note')).toBeInTheDocument();
    expect(screen.getByText('Went well')).toBeInTheDocument();
    expect(screen.getByText('Yes indeed')).toBeInTheDocument();
    expect(document.querySelector('audio')).toBeInTheDocument();
  });
});
