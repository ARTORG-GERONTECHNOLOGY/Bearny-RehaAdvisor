import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import QuestionnaireBuilderModal from '@/components/RehaTablePage/QuestionnaireBuilderModal';
import apiClient from '@/api/client';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));
jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { id: 'therapist-1' },
}));

// Radix Select (used by the "Answer type" field) relies on pointer capture /
// scrollIntoView APIs that jsdom doesn't implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

const selectAnswerType = async (
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  optionName: string
) => {
  await user.click(screen.getByLabelText(label));
  await user.click(await screen.findByRole('option', { name: optionName }));
};

const defaultProps = {
  show: true,
  onHide: jest.fn(),
  onSuccess: jest.fn(),
};

describe('QuestionnaireBuilderModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  describe('rendering', () => {
    it('renders the modal title', () => {
      render(<QuestionnaireBuilderModal {...defaultProps} />);
      expect(screen.getByText('Create questionnaire')).toBeInTheDocument();
    });

    it('does not render when show=false', () => {
      render(<QuestionnaireBuilderModal {...defaultProps} show={false} />);
      expect(screen.queryByText('Create questionnaire')).not.toBeInTheDocument();
    });

    it('starts with a single blank question', () => {
      render(<QuestionnaireBuilderModal {...defaultProps} />);
      expect(screen.getByText('Question 1')).toBeInTheDocument();
      expect(screen.queryByText('Question 2')).not.toBeInTheDocument();
    });

    it('does not show a Delete button when there is only one question', () => {
      render(<QuestionnaireBuilderModal {...defaultProps} />);
      expect(screen.queryByRole('button', { name: /^Delete$/i })).not.toBeInTheDocument();
    });

    it('does not show the options field for an open-answer question', () => {
      render(<QuestionnaireBuilderModal {...defaultProps} />);
      expect(screen.queryByLabelText(/Options/i)).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Adding / removing questions
  // ------------------------------------------------------------------
  describe('adding and removing questions', () => {
    it('adds a new blank question', () => {
      render(<QuestionnaireBuilderModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /Add question/i }));
      expect(screen.getByText('Question 2')).toBeInTheDocument();
    });

    it('shows Delete buttons once there is more than one question and removes one', () => {
      render(<QuestionnaireBuilderModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /Add question/i }));
      expect(screen.getAllByRole('button', { name: /^Delete$/i })).toHaveLength(2);

      fireEvent.click(screen.getAllByRole('button', { name: /^Delete$/i })[0]);
      expect(screen.queryByText('Question 2')).not.toBeInTheDocument();
      expect(screen.getByText('Question 1')).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Options field visibility
  // ------------------------------------------------------------------
  describe('answer type / options', () => {
    it('reveals the options field for a one-choice question', async () => {
      const user = userEvent.setup();
      render(<QuestionnaireBuilderModal {...defaultProps} />);
      await selectAnswerType(user, 'Answer type', 'One choice');
      expect(screen.getByLabelText(/Options/i)).toBeInTheDocument();
    });

    it('reveals the options field for a multiple-choice question', async () => {
      const user = userEvent.setup();
      render(<QuestionnaireBuilderModal {...defaultProps} />);
      await selectAnswerType(user, 'Answer type', 'Multiple choice');
      expect(screen.getByLabelText(/Options/i)).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // canSubmit / Create button state
  // ------------------------------------------------------------------
  describe('Create button state', () => {
    it('is disabled with an empty title', () => {
      render(<QuestionnaireBuilderModal {...defaultProps} />);
      expect(screen.getByRole('button', { name: /^Create$/i })).toBeDisabled();
    });

    it('is disabled when the question text is empty', () => {
      render(<QuestionnaireBuilderModal {...defaultProps} />);
      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Survey' } });
      expect(screen.getByRole('button', { name: /^Create$/i })).toBeDisabled();
    });

    it('is enabled once title and question text are filled for an open-answer question', () => {
      render(<QuestionnaireBuilderModal {...defaultProps} />);
      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Survey' } });
      fireEvent.change(screen.getByLabelText('Question text'), {
        target: { value: 'How do you feel?' },
      });
      expect(screen.getByRole('button', { name: /^Create$/i })).not.toBeDisabled();
    });

    it('is disabled for a one-choice question with fewer than two options', async () => {
      const user = userEvent.setup();
      render(<QuestionnaireBuilderModal {...defaultProps} />);
      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Survey' } });
      fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'Q1' } });
      await selectAnswerType(user, 'Answer type', 'One choice');
      fireEvent.change(screen.getByLabelText(/Options/i), { target: { value: 'Only one' } });
      expect(screen.getByRole('button', { name: /^Create$/i })).toBeDisabled();
    });

    it('is enabled for a one-choice question with two or more options', async () => {
      const user = userEvent.setup();
      render(<QuestionnaireBuilderModal {...defaultProps} />);
      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Survey' } });
      fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'Q1' } });
      await selectAnswerType(user, 'Answer type', 'One choice');
      fireEvent.change(screen.getByLabelText(/Options/i), { target: { value: 'Yes, No' } });
      expect(screen.getByRole('button', { name: /^Create$/i })).not.toBeDisabled();
    });
  });

  // ------------------------------------------------------------------
  // Submission
  // ------------------------------------------------------------------
  describe('submission', () => {
    const fillMinimalValidForm = () => {
      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Survey' } });
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'A short survey' },
      });
      fireEvent.change(screen.getByLabelText('Question text'), {
        target: { value: 'How do you feel?' },
      });
    };

    it('posts the built questionnaire payload and calls onSuccess + onHide on success', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({});

      render(<QuestionnaireBuilderModal {...defaultProps} />);
      fillMinimalValidForm();
      fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/questionnaires/health/', {
          title: 'My Survey',
          description: 'A short survey',
          subject: 'Healthstatus',
          therapistId: 'therapist-1',
          questions: [{ text: 'How do you feel?', type: 'open-answer', options: [] }],
        });
      });

      expect(defaultProps.onSuccess).toHaveBeenCalled();
      expect(defaultProps.onHide).toHaveBeenCalled();
    });

    it('parses comma/newline separated options for choice questions', async () => {
      const user = userEvent.setup();
      (apiClient.post as jest.Mock).mockResolvedValueOnce({});

      render(<QuestionnaireBuilderModal {...defaultProps} />);
      fillMinimalValidForm();
      await selectAnswerType(user, 'Answer type', 'Multiple choice');
      fireEvent.change(screen.getByLabelText(/Options/i), {
        target: { value: 'Red, Green\nBlue' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));

      await waitFor(() => {
        const payload = (apiClient.post as jest.Mock).mock.calls[0][1];
        expect(payload.questions[0].options).toEqual(['Red', 'Green', 'Blue']);
      });
    });

    it('shows an error message when the request fails', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: { data: { error: 'Server exploded' } },
      });

      render(<QuestionnaireBuilderModal {...defaultProps} />);
      fillMinimalValidForm();
      fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));

      expect(await screen.findByText('Server exploded')).toBeInTheDocument();
      expect(defaultProps.onHide).not.toHaveBeenCalled();
    });

    it('calls onHide when Cancel is clicked', () => {
      render(<QuestionnaireBuilderModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(defaultProps.onHide).toHaveBeenCalled();
    });
  });
});
