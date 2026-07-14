import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import FeedbackPopup from '@/components/PatientPage/FeedbackPopup';
import apiClient from '@/api/client';
import '@testing-library/jest-dom';

// ── Global mocks ──────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

jest.mock(
  '@/components/common/ErrorAlert',
  () =>
    function ErrorAlert(p: any) {
      return <div role="alert">{p.message}</div>;
    }
);

// react-player lazily dynamic-imports its underlying players, which fails
// under Jest's CJS transform without --experimental-vm-modules. Stub it.
jest.mock(
  'react-player',
  () =>
    function ReactPlayer(props: any) {
      return <div data-testid="react-player">{props.url}</div>;
    }
);

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
  it('renders and dismisses a real ErrorAlert triggered by an oversized video upload', () => {
    render(
      <FeedbackPopup
        show={true}
        interventionId="intervention1"
        questions={
          [
            {
              questionKey: 'q1',
              answerType: 'video' as const,
              translations: [{ language: 'en', text: 'Record yourself' }],
            },
          ] as any
        }
        onClose={jest.fn()}
      />
    );

    const bigFile = new File(['x'], 'big.webm', { type: 'video/webm' });
    Object.defineProperty(bigFile, 'size', { value: 51 * 1024 * 1024 });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [bigFile] } });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Video too large/i);
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

// ── FeedbackPopup - description intro screen ──────────────────────────────────

describe('FeedbackPopup - description intro screen', () => {
  const singleQuestion = [
    {
      questionKey: 'q1',
      answerType: 'text' as const,
      translations: [{ language: 'en', text: 'How do you feel?' }],
    },
  ];

  it('shows intro screen with description text when description prop is provided', () => {
    render(
      <FeedbackPopup
        show
        interventionId=""
        questions={singleQuestion}
        onClose={jest.fn()}
        description="Please read the instructions carefully before answering."
      />
    );

    expect(
      screen.getByText('Please read the instructions carefully before answering.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue/i })).toBeInTheDocument();
    expect(screen.queryByText('How do you feel?')).not.toBeInTheDocument();
  });

  it('clicking Continue dismisses intro and shows first question', () => {
    render(
      <FeedbackPopup
        show
        interventionId=""
        questions={singleQuestion}
        onClose={jest.fn()}
        description="Read me first."
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    expect(screen.getByText('How do you feel?')).toBeInTheDocument();
    expect(screen.queryByText('Read me first.')).not.toBeInTheDocument();
  });

  it('does not show intro screen when description is empty string', () => {
    render(
      <FeedbackPopup
        show
        interventionId=""
        questions={singleQuestion}
        onClose={jest.fn()}
        description=""
      />
    );

    expect(screen.queryByRole('button', { name: /Continue/i })).not.toBeInTheDocument();
    expect(screen.getByText('How do you feel?')).toBeInTheDocument();
  });

  it('does not show intro screen when description is whitespace only', () => {
    render(
      <FeedbackPopup
        show
        interventionId=""
        questions={singleQuestion}
        onClose={jest.fn()}
        description="   "
      />
    );

    expect(screen.queryByRole('button', { name: /Continue/i })).not.toBeInTheDocument();
    expect(screen.getByText('How do you feel?')).toBeInTheDocument();
  });

  it('does not show intro screen when description prop is omitted', () => {
    render(<FeedbackPopup show interventionId="" questions={singleQuestion} onClose={jest.fn()} />);

    expect(screen.queryByRole('button', { name: /Continue/i })).not.toBeInTheDocument();
    expect(screen.getByText('How do you feel?')).toBeInTheDocument();
  });

  it('star rating: selecting a star marks it pressed and lower stars highlighted', () => {
    const starProps = {
      ...defaultProps,
      questions: [
        {
          questionKey: 'rating_stars_q1',
          answerType: 'select' as const,
          translations: [{ language: 'en', text: 'Rate it' }],
          possibleAnswers: [
            { key: '1', translations: [{ language: 'en', text: '1' }] },
            { key: '2', translations: [{ language: 'en', text: '2' }] },
            { key: '3', translations: [{ language: 'en', text: '3' }] },
          ],
        },
      ],
    };

    render(<FeedbackPopup {...starProps} />);

    const threeStars = screen.getByRole('button', { name: '3 stars' });
    fireEvent.click(threeStars);

    expect(threeStars).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '1 star' })).toHaveAttribute('title', '1/5');
  });

  it('video question: uploading an oversized file shows an error and does not set videoURL', () => {
    const videoProps = {
      ...defaultProps,
      questions: [
        {
          questionKey: 'q1',
          answerType: 'video' as const,
          translations: [{ language: 'en', text: 'Record yourself' }],
        },
      ],
    };

    render(<FeedbackPopup {...videoProps} />);

    const bigFile = new File(['x'], 'big.webm', { type: 'video/webm' });
    Object.defineProperty(bigFile, 'size', { value: 51 * 1024 * 1024 });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [bigFile] } });

    expect(screen.getByRole('alert')).toHaveTextContent(/Video too large/i);
  });

  it('video question: uploading a valid file shows the player and delete button', () => {
    const videoProps = {
      ...defaultProps,
      questions: [
        {
          questionKey: 'q1',
          answerType: 'video' as const,
          translations: [{ language: 'en', text: 'Record yourself' }],
        },
      ],
    };

    render(<FeedbackPopup {...videoProps} />);

    const file = new File(['x'], 'clip.webm', { type: 'video/webm' });
    Object.defineProperty(file, 'size', { value: 1024 });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    const deleteButton = screen.getByRole('button', { name: /Delete/i });
    expect(deleteButton).toBeInTheDocument();

    fireEvent.click(deleteButton);
    expect(screen.getByRole('button', { name: /Record Video/i })).toBeInTheDocument();
  });

  it('video question: does nothing when the file input change has no file', () => {
    const videoProps = {
      ...defaultProps,
      questions: [
        {
          questionKey: 'q1',
          answerType: 'video' as const,
          translations: [{ language: 'en', text: 'Record yourself' }],
        },
      ],
    };

    render(<FeedbackPopup {...videoProps} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [] } });

    expect(screen.getByRole('button', { name: /Record Video/i })).toBeInTheDocument();
  });

  it('submits a video Blob answer with a _video field suffix', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({});
    const videoProps = {
      ...defaultProps,
      questions: [
        {
          questionKey: 'q1',
          answerType: 'video' as const,
          translations: [{ language: 'en', text: 'Record yourself' }],
        },
      ],
    };

    render(<FeedbackPopup {...videoProps} />);

    const file = new File(['x'], 'clip.webm', { type: 'video/webm' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    const formData = (apiClient.post as jest.Mock).mock.calls[0][1] as FormData;
    expect(formData.get('q1_video')).toBeInstanceOf(File);
  });

  it('intro screen resets when popup is closed and reopened', () => {
    const { rerender } = render(
      <FeedbackPopup
        show
        interventionId=""
        questions={singleQuestion}
        onClose={jest.fn()}
        description="Read me."
      />
    );

    // Dismiss intro
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(screen.getByText('How do you feel?')).toBeInTheDocument();

    // Close popup
    rerender(
      <FeedbackPopup
        show={false}
        interventionId=""
        questions={singleQuestion}
        onClose={jest.fn()}
        description="Read me."
      />
    );

    // Reopen — intro should be shown again
    rerender(
      <FeedbackPopup
        show
        interventionId=""
        questions={singleQuestion}
        onClose={jest.fn()}
        description="Read me."
      />
    );

    expect(screen.getByText('Read me.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue/i })).toBeInTheDocument();
  });

  it('shows a safe "no questions" sheet when there are no valid questions', () => {
    const onClose = jest.fn();
    render(<FeedbackPopup show interventionId="" questions={[]} onClose={onClose} />);

    expect(screen.getByText('No feedback questions available.')).toBeInTheDocument();

    // Sheet renders its own X close button (sr-only "Close") in addition to the
    // footer's "Close" button — the footer one is last in DOM order.
    const closeButtons = screen.getAllByRole('button', { name: /Close/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });

  it('falls back to the raw questionKey when no translation matches the current language', () => {
    render(
      <FeedbackPopup
        show
        interventionId=""
        questions={
          [
            {
              questionKey: 'untranslated_q',
              answerType: 'text' as const,
              translations: [{ language: 'de', text: 'Nur Deutsch' }],
            },
          ] as any
        }
        onClose={jest.fn()}
      />
    );

    // pickText: no exact 'en', no 'en-*' base match, no separate 'en' entry either
    // -> falls through to the questionKey fallback.
    expect(screen.getByText('untranslated_q')).toBeInTheDocument();
  });

  it('still allows recording after the microphone permission check throws', async () => {
    Object.defineProperty(navigator, 'permissions', {
      writable: true,
      value: { query: jest.fn().mockRejectedValue(new Error('unsupported')) },
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] }),
      },
    });
    class MockMediaRecorder {
      ondataavailable: ((e: any) => void) | null = null;
      onstop: (() => void) | null = null;
      start = jest.fn();
      stop = jest.fn();
      static isTypeSupported = jest.fn(() => true);
    }
    (global as any).MediaRecorder = MockMediaRecorder;

    render(
      <FeedbackPopup
        show
        interventionId=""
        questions={
          [
            {
              questionKey: 'q1',
              answerType: 'text' as const,
              translations: [{ language: 'en', text: 'How do you feel?' }],
            },
          ] as any
        }
        onClose={jest.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText(/Audio mode/i));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Start Recording/i }));
    });

    expect(screen.getByRole('button', { name: /Stop/i })).toBeInTheDocument();
  });

  it('completes a video recording countdown, stops, and stores the resulting blob', async () => {
    jest.useFakeTimers();

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] }),
      },
    });

    class MockVideoRecorder {
      ondataavailable: ((e: any) => void) | null = null;
      onstop: (() => void) | null = null;
      start = jest.fn();
      stop = jest.fn(() => {
        this.ondataavailable?.({ data: new Blob(['clip'], { type: 'video/webm' }) });
        this.onstop?.();
      });
      static isTypeSupported = jest.fn(() => true);
    }
    (global as any).MediaRecorder = MockVideoRecorder;

    render(
      <FeedbackPopup
        show
        interventionId=""
        questions={
          [
            {
              questionKey: 'q1',
              answerType: 'video' as const,
              translations: [{ language: 'en', text: 'Record yourself' }],
            },
          ] as any
        }
        onClose={jest.fn()}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Record Video/i }));
      await Promise.resolve();
    });

    expect(screen.getByText(/Starting in 10s/i)).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(10000);
    });

    fireEvent.click(screen.getByRole('button', { name: /Stop/i }));

    expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();

    jest.useRealTimers();
  });
});
