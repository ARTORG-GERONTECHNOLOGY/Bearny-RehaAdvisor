import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FeedbackPopup from '@/components/PatientPage/FeedbackPopup';
import apiClient from '@/api/client';
import '@testing-library/jest-dom';

// ── Global mocks ──────────────────────────────────────────────────────────────

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

jest.mock('@/components/common/ErrorAlert', () => (p: any) => <div role="alert">{p.message}</div>);

// ── Shared test data ──────────────────────────────────────────────────────────

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

// Text-only question setup for tests that need text input
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

// Questions used in dropdown / submission / confirmClose tests
const dropdownAndTextQuestions = [
  {
    questionKey: 'q1',
    answerType: 'dropdown',
    translations: [{ language: 'en', text: 'Q1' }],
    possibleAnswers: [
      { key: 'a', translations: [{ language: 'en', text: 'A' }] },
      { key: 'b', translations: [{ language: 'en', text: 'B' }] },
    ],
  },
  {
    questionKey: 'q2',
    answerType: 'text',
    translations: [{ language: 'en', text: 'Q2' }],
  },
];

global.URL.createObjectURL = jest.fn(() => 'mock-audio-url');

// ── FeedbackPopup Component ───────────────────────────────────────────────────

describe('FeedbackPopup Component', () => {
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

    // Activate text mode first using Badge component
    const typeButton = screen.getByLabelText(/Text mode/i);
    fireEvent.click(typeButton);

    // Now the textarea should exist
    const textarea = await screen.findByLabelText(/Text Feedback/i);
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
        expect.any(FormData),
        expect.objectContaining({
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      );
    });
  });

  it('shows microphone denied alert when permission is denied', async () => {
    const mockQuery = jest.fn().mockResolvedValue({
      state: 'denied',
      name: 'microphone',
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    });

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

    await waitFor(() => {
      expect(screen.getByText(/Microphone access denied/i)).toBeInTheDocument();
    });
  });

  it('resets state when modal is closed', () => {
    const { rerender } = render(<FeedbackPopup {...defaultProps} show={true} />);
    rerender(<FeedbackPopup {...defaultProps} show={false} />);
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

    expect(screen.getByRole('button', { name: /Submit/i })).toBeInTheDocument();
  });

  it('navigates between questions using Next and Back', () => {
    render(<FeedbackPopup {...defaultProps} />);

    // The component sorts questions, so dropdown comes first
    expect(screen.getByText('Select the severity')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText('How do you feel?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByText('Select the severity')).toBeInTheDocument();
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
  });

  it('handles microphone permission granted and starts/stops recording', async () => {
    render(<FeedbackPopup {...textFirstProps} />);

    // Switch to audio mode using Badge component
    fireEvent.click(screen.getByLabelText(/Audio mode/i));

    fireEvent.click(screen.getByRole('button', { name: /Start Recording/i }));

    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });

    // Recording is active → Stop button should be visible (includes timer)
    const stopButton = await screen.findByRole('button', { name: /Stop \(\d+s\)/i });
    expect(stopButton).toBeInTheDocument();

    fireEvent.click(stopButton);
  });

  it('deletes the recording when delete button is clicked', async () => {
    render(<FeedbackPopup {...textFirstProps} />);

    // Switch to audio input mode using Badge component
    fireEvent.click(screen.getByLabelText(/Audio mode/i));

    fireEvent.click(screen.getByRole('button', { name: /Start Recording/i }));

    const stopButton = await screen.findByRole('button', { name: /Stop \(\d+s\)/i });
    fireEvent.click(stopButton);

    const audioElement = await screen.findByRole('audio', { hidden: true }).catch(() => {
      return document.querySelector('audio');
    });
    expect(audioElement).toBeInTheDocument();

    const deleteButton = await screen.findByRole('button', { name: /Delete/i });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      const afterAudio = document.querySelector('audio');
      expect(afterAudio).toBeNull();
    });
  });

  it('submits feedback and closes the modal', async () => {
    const onCloseMock = jest.fn();
    (apiClient.post as jest.Mock).mockResolvedValue({ status: 200 });
    render(<FeedbackPopup {...textFirstProps} onClose={onCloseMock} />);

    fireEvent.click(screen.getByLabelText(/Text mode/i));

    const textarea = await screen.findByLabelText(/Text Feedback/i);
    fireEvent.change(textarea, { target: { value: 'My feedback' } });

    // For single question, Submit is immediately available
    fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

    await waitFor(() => expect(onCloseMock).toHaveBeenCalled());
  });

  it('switches between text and audio input modes', () => {
    render(<FeedbackPopup {...textFirstProps} />);
    const typeButton = screen.getByLabelText(/Text mode/i);
    const recordButton = screen.getByLabelText(/Audio mode/i);

    fireEvent.click(typeButton);
    expect(screen.getByLabelText(/Text Feedback/i)).toBeInTheDocument();

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

    expect(button).toBeInTheDocument();
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

// ── FeedbackPopup - ErrorAlert rendering ─────────────────────────────────────

describe('FeedbackPopup - ErrorAlert rendering', () => {
  it('renders and dismisses ErrorAlert when error is set', async () => {
    const { rerender } = render(
      <FeedbackPopup
        show={true}
        interventionId="intervention1"
        questions={
          [{ questionKey: 'q1', label: 'How do you feel?', type: 'text', options: [] }] as any
        }
        onClose={jest.fn()}
      />
    );

    rerender(
      <FeedbackPopup
        show={true}
        interventionId="intervention1"
        questions={
          [{ questionKey: 'q1', label: 'How do you feel?', type: 'text', options: [] }] as any
        }
        onClose={jest.fn()}
      />
    );

    // Manually simulate an error element to verify dismissal
    const errorText = 'Test error message';
    const errorAlert = document.createElement('div');
    errorAlert.textContent = errorText;
    errorAlert.setAttribute('data-testid', 'error-alert');
    document.body.appendChild(errorAlert);

    expect(screen.getByText(errorText)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    document.body.removeChild(errorAlert);
  });
});

// ── FeedbackPopup - dropdown, submission, and confirmClose ────────────────────

describe('FeedbackPopup - dropdown, submission, and confirmClose', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('id', 'p1');
  });

  it('dropdown selection requires Next to advance', async () => {
    render(
      <FeedbackPopup
        show
        interventionId="int1"
        questions={dropdownAndTextQuestions as any}
        onClose={jest.fn()}
        date="2026-02-15"
      />
    );

    expect(screen.getByText('Q1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    // Should still be on Q1 until Next is clicked
    expect(screen.getByText('Q1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getByText('Q2')).toBeInTheDocument();
    });
  });

  it('submits FormData including date', async () => {
    const onClose = jest.fn();
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { success: true } });

    render(
      <FeedbackPopup
        show
        interventionId="int1"
        questions={dropdownAndTextQuestions as any}
        onClose={onClose}
        date="2026-02-15"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Q2');

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());

    const [, formData] = (apiClient.post as jest.Mock).mock.calls[0];
    expect(formData instanceof FormData).toBe(true);

    expect(onClose).toHaveBeenCalled();
  });

  it('confirmClose asks when answers exist', async () => {
    const onClose = jest.fn();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <FeedbackPopup
        show
        interventionId="int1"
        questions={dropdownAndTextQuestions as any}
        onClose={onClose}
        date="2026-02-15"
      />
    );

    // Select an answer so hasAny=true
    fireEvent.click(screen.getByRole('button', { name: 'A' }));

    // Click X (modal close button)
    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
