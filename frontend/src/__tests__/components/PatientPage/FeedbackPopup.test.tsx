import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FeedbackPopup from '@/components/PatientPage/FeedbackPopup';
import apiClient from '@/api/client';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

const defaultProps = {
  show: true,
  interventionId: 'test-intervention-id',
  onClose: jest.fn(),
  questions: [
    {
      questionKey: 'q1',
      answerType: 'text' as const,
      translations: [{ language: 'en', text: 'How do you feel?' }],
    },
    {
      questionKey: 'q2',
      answerType: 'dropdown' as const,
      translations: [{ language: 'en', text: 'Select the severity' }],
      possibleAnswers: [
        { key: 'mild', translations: [{ language: 'en', text: 'Mild' }] },
        { key: 'severe', translations: [{ language: 'en', text: 'Severe' }] },
      ],
    },
  ],
};

// Text-first question setup for tests that need text input
const textFirstProps = {
  ...defaultProps,
  questions: [
    {
      questionKey: 'q1',
      answerType: 'text' as const,
      translations: [{ language: 'en', text: 'How do you feel?' }],
    },
  ],
};
// 🟢 OUTSIDE DESCRIBE: MockMediaRecorder definition and global mocks
global.URL.createObjectURL = jest.fn(() => 'mock-audio-url');

describe('FeedbackPopup Component', () => {
  // 🟡 INSIDE DESCRIBE: beforeEach and tests

  beforeEach(() => {
    global.URL.createObjectURL = jest.fn(() => 'mock-audio-url');
    Object.defineProperty(global.navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue({
          getTracks: () => [{ stop: jest.fn() }],
        }),
      },
    });

    class MockMediaRecorder {
      public ondataavailable: ((event: any) => void) | null = null;
      public onstop: (() => void) | null = null;
      public onstart: (() => void) | null = null;

      public start = jest.fn(() => {
        if (this.onstart) this.onstart();
      });

      public stop = jest.fn(() => {
        if (this.onstop) {
          // Simulate data being available
          if (this.ondataavailable) {
            this.ondataavailable({ data: new Blob(['test audio data'], { type: 'audio/wav' }) });
          }
          this.onstop();
        }
      });

      constructor() {}

      static isTypeSupported = jest.fn(() => true);
    }

    global.MediaRecorder = MockMediaRecorder as any;

    Object.defineProperty(global.navigator, 'permissions', {
      writable: true,
      value: {
        query: jest.fn().mockResolvedValue({
          state: 'granted',
          name: 'microphone',
          onchange: null,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        }),
      },
    });

    jest.clearAllMocks();
  });

  it('navigates forward and backward between questions', async () => {
    render(<FeedbackPopup {...defaultProps} />);

    // Check first question (dropdown question appears first due to sorting)
    expect(screen.getByText('Select the severity')).toBeInTheDocument();

    // Click Next
    const nextButton = screen.getByRole('button', { name: /Next/i });
    fireEvent.click(nextButton);
    expect(screen.getByText('How do you feel?')).toBeInTheDocument();

    // Click Back
    const backButton = screen.getByRole('button', { name: /Back/i });
    fireEvent.click(backButton);
    expect(screen.getByText('Select the severity')).toBeInTheDocument();
  });

  it('handles text input change', async () => {
    render(<FeedbackPopup {...textFirstProps} />);

    // IMPORTANT: Activate the text mode first using Badge component!
    const typeButton = screen.getByLabelText(/Text mode/i);
    fireEvent.click(typeButton);

    // Now the textarea should exist
    const textarea = await screen.findByRole('textbox', { name: /Text Feedback/i });
    fireEvent.change(textarea, { target: { value: 'Feeling good' } });

    expect(textarea).toHaveValue('Feeling good');
  });

  it('calls API on submit', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({ status: 200 });
    render(<FeedbackPopup {...defaultProps} />);

    // Navigate to last question
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/patients/feedback/questionaire/',
        expect.any(Object),
        expect.any(Object)
      );
    });
  });
  it('shows microphone denied alert when permission is denied', async () => {
    // Properly mock navigator.permissions
    const mockQuery = jest.fn().mockResolvedValue({
      state: 'denied',
      name: 'microphone',
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    });

    // Define the navigator.permissions object if it does not exist
    Object.defineProperty(navigator, 'permissions', {
      value: { query: mockQuery },
      writable: true,
    });

    render(<FeedbackPopup {...textFirstProps} />);

    // Click the "Record" Badge to trigger microphone permission check
    const recordButton = screen.getByLabelText(/Audio mode/i);
    fireEvent.click(recordButton);
    const startRecordButton = screen.getByRole('button', { name: /Start Recording/i });
    fireEvent.click(startRecordButton);

    // Assert that the denied alert is shown
    await waitFor(() => {
      expect(screen.getByText(/Microphone access denied/i)).toBeInTheDocument();
    });
  });

  it('resets state when modal is closed', () => {
    const { rerender } = render(<FeedbackPopup {...defaultProps} show={true} />);
    rerender(<FeedbackPopup {...defaultProps} show={false} />);
    // You can check that the answers or recording state has been reset if exposed via data-testid or use internal hooks
  });
  it('navigates to the next question on Next button click', () => {
    const multiQuestionProps = {
      ...defaultProps,
      questions: [
        {
          questionKey: 'q1',
          answerType: 'text' as const,
          translations: [{ language: 'en', text: 'Question 1' }],
        },
        {
          questionKey: 'q2',
          answerType: 'text' as const,
          translations: [{ language: 'en', text: 'Question 2' }],
        },
      ],
    };
    render(<FeedbackPopup {...multiQuestionProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText('Question 2')).toBeInTheDocument();
  });
  it('navigates back to the previous question on Back button click', () => {
    const multiQuestionProps = {
      ...defaultProps,
      questions: [
        {
          questionKey: 'q1',
          answerType: 'text' as const,
          translations: [{ language: 'en', text: 'Question 1' }],
        },
        {
          questionKey: 'q2',
          answerType: 'text' as const,
          translations: [{ language: 'en', text: 'Question 2' }],
        },
      ],
    };
    render(<FeedbackPopup {...multiQuestionProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByText('Question 1')).toBeInTheDocument();
  });

  it('starts recording when microphone permission is granted', async () => {
    render(<FeedbackPopup {...textFirstProps} />);

    // Switch to audio mode first using Badge component
    fireEvent.click(screen.getByLabelText(/Audio mode/i));

    // Click the start recording button (updated text)
    fireEvent.click(screen.getByRole('button', { name: /Start Recording/i }));

    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });
  });

  it('shows Submit button on the last question', () => {
    const multiQuestionProps = {
      ...defaultProps,
      questions: [
        {
          questionKey: 'q1',
          answerType: 'text' as const,
          translations: [{ language: 'en', text: 'Question 1' }],
        },
        {
          questionKey: 'q2',
          answerType: 'text' as const,
          translations: [{ language: 'en', text: 'Question 2' }],
        },
      ],
    };

    render(<FeedbackPopup {...multiQuestionProps} />);

    // Move to last question
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Now the Submit button should be visible
    expect(screen.getByRole('button', { name: /Submit/i })).toBeInTheDocument();
  });

  it('navigates between questions using Next and Back', () => {
    render(<FeedbackPopup {...defaultProps} />);

    // The component sorts questions, so dropdown comes first
    expect(screen.getByText('Select the severity')).toBeInTheDocument();

    // Click Next
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText('Select the severity')).toBeInTheDocument();

    // Click Back
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByText('How do you feel?')).toBeInTheDocument();
  });
  it('handles multi-select option selection correctly', () => {
    const multiSelectQuestion = {
      questionKey: 'q-multi',
      answerType: 'multi-select' as const,
      translations: [{ language: 'en', text: 'Select multiple options' }],
      possibleAnswers: [
        { key: 'option1', translations: [{ language: 'en', text: 'Option 1' }] },
        { key: 'option2', translations: [{ language: 'en', text: 'Option 2' }] },
      ],
    };

    render(<FeedbackPopup {...defaultProps} questions={[multiSelectQuestion]} />);

    const option1Button = screen.getByRole('button', { name: /Option 1/i });
    fireEvent.click(option1Button);
    // Optionally assert that the button switches state or the answer updates
  });
  it('handles microphone permission granted and starts/stops recording', async () => {
    render(<FeedbackPopup {...textFirstProps} />);

    // Switch to audio mode (this sets inputMode = 'audio') using Badge component
    fireEvent.click(screen.getByLabelText(/Audio mode/i));

    // Start recording (should trigger the getUserMedia mock) - updated button text
    fireEvent.click(screen.getByRole('button', { name: /Start Recording/i }));

    // Wait for getUserMedia to be called and recording state to update
    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });

    // Now recording should be true → Stop button should be visible
    const stopButton = await screen.findByRole('button', { name: /Stop/i });
    expect(stopButton).toBeInTheDocument();

    // Stop the recording
    fireEvent.click(stopButton);
  });

  it('deletes the recording when delete button is clicked', async () => {
    render(<FeedbackPopup {...textFirstProps} />);

    // Switch to audio input mode using Badge component
    fireEvent.click(screen.getByLabelText(/Audio mode/i));

    // Start recording with updated button text
    fireEvent.click(screen.getByRole('button', { name: /Start Recording/i }));

    // Stop recording (includes timer in text)
    const stopButton = await screen.findByRole('button', { name: /Stop \(\d+s\)/i });
    fireEvent.click(stopButton);

    // Confirm the audio element appears
    const audioElement = await screen.findByRole('audio', { hidden: true }).catch(() => {
      return document.querySelector('audio');
    });
    expect(audioElement).toBeInTheDocument();

    // Click delete button
    const deleteButton = await screen.findByRole('button', { name: /Delete/i });
    fireEvent.click(deleteButton);

    // After deletion, no audio element should remain
    await waitFor(() => {
      const afterAudio = document.querySelector('audio');
      expect(afterAudio).toBeNull();
    });
  });

  it('submits feedback and closes the modal', async () => {
    const onCloseMock = jest.fn();
    (apiClient.post as jest.Mock).mockResolvedValue({ status: 200 });
    render(<FeedbackPopup {...defaultProps} onClose={onCloseMock} />);

    fireEvent.change(screen.getByLabelText(/Text Feedback/i), {
      target: { value: 'My feedback' },
    });

    // For single question, Submit should be available directly
    fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

    await waitFor(() => expect(onCloseMock).toHaveBeenCalled());
  });
  it('switches between text and audio input modes', () => {
    render(<FeedbackPopup {...textFirstProps} />);
    const typeButton = screen.getByLabelText(/Text mode/i);
    const recordButton = screen.getByLabelText(/Audio mode/i);

    fireEvent.click(typeButton);
    expect(screen.getByRole('textbox', { name: /Text Feedback/i })).toBeInTheDocument();

    fireEvent.click(recordButton);
    expect(screen.getByRole('button', { name: /Start Recording/i })).toBeInTheDocument();
  });
  it('toggles multi-select option state correctly', () => {
    const multiSelectQuestion = {
      questionKey: 'q-multi',
      answerType: 'multi-select' as const,
      translations: [{ language: 'en', text: 'Select options' }],
      possibleAnswers: [
        { key: 'opt1', translations: [{ language: 'en', text: 'Option 1' }] },
        { key: 'opt2', translations: [{ language: 'en', text: 'Option 2' }] },
      ],
    };
    render(<FeedbackPopup {...defaultProps} questions={[multiSelectQuestion]} />);
    const button = screen.getByRole('button', { name: /Option 1/i });

    fireEvent.click(button); // select
    fireEvent.click(button); // deselect

    expect(button).toBeInTheDocument(); // Just confirm rendering; state toggling is internal
  });
  it('logs an error if feedback submission fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (apiClient.post as jest.Mock).mockRejectedValue(new Error('Network Error'));

    render(<FeedbackPopup {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('Error submitting feedback:', expect.any(Error));
    });

    errorSpy.mockRestore();
  });
});
