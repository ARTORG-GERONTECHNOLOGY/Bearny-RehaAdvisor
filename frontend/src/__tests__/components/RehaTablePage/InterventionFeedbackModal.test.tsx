import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import InterventionFeedbackModal from '../../../components/RehaTablePage/InterventionFeedbackModal';
import { Intervention } from '../../../types';
import '@testing-library/jest-dom';

// Mock react-i18next safely
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

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

const mockExercise: Intervention = {
  _id: 'exercise-123',
  title: 'Mock Exercise',
  content_type: 'Exercise',
  media_url: '',
  link: '',
  description: 'This is a test exercise.', // ✅ add this line
  patient_types: [],
  benefitFor: ['Flexibility'],
  tags: ['mobility'],
  dates: [],
};

describe('InterventionFeedbackModal', () => {
  const baseProps = {
    show: true,
    onClose: jest.fn(),
    exercise: mockExercise,
    date: '2025-04-30',
    userLang: 'en',
  };

  it('renders modal with correct exercise title and date', () => {
    render(<InterventionFeedbackModal {...baseProps} feedbackEntries={[]} />);

    expect(screen.getByText('Mock Exercise (2025-04-30)')).toBeInTheDocument();
    expect(screen.getByText('Feedback')).toBeInTheDocument();
  });

  it('shows "No feedback available" when no entries are passed', () => {
    render(<InterventionFeedbackModal {...baseProps} feedbackEntries={[]} />);

    expect(screen.getByText('No feedback available')).toBeInTheDocument();
  });

  it('renders feedback questions and answers properly', () => {
    const feedbackEntries: FeedbackEntry[] = [
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
    ];

    render(<InterventionFeedbackModal {...baseProps} feedbackEntries={feedbackEntries} />);

    expect(screen.getByText('How was the exercise?')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();
  });

  it('calls onClose callback when modal close button clicked', () => {
    render(<InterventionFeedbackModal {...baseProps} feedbackEntries={[]} />);

    const closeButton = screen.getByLabelText(/close/i);
    fireEvent.click(closeButton);

    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it('falls back to English translation if userLang is not available', () => {
    const feedbackEntries = [
      {
        question: {
          translations: [
            { language: 'en', text: 'Did you enjoy it?' }, // English fallback
          ],
        },
        answer: [
          {
            key: 'yes',
            translations: [{ language: 'en', text: 'Yes' }],
          },
        ],
      },
    ];

    render(
      <InterventionFeedbackModal
        show={true}
        onClose={jest.fn()}
        exercise={mockExercise}
        feedbackEntries={feedbackEntries}
        date="2025-04-29"
        userLang="de" // Not present in translations
      />
    );

    expect(screen.getByText('Did you enjoy it?')).toBeInTheDocument(); // fallback to English
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('falls back to key if no translation exists', () => {
    const feedbackEntries = [
      {
        question: {
          translations: [],
        },
        answer: [
          {
            key: 'no_translation_key',
            translations: [],
          },
        ],
      },
    ];

    render(
      <InterventionFeedbackModal
        show={true}
        onClose={jest.fn()}
        exercise={mockExercise}
        feedbackEntries={feedbackEntries}
        date="2025-04-29"
        userLang="fr"
      />
    );

    // Question fallback is empty string, so not easily testable directly unless wrapped with prefix
    // But answer falls back to key:
    expect(screen.getByText('no_translation_key')).toBeInTheDocument();
  });
});
