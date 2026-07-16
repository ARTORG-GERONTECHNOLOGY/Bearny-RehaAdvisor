import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import EditQuestionnaireDialog from '@/components/AdminDashboard/EditQuestionnaireDialog';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const defaultProps = {
  open: true,
  title: 'PHQ-9',
  description: 'Depression screening',
  tags: 'mental-health',
  error: null as string | null,
  saving: false,
  onTitleChange: jest.fn(),
  onDescriptionChange: jest.fn(),
  onTagsChange: jest.fn(),
  onDismissError: jest.fn(),
  onCancel: jest.fn(),
  onSave: jest.fn(),
};

describe('EditQuestionnaireDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(<EditQuestionnaireDialog {...defaultProps} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the current title, description and tags', () => {
    render(<EditQuestionnaireDialog {...defaultProps} />);
    expect(screen.getByDisplayValue('PHQ-9')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Depression screening')).toBeInTheDocument();
    expect(screen.getByDisplayValue('mental-health')).toBeInTheDocument();
  });

  it('calls the change handlers when fields are edited', () => {
    render(<EditQuestionnaireDialog {...defaultProps} />);
    fireEvent.change(screen.getByDisplayValue('PHQ-9'), { target: { value: 'PHQ-9 Updated' } });
    expect(defaultProps.onTitleChange).toHaveBeenCalledWith('PHQ-9 Updated');

    fireEvent.change(screen.getByDisplayValue('Depression screening'), {
      target: { value: 'Updated description' },
    });
    expect(defaultProps.onDescriptionChange).toHaveBeenCalledWith('Updated description');

    fireEvent.change(screen.getByDisplayValue('mental-health'), {
      target: { value: 'mental-health, phq' },
    });
    expect(defaultProps.onTagsChange).toHaveBeenCalledWith('mental-health, phq');
  });

  it('calls onCancel when Cancel is clicked', () => {
    render(<EditQuestionnaireDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('calls onSave when Save is clicked', () => {
    render(<EditQuestionnaireDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(defaultProps.onSave).toHaveBeenCalled();
  });

  it('disables Save when the title is blank', () => {
    render(<EditQuestionnaireDialog {...defaultProps} title="   " />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows "Saving..." and disables buttons while saving', () => {
    render(<EditQuestionnaireDialog {...defaultProps} saving />);
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('shows an error alert and dismisses it', () => {
    render(<EditQuestionnaireDialog {...defaultProps} error="Failed to save." />);
    expect(screen.getByText('Failed to save.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close alert' }));
    expect(defaultProps.onDismissError).toHaveBeenCalled();
  });

  it('calls onCancel when closed via the header close button', () => {
    render(<EditQuestionnaireDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('hides the header close (X) button while saving', () => {
    render(<EditQuestionnaireDialog {...defaultProps} saving />);
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('does not call onCancel when dismissed via onOpenChange while saving', () => {
    render(<EditQuestionnaireDialog {...defaultProps} saving />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
    expect(defaultProps.onCancel).not.toHaveBeenCalled();
  });
});
