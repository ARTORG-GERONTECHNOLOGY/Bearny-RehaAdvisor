import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// D3 is ESM-only — mock before any import that pulls in utils/healthCharts.
jest.mock('d3', () => ({ timeParse: () => (s: string) => new Date(s) }));

jest.mock('@/components/ui/dialog', () => {
  const ReactActual = jest.requireActual('react');
  return {
    Dialog: ({
      open,
      onOpenChange,
      children,
    }: {
      open?: boolean;
      onOpenChange: (open: boolean) => void;
      children: React.ReactNode;
    }) =>
      open
        ? ReactActual.createElement(
            'div',
            { 'data-testid': 'sheet' },
            children,
            ReactActual.createElement(
              'button',
              { onClick: () => onOpenChange(false) },
              'close-sheet'
            )
          )
        : null,
    DialogContent: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement('div', null, children),
    DialogHeader: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement('div', null, children),
    DialogTitle: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement('h2', null, children),
    DialogDescription: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement('p', null, children),
  };
});

import QuestionnaireResultsTable, {
  countQuestionnaireDays,
} from '@/components/Health/QuestionnaireResultsTable';
import type { QuestionnaireEntry } from '@/types/health';

const t = (key: string) => key;

const makeEntry = (date: string, questionKey: string, comment?: string): QuestionnaireEntry => ({
  date,
  questionKey,
  answers: [{ key: 'yes' }],
  questionTranslations: [{ language: 'en', text: `Question ${questionKey}` }],
  comment,
});

describe('QuestionnaireResultsTable', () => {
  it('shows a placeholder when there is no data and no date range', () => {
    render(<QuestionnaireResultsTable data={[]} lang="en" t={t} />);
    expect(screen.getByText('No questionnaire data available.')).toBeInTheDocument();
  });

  it('renders one square per day in the selected range, coloring only days with entries', () => {
    const data = [makeEntry('2026-01-02', 'q1')];
    render(
      <QuestionnaireResultsTable
        data={data}
        start={new Date('2026-01-01')}
        end={new Date('2026-01-04')}
        lang="en"
        t={t}
      />
    );

    const squares = screen.getAllByRole('button');
    expect(squares).toHaveLength(4);
    expect(squares.filter((s) => !s.hasAttribute('disabled'))).toHaveLength(1);
    expect(squares.filter((s) => s.className.includes('bg-brand'))).toHaveLength(1);
    expect(squares.filter((s) => s.className.includes('bg-chartMuted'))).toHaveLength(3);
  });

  it('opens a sheet with the day detail table when a day with data is clicked', () => {
    const data = [makeEntry('2026-01-02', 'q1', 'a comment')];
    render(
      <QuestionnaireResultsTable
        data={data}
        start={new Date('2026-01-01')}
        end={new Date('2026-01-04')}
        lang="en"
        t={t}
      />
    );

    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2026-01-02' }));

    expect(screen.getByTestId('sheet')).toBeInTheDocument();
    expect(screen.getByText('Question q1')).toBeInTheDocument();
    expect(screen.getByText('a comment')).toBeInTheDocument();
  });

  it('closes the day detail sheet when dismissed', () => {
    const data = [makeEntry('2026-01-02', 'q1')];
    render(
      <QuestionnaireResultsTable
        data={data}
        start={new Date('2026-01-01')}
        end={new Date('2026-01-04')}
        lang="en"
        t={t}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '2026-01-02' }));
    expect(screen.getByTestId('sheet')).toBeInTheDocument();

    fireEvent.click(screen.getByText('close-sheet'));
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });

  it('does not react to clicking a day with no entries', () => {
    const data = [makeEntry('2026-01-02', 'q1')];
    render(
      <QuestionnaireResultsTable
        data={data}
        start={new Date('2026-01-01')}
        end={new Date('2026-01-04')}
        lang="en"
        t={t}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '2026-01-01' }));
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });

  it('does not open any sheet before a square is clicked', () => {
    render(
      <QuestionnaireResultsTable
        data={[makeEntry('2026-01-02', 'q1')]}
        start={new Date('2026-01-01')}
        end={new Date('2026-01-04')}
        lang="en"
        t={t}
      />
    );
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });
});

describe('countQuestionnaireDays', () => {
  it('returns 0 for empty input', () => {
    expect(countQuestionnaireDays([])).toBe(0);
  });

  it('counts distinct days with at least one entry', () => {
    const data = [
      makeEntry('2026-01-02', 'q1'),
      makeEntry('2026-01-02', 'q2'),
      makeEntry('2026-01-04', 'q1'),
    ];
    expect(countQuestionnaireDays(data)).toBe(2);
  });

  it('only counts days within the start/end range', () => {
    const data = [
      makeEntry('2026-01-01', 'q1'),
      makeEntry('2026-01-10', 'q1'),
      makeEntry('2026-01-20', 'q1'),
    ];
    expect(countQuestionnaireDays(data, new Date('2026-01-05'), new Date('2026-01-15'))).toBe(1);
  });
});
