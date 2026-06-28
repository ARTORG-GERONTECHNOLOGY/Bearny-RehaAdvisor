import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import QuestionnaireDetailSheet from '@/components/RehaTablePage/QuestionnaireDetailSheet';

const t = (key: string) => key;

const answeredEntry = {
  questionKey: '16_profile_q1',
  questionTranslations: [{ language: 'en', text: 'How are you today?' }],
  answerType: 'select',
  answers: [{ key: '2', translations: [{ language: 'en', text: 'Good' }] }],
  comment: 'Felt better.',
  answered_at: '2026-02-01T10:00:00Z',
};

const sheetQuestion = {
  questionKey: 'q1',
  answerType: 'text',
  translations: [{ language: 'en', text: 'What is your pain level?' }],
  possibleAnswers: [{ key: 'low', translations: [{ language: 'en', text: 'Low' }] }],
};

const baseProps = {
  onClose: jest.fn(),
  isAssigned: false,
  onAssign: jest.fn(),
  answeredDays: [] as string[],
  answeredByDay: {} as Record<string, (typeof answeredEntry)[]>,
  sheetQuestions: [],
  t,
};

describe('QuestionnaireDetailSheet', () => {
  it('does not render content when closed', () => {
    render(<QuestionnaireDetailSheet {...baseProps} open={false} title="Profile (16)" />);
    expect(screen.queryByText('Profile (16)')).not.toBeInTheDocument();
  });

  it('renders title and description when open', () => {
    render(
      <QuestionnaireDetailSheet
        {...baseProps}
        open={true}
        title="Profile (16)"
        description="A profile questionnaire"
      />
    );
    expect(screen.getByText('Profile (16)')).toBeInTheDocument();
    expect(screen.getByText('A profile questionnaire')).toBeInTheDocument();
  });

  it('shows Assigned indicator when isAssigned', () => {
    render(<QuestionnaireDetailSheet {...baseProps} open={true} title="Q" isAssigned={true} />);
    expect(screen.getByText('Assigned')).toBeInTheDocument();
    expect(screen.queryByText('Assign')).not.toBeInTheDocument();
  });

  it('calls onAssign when Assign button clicked', () => {
    const onAssign = jest.fn();
    render(
      <QuestionnaireDetailSheet
        {...baseProps}
        open={true}
        title="Q"
        isAssigned={false}
        onAssign={onAssign}
      />
    );
    fireEvent.click(screen.getByText('Assign'));
    expect(onAssign).toHaveBeenCalled();
  });

  it('renders answered results grouped by day', () => {
    const day = '2026-02-01';
    render(
      <QuestionnaireDetailSheet
        {...baseProps}
        open={true}
        title="Q"
        isAssigned={true}
        answeredDays={[day]}
        answeredByDay={{ [day]: [answeredEntry] }}
      />
    );
    expect(screen.getByText('Answered results')).toBeInTheDocument();
    expect(screen.getByText('How are you today?')).toBeInTheDocument();
    expect(screen.getByText(/Good/)).toBeInTheDocument();
    expect(screen.getByText(/Felt better\./)).toBeInTheDocument();
  });

  it('renders questions list with options', () => {
    render(
      <QuestionnaireDetailSheet
        {...baseProps}
        open={true}
        title="Q"
        sheetQuestions={[sheetQuestion]}
      />
    );
    expect(screen.getByText(/What is your pain level?/)).toBeInTheDocument();
    expect(screen.getByText(/Type: text/)).toBeInTheDocument();
    expect(screen.getByText(/Low/)).toBeInTheDocument();
  });

  it('shows empty state when no questions', () => {
    render(<QuestionnaireDetailSheet {...baseProps} open={true} title="Q" sheetQuestions={[]} />);
    expect(screen.getByText('No questions found')).toBeInTheDocument();
  });
});
