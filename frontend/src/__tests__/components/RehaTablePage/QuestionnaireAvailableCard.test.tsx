import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import QuestionnaireAvailableCard from '@/components/RehaTablePage/QuestionnaireAvailableCard';

const t = (key: string) => key;

const baseQ = { title: 'Profile (16)', question_count: 8, created_by_name: 'System' };

describe('QuestionnaireAvailableCard', () => {
  it('renders title, creator and question count', () => {
    render(
      <QuestionnaireAvailableCard
        q={baseQ}
        isAssigned={false}
        onOpen={jest.fn()}
        onAssign={jest.fn()}
        t={t}
      />
    );
    expect(screen.getByText('Profile (16)')).toBeInTheDocument();
    expect(screen.getByText(/System/)).toBeInTheDocument();
    expect(screen.getByText(/8 Questions/)).toBeInTheDocument();
  });

  it('shows Assign button when not yet assigned', () => {
    const onAssign = jest.fn();
    const onOpen = jest.fn();
    render(
      <QuestionnaireAvailableCard
        q={baseQ}
        isAssigned={false}
        onOpen={onOpen}
        onAssign={onAssign}
        t={t}
      />
    );
    fireEvent.click(screen.getByText('Assign'));
    expect(onAssign).toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('shows Assigned indicator and hides Assign button when already assigned', () => {
    render(
      <QuestionnaireAvailableCard
        q={baseQ}
        isAssigned={true}
        onOpen={jest.fn()}
        onAssign={jest.fn()}
        t={t}
      />
    );
    expect(screen.getByText('Assigned')).toBeInTheDocument();
    expect(screen.queryByText('Assign')).not.toBeInTheDocument();
  });

  it('calls onOpen when the card body is clicked', () => {
    const onOpen = jest.fn();
    render(
      <QuestionnaireAvailableCard
        q={baseQ}
        isAssigned={false}
        onOpen={onOpen}
        onAssign={jest.fn()}
        t={t}
      />
    );
    fireEvent.click(screen.getByText('Profile (16)'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('renders without creator or question count when not provided', () => {
    render(
      <QuestionnaireAvailableCard
        q={{ title: 'Minimal Q' }}
        isAssigned={false}
        onOpen={jest.fn()}
        onAssign={jest.fn()}
        t={t}
      />
    );
    expect(screen.getByText('Minimal Q')).toBeInTheDocument();
  });
});
