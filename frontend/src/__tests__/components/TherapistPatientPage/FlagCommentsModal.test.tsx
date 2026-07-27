import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FlagCommentsModal from '@/components/TherapistPatientPage/FlagCommentsModal';
import type { PatientComment } from '@/types';
import type { TherapistPatientsStore } from '@/stores/therapistPatientsStore';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const comment = (overrides: Partial<PatientComment> = {}): PatientComment => ({
  text: 'Called patient, left voicemail.',
  created_at: '2026-01-01T10:00:00Z',
  commented_by: 'Dr. House',
  ...overrides,
});

const makeStore = (overrides: Record<string, unknown> = {}) =>
  ({
    showFlagCommentsModal: true,
    closeFlagComments: jest.fn(),
    flagCommentsPatientName: 'Jane Doe',
    newCommentText: '',
    setNewCommentText: jest.fn(),
    commentSubmitting: false,
    addComment: jest.fn(),
    commentsError: '',
    commentsLoading: false,
    comments: [] as PatientComment[],
    ...overrides,
  }) as unknown as TherapistPatientsStore;

describe('FlagCommentsModal', () => {
  it('does not render when the store says the modal is hidden', () => {
    render(<FlagCommentsModal store={makeStore({ showFlagCommentsModal: false })} />);
    expect(screen.queryByText('Comments')).not.toBeInTheDocument();
  });

  it('renders the title and the patient name as the description', () => {
    render(<FlagCommentsModal store={makeStore()} />);
    expect(screen.getByText('Comments')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('reflects the draft comment text from the store', () => {
    render(<FlagCommentsModal store={makeStore({ newCommentText: 'draft text' })} />);
    expect(screen.getByPlaceholderText('e.g. Called patient, left voicemail.')).toHaveValue(
      'draft text'
    );
  });

  it('calls setNewCommentText as the therapist types', () => {
    const store = makeStore();
    render(<FlagCommentsModal store={store} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Called patient, left voicemail.'), {
      target: { value: 'Called again.' },
    });
    expect(store.setNewCommentText).toHaveBeenCalledWith('Called again.');
  });

  it('disables the Add comment button when the draft is empty', () => {
    render(<FlagCommentsModal store={makeStore({ newCommentText: '' })} />);
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeDisabled();
  });

  it('disables the Add comment button when the draft is whitespace-only', () => {
    render(<FlagCommentsModal store={makeStore({ newCommentText: '   ' })} />);
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeDisabled();
  });

  it('enables the Add comment button once there is real draft text', () => {
    render(<FlagCommentsModal store={makeStore({ newCommentText: 'hello' })} />);
    expect(screen.getByRole('button', { name: 'Add comment' })).not.toBeDisabled();
  });

  it('shows "Adding..." and disables the textarea while submitting', () => {
    render(
      <FlagCommentsModal store={makeStore({ newCommentText: 'hello', commentSubmitting: true })} />
    );
    expect(screen.getByRole('button', { name: 'Adding...' })).toBeDisabled();
    expect(screen.getByPlaceholderText('e.g. Called patient, left voicemail.')).toBeDisabled();
  });

  it('calls addComment when the form is submitted', () => {
    const store = makeStore({ newCommentText: 'Called patient.' });
    render(<FlagCommentsModal store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
    expect(store.addComment).toHaveBeenCalledWith(expect.any(Function));
  });

  it('shows an error alert when commentsError is set', () => {
    render(<FlagCommentsModal store={makeStore({ commentsError: 'Failed to add comment.' })} />);
    expect(screen.getByText('Failed to add comment.')).toBeInTheDocument();
  });

  it('does not show an error alert when there is no error', () => {
    render(<FlagCommentsModal store={makeStore({ commentsError: '' })} />);
    expect(screen.queryByText('Failed to add comment.')).not.toBeInTheDocument();
  });

  it('shows a loading state instead of the history while comments are loading', () => {
    render(<FlagCommentsModal store={makeStore({ commentsLoading: true })} />);
    expect(screen.queryByText('No comments yet.')).not.toBeInTheDocument();
  });

  it('shows "No comments yet." when there is no history', () => {
    render(<FlagCommentsModal store={makeStore({ comments: [] })} />);
    expect(screen.getByText('No comments yet.')).toBeInTheDocument();
  });

  it('renders each comment with its author, time, and text', () => {
    render(<FlagCommentsModal store={makeStore({ comments: [comment()] })} />);
    expect(screen.getByText('Dr. House')).toBeInTheDocument();
    expect(screen.getByText('Called patient, left voicemail.')).toBeInTheDocument();
  });

  it('falls back to "Unknown" when a comment has no author', () => {
    render(<FlagCommentsModal store={makeStore({ comments: [comment({ commented_by: '' })] })} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders multiple history entries', () => {
    render(
      <FlagCommentsModal
        store={makeStore({
          comments: [
            comment({ text: 'First call' }),
            comment({ text: 'Second call', commented_by: 'Nurse Ratched' }),
          ],
        })}
      />
    );
    expect(screen.getByText('First call')).toBeInTheDocument();
    expect(screen.getByText('Second call')).toBeInTheDocument();
    expect(screen.getByText('Nurse Ratched')).toBeInTheDocument();
  });

  it('calls closeFlagComments when the dialog is dismissed', () => {
    const store = makeStore();
    render(<FlagCommentsModal store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(store.closeFlagComments).toHaveBeenCalled();
  });
});
