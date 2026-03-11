jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { render, screen } from '@testing-library/react';
import InterventionStatsModal from '@/components/RehaTablePage/InterventionStatsModal';
import '@testing-library/jest-dom';

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
  it('renders modal with calculated statistics', () => {
    const intervention = {
      _id: '123',
      title: 'Test Exercise',
      content_type: 'Exercise',
      description: 'Test description',
      media_url: '',
      link: '',
      patient_types: [],
      benefitFor: [],
      tags: [],
      averageRating: 4.5,
    };

    const patientData = {
      interventions: [
        {
          _id: '123',
          duration: 30,
          frequency: 'Daily',
          notes: 'Test notes',
          dates: [
            {
              status: 'completed',
              datetime: '2025-04-01T10:00:00Z',
              feedback: [
                {
                  question: {
                    id: 'q1',
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
              video: { video_url: 'http://example.com/video.mp4' },
            },
            {
              status: 'missed',
              datetime: '2025-04-02T10:00:00Z',
              feedback: [],
            },
            {
              status: 'upcoming',
              datetime: '2025-04-04T10:00:00Z',
              feedback: [],
            },
          ],
        },
      ],
    };

    render(
      <InterventionStatsModal
        show={true}
        onHide={jest.fn()}
        intervention={intervention}
        patientData={patientData}
      />
    );

    // Check modal title
    expect(screen.getByText(/Statistics/)).toBeInTheDocument();
    expect(screen.getByText(/Test Exercise/)).toBeInTheDocument();

    // Check badges - they render as "Total : 3" with spaces
    expect(screen.getByText(/Total/)).toBeInTheDocument();
    const badges = screen.getAllByText(/3|1/);
    expect(badges.length).toBeGreaterThan(0);
    expect(screen.getByText(/Completed:/)).toBeInTheDocument();
    expect(screen.getByText(/Missed:/)).toBeInTheDocument();
    expect(screen.getByText(/Upcoming:/)).toBeInTheDocument();

    // Check table rows
    expect(screen.getByText(/Average rating/)).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText(/Feedback entries/)).toBeInTheDocument();
    expect(screen.getByText(/Video feedback/)).toBeInTheDocument();
    expect(screen.getByText(/Duration/)).toBeInTheDocument();
    expect(screen.getByText('30 min')).toBeInTheDocument();
    expect(screen.getByText(/Frequency/)).toBeInTheDocument();
    expect(screen.getByText('Daily')).toBeInTheDocument();
    expect(screen.getByText(/Notes/)).toBeInTheDocument();
    expect(screen.getByText('Test notes')).toBeInTheDocument();
  });

  it('handles empty data gracefully', () => {
    const intervention = {
      ...baseExercise,
    };

    const patientData = {
      interventions: [
        {
          _id: '1',
          dates: [],
        },
      ],
    };

    render(
      <InterventionStatsModal
        show={true}
        onHide={jest.fn()}
        intervention={intervention}
        patientData={patientData}
      />
    );

    // Verify modal renders with 0 for all stats
    expect(screen.getByText(/Total/)).toBeInTheDocument();
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThan(0); // Multiple 0s will be rendered
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
    expect(screen.getByText(/Missed/)).toBeInTheDocument();
  });
});
