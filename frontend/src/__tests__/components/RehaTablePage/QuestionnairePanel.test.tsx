import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import QuestionnairePanel from '@/components/RehaTablePage/QuestionnairePanel';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const t = (key: string) => key;

const catalogItem = {
  _id: 'q1',
  key: 'q1',
  title: 'Profile Questionnaire',
  question_count: 3,
  created_by_name: 'System',
  questions: [
    {
      questionKey: 'q1_1',
      answerType: 'text',
      translations: [{ language: 'en', text: 'How do you feel?' }],
    },
  ],
};

const assignedItem = {
  _id: 'a1',
  title: 'Assigned Profile',
  question_count: 2,
  frequency: 'Weekly',
  dates: [],
  answered_entries: [
    {
      questionKey: 'q1_1',
      questionTranslations: [{ language: 'en', text: 'How do you feel?' }],
      answers: [{ key: 'good', translations: [{ language: 'en', text: 'Good' }] }],
      answered_at: '2026-02-01T10:00:00Z',
    },
    {
      questionKey: 'q1_2',
      answered_at: '2026-01-15T09:00:00Z',
    },
  ],
};

const makeActions = () => ({
  openAddQ: jest.fn(),
  openModifyQ: jest.fn(),
  removeQ: jest.fn(),
  openBuilder: jest.fn(),
});

describe('QuestionnairePanel', () => {
  it('shows empty states when there are no available or assigned questionnaires', () => {
    render(
      <QuestionnairePanel
        data={{ questionnaires: [], assignedQuestionnaires: [] }}
        actions={makeActions()}
        t={t as any}
      />
    );

    expect(screen.getByText('No questionnaires found')).toBeInTheDocument();
    expect(screen.getByText('No questionnaires assigned')).toBeInTheDocument();
  });

  it('calls openBuilder when Create is clicked', () => {
    const actions = makeActions();
    render(
      <QuestionnairePanel
        data={{ questionnaires: [], assignedQuestionnaires: [] }}
        actions={actions}
        t={t as any}
      />
    );

    fireEvent.click(screen.getByText('Create'));
    expect(actions.openBuilder).toHaveBeenCalled();
  });

  it('calls openAddQ when Assign is clicked on an available (unassigned) questionnaire', () => {
    const actions = makeActions();
    render(
      <QuestionnairePanel
        data={{ questionnaires: [catalogItem], assignedQuestionnaires: [] }}
        actions={actions}
        t={t as any}
      />
    );

    fireEvent.click(screen.getByText('Assign'));
    expect(actions.openAddQ).toHaveBeenCalledWith(catalogItem);
  });

  it('marks an available questionnaire as Assigned when it is present in assignedQuestionnaires', () => {
    render(
      <QuestionnairePanel
        data={{
          questionnaires: [catalogItem],
          assignedQuestionnaires: [{ ...assignedItem, _id: 'q1' }],
        }}
        actions={makeActions()}
        t={t as any}
      />
    );

    expect(screen.getByText('Assigned')).toBeInTheDocument();
    expect(screen.queryByText('Assign')).not.toBeInTheDocument();
  });

  it('opens the detail sheet with catalog questions and no answered-results section for an available item', async () => {
    render(
      <QuestionnairePanel
        data={{ questionnaires: [catalogItem], assignedQuestionnaires: [] }}
        actions={makeActions()}
        t={t as any}
      />
    );

    fireEvent.click(screen.getByText('Profile Questionnaire'));

    expect(await screen.findByText(/How do you feel\?/)).toBeInTheDocument();
    expect(screen.queryByText('Answered results')).not.toBeInTheDocument();
  });

  it('opens the detail sheet for an assigned item, grouping and sorting answered entries by day (newest first)', async () => {
    render(
      <QuestionnairePanel
        data={{ questionnaires: [], assignedQuestionnaires: [assignedItem] }}
        actions={makeActions()}
        t={t as any}
      />
    );

    fireEvent.click(screen.getByText('Assigned Profile'));

    expect(await screen.findByText(/Good/)).toBeInTheDocument();
    const days = [screen.getByText('2026-02-01'), screen.getByText('2026-01-15')].map(
      (el) => el.textContent
    );
    expect(days).toEqual(['2026-02-01', '2026-01-15']);
    // '2026-02-01' (newer) must precede '2026-01-15' in document order.
    expect(
      screen.getByText('2026-02-01').compareDocumentPosition(screen.getByText('2026-01-15')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("falls back to the assigned record's own questions when the catalog has no matching entry", async () => {
    const assignedWithQuestions = {
      ...assignedItem,
      questions: [
        {
          questionKey: 'standalone_q',
          answerType: 'text',
          translations: [{ language: 'en', text: 'Standalone question?' }],
        },
      ],
    };
    render(
      <QuestionnairePanel
        data={{ questionnaires: [], assignedQuestionnaires: [assignedWithQuestions] }}
        actions={makeActions()}
        t={t as any}
      />
    );

    fireEvent.click(screen.getByText('Assigned Profile'));
    expect(await screen.findByText(/Standalone question?/)).toBeInTheDocument();
  });

  it('calls openModifyQ with the assigned item id/title when Edit is clicked', () => {
    const actions = makeActions();
    render(
      <QuestionnairePanel
        data={{ questionnaires: [], assignedQuestionnaires: [assignedItem] }}
        actions={actions}
        t={t as any}
      />
    );

    fireEvent.click(screen.getByLabelText('Edit questionnaire'));
    expect(actions.openModifyQ).toHaveBeenCalledWith({
      _id: 'a1',
      key: 'a1',
      title: 'Assigned Profile',
    });
  });

  it('calls removeQ with the assigned item id when Remove is clicked', () => {
    const actions = makeActions();
    render(
      <QuestionnairePanel
        data={{ questionnaires: [], assignedQuestionnaires: [assignedItem] }}
        actions={actions}
        t={t as any}
      />
    );

    fireEvent.click(screen.getByLabelText('Remove questionnaire'));
    expect(actions.removeQ).toHaveBeenCalledWith('a1');
  });

  it("calls openAddQ from within the detail sheet's Assign action for an available item", async () => {
    const actions = makeActions();
    render(
      <QuestionnairePanel
        data={{ questionnaires: [catalogItem], assignedQuestionnaires: [] }}
        actions={actions}
        t={t as any}
      />
    );

    fireEvent.click(screen.getByText('Profile Questionnaire'));
    await screen.findByText(/How do you feel\?/);
    const assignButtons = screen.getAllByText('Assign');
    fireEvent.click(assignButtons[assignButtons.length - 1]);
    expect(actions.openAddQ).toHaveBeenCalledWith(catalogItem);
  });

  it('closes the detail sheet via onClose', async () => {
    render(
      <QuestionnairePanel
        data={{ questionnaires: [catalogItem], assignedQuestionnaires: [] }}
        actions={makeActions()}
        t={t as any}
      />
    );

    fireEvent.click(screen.getByText('Profile Questionnaire'));
    expect(await screen.findByText(/How do you feel\?/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByText(/How do you feel\?/)).not.toBeInTheDocument();
  });
});
