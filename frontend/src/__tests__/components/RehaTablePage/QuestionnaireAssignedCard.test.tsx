import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import QuestionnaireAssignedCard from '@/components/RehaTablePage/QuestionnaireAssignedCard';

const t = (key: string) => key;

const baseA = {
  title: 'Profile (16)',
  question_count: 8,
  frequency: 'Monthly',
  dates: ['2026-06-15T00:00:00Z'],
  answered_entries: [{ questionKey: 'q1' }, { questionKey: 'q2' }],
};

describe('QuestionnaireAssignedCard', () => {
  it('renders title and question count', () => {
    render(
      <QuestionnaireAssignedCard
        a={baseA}
        onOpen={jest.fn()}
        onModify={jest.fn()}
        onRemove={jest.fn()}
        t={t}
      />
    );
    expect(screen.getByText('Profile (16)')).toBeInTheDocument();
    expect(screen.getByText(/8 Questions/)).toBeInTheDocument();
  });

  it('shows frequency, next date and answered count badges', () => {
    render(
      <QuestionnaireAssignedCard
        a={baseA}
        onOpen={jest.fn()}
        onModify={jest.fn()}
        onRemove={jest.fn()}
        t={t}
      />
    );
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText(/Next on/)).toBeInTheDocument();
    expect(screen.getByText(/2 Answered/)).toBeInTheDocument();
  });

  it('calls onOpen when card body is clicked', () => {
    const onOpen = jest.fn();
    render(
      <QuestionnaireAssignedCard
        a={baseA}
        onOpen={onOpen}
        onModify={jest.fn()}
        onRemove={jest.fn()}
        t={t}
      />
    );
    fireEvent.click(screen.getByText('Profile (16)'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('calls onModify without triggering onOpen', () => {
    const onOpen = jest.fn();
    const onModify = jest.fn();
    render(
      <QuestionnaireAssignedCard
        a={baseA}
        onOpen={onOpen}
        onModify={onModify}
        onRemove={jest.fn()}
        t={t}
      />
    );
    const [editBtn] = screen.getAllByRole('button');
    fireEvent.click(editBtn);
    expect(onModify).toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('calls onRemove without triggering onOpen', () => {
    const onOpen = jest.fn();
    const onRemove = jest.fn();
    render(
      <QuestionnaireAssignedCard
        a={baseA}
        onOpen={onOpen}
        onModify={jest.fn()}
        onRemove={onRemove}
        t={t}
      />
    );
    const [, removeBtn] = screen.getAllByRole('button');
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('omits optional badges when data is missing', () => {
    render(
      <QuestionnaireAssignedCard
        a={{ title: 'Minimal' }}
        onOpen={jest.fn()}
        onModify={jest.fn()}
        onRemove={jest.fn()}
        t={t}
      />
    );
    expect(screen.queryByText(/Next on/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Answered/)).not.toBeInTheDocument();
  });
});
