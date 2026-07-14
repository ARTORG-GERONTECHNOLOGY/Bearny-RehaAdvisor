import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';

// D3 is ESM-only — mock before any import that pulls in utils/healthCharts.
jest.mock('d3', () => ({ timeParse: () => (s: string) => new Date(s) }));

// recharts' internal layout doesn't run in jsdom — stub Bar/BarChart while
// still letting a click on a bar reach the component's onClick handler with
// the chart's first data row (good enough to exercise the sheet-open flow).
const mockYAxis = jest.fn(() => null);

jest.mock('recharts', () => {
  const ReactActual = jest.requireActual('react');
  const Ctx = ReactActual.createContext([]);
  return {
    __esModule: true,
    BarChart: ({ children, data }: { children: React.ReactNode; data: any[] }) =>
      ReactActual.createElement(
        Ctx.Provider,
        { value: data },
        ReactActual.createElement('svg', null, children)
      ),
    Bar: ({ dataKey, onClick }: { dataKey: string; onClick?: (d: any) => void }) => {
      const data = ReactActual.useContext(Ctx);
      const row = data?.[0];
      return ReactActual.createElement(
        'button',
        {
          'data-testid': `bar-${dataKey}`,
          onClick: () => onClick?.({ payload: { date: row?.date } }),
        },
        dataKey
      );
    },
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: (props: any) => {
      mockYAxis(props);
      return null;
    },
  };
});

const mockChartTooltip = jest.fn(() => null);

jest.mock('@/components/ui/chart', () => {
  const ChartContainer = React.forwardRef<HTMLDivElement, { children: React.ReactNode }>(
    ({ children }, ref) => <div ref={ref}>{children}</div>
  );
  ChartContainer.displayName = 'ChartContainer';
  return {
    ChartContainer,
    ChartTooltip: (props: any) => {
      mockChartTooltip(props);
      return null;
    },
    ChartTooltipContent: () => null,
  };
});

jest.mock('@/components/ui/sheet', () => {
  const ReactActual = jest.requireActual('react');
  return {
    Sheet: ({
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
    SheetContent: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement('div', null, children),
    SheetHeader: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement('div', null, children),
    SheetTitle: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement('h2', null, children),
    SheetDescription: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement('p', null, children),
  };
});

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

import ExerciseSessionsChart, {
  averageExerciseMinutes,
  filterExerciseInRange,
} from '@/components/Health/charts/ExerciseSessionsChart';
import type { FitbitEntry } from '@/types/health';

const makeEntry = (date: string, sessions: { name: string; duration: number }[]): FitbitEntry =>
  ({ date, exercise: { sessions } as any }) as FitbitEntry;

describe('ExerciseSessionsChart', () => {
  it('shows the empty state when data is empty', () => {
    const { container } = render(<ExerciseSessionsChart data={[]} />);
    expect(screen.getByText('No exercise sessions in this period.')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('shows the empty state when all entries fall outside the date range', () => {
    const data = [makeEntry('2026-01-01', [{ name: 'Run', duration: 30 * 60000 }])];
    render(
      <ExerciseSessionsChart
        data={data}
        start={new Date('2026-02-01')}
        end={new Date('2026-02-28')}
      />
    );
    expect(screen.getByText('No exercise sessions in this period.')).toBeInTheDocument();
  });

  it('shows the empty state when in-range entries have no sessions', () => {
    const data = [makeEntry('2026-01-01', [])];
    render(
      <ExerciseSessionsChart
        data={data}
        start={new Date('2026-01-01')}
        end={new Date('2026-01-31')}
      />
    );
    expect(screen.getByText('No exercise sessions in this period.')).toBeInTheDocument();
  });

  it('renders the chart when in-range session data is present', () => {
    const data = [makeEntry('2026-01-01', [{ name: 'Run', duration: 30 * 60000 }])];
    const { container } = render(
      <ExerciseSessionsChart
        data={data}
        start={new Date('2026-01-01')}
        end={new Date('2026-01-31')}
      />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('No exercise sessions in this period.')).not.toBeInTheDocument();
  });

  it('forwards the underlying container element via ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    const data = [makeEntry('2026-01-01', [{ name: 'Run', duration: 30 * 60000 }])];
    render(<ExerciseSessionsChart ref={ref} data={data} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('opens a detail sheet with the day exercise table when a bar is clicked', () => {
    const data = [makeEntry('2026-01-05', [{ name: 'Run', duration: 30 * 60000 }])];
    render(
      <ExerciseSessionsChart
        data={data}
        start={new Date('2026-01-05')}
        end={new Date('2026-01-05')}
      />
    );

    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('bar-s0'));

    const sheet = screen.getByTestId('sheet');
    expect(sheet).toBeInTheDocument();
    expect(within(sheet).getByText('Exercises')).toBeInTheDocument();
    expect(within(sheet).getAllByText(/2026-01-05/).length).toBeGreaterThan(0);
    expect(within(sheet).getByText('Run')).toBeInTheDocument();
  });

  it('computes the Y-axis max with a 10% headroom multiplier', () => {
    mockYAxis.mockClear();
    const data = [makeEntry('2026-01-05', [{ name: 'Run', duration: 30 * 60000 }])];
    render(
      <ExerciseSessionsChart
        data={data}
        start={new Date('2026-01-05')}
        end={new Date('2026-01-05')}
      />
    );
    const { domain } = mockYAxis.mock.calls[0][0];
    expect(domain[0]).toBe(0);
    expect(domain[1](100)).toBeCloseTo(110);
  });

  it('renders the session tooltip with name and duration, skipping zero-value entries', () => {
    mockChartTooltip.mockClear();
    const data = [
      makeEntry('2026-01-05', [
        { name: 'Run', duration: 30 * 60000 },
        { name: 'Yoga', duration: 20 * 60000 },
      ]),
    ];
    render(
      <ExerciseSessionsChart
        data={data}
        start={new Date('2026-01-05')}
        end={new Date('2026-01-05')}
      />
    );

    const { content } = mockChartTooltip.mock.calls[0][0];

    // Inactive / empty payload -> tooltip renders nothing.
    const { container: inactive } = render(
      React.cloneElement(content, { active: false, label: '2026-01-05', payload: [] })
    );
    expect(inactive).toBeEmptyDOMElement();

    const { container: emptyPayload } = render(
      React.cloneElement(content, { active: true, label: '2026-01-05', payload: [] })
    );
    expect(emptyPayload).toBeEmptyDOMElement();

    const { container: allZero } = render(
      React.cloneElement(content, {
        active: true,
        label: '2026-01-05',
        payload: [{ dataKey: 's0', value: 0, payload: { s0Name: 'Run' } }],
      })
    );
    expect(allZero).toBeEmptyDOMElement();

    render(
      React.cloneElement(content, {
        active: true,
        label: '2026-01-05',
        payload: [
          { dataKey: 's0', value: 30, payload: { s0Name: 'Run' } },
          { dataKey: 's1', value: 20, payload: { s1Name: 'Yoga' } },
        ],
      })
    );
    expect(screen.getByText('2026-01-05')).toBeInTheDocument();
    expect(screen.getByText('Run')).toBeInTheDocument();
    expect(screen.getByText('Yoga')).toBeInTheDocument();
  });

  it('closes the detail sheet when dismissed', () => {
    const data = [makeEntry('2026-01-05', [{ name: 'Run', duration: 30 * 60000 }])];
    render(
      <ExerciseSessionsChart
        data={data}
        start={new Date('2026-01-05')}
        end={new Date('2026-01-05')}
      />
    );

    fireEvent.click(screen.getByTestId('bar-s0'));
    expect(screen.getByTestId('sheet')).toBeInTheDocument();

    fireEvent.click(screen.getByText('close-sheet'));
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });
});

describe('filterExerciseInRange', () => {
  it('returns an empty array for empty input with no start/end', () => {
    expect(filterExerciseInRange([])).toEqual([]);
  });

  it('fills in every day between start and end, with null totals on gap days', () => {
    const data = [
      makeEntry('2026-01-01', [{ name: 'Run', duration: 30 * 60000 }]),
      makeEntry('2026-01-03', [{ name: 'Bike', duration: 45 * 60000 }]),
    ];
    const rows = filterExerciseInRange(data, new Date('2026-01-01'), new Date('2026-01-04'));
    expect(rows).toEqual([
      { date: '2026-01-01', total: 30, sessions: [{ name: 'Run', duration: 30 }] },
      { date: '2026-01-02', total: null, sessions: [] },
      { date: '2026-01-03', total: 45, sessions: [{ name: 'Bike', duration: 45 }] },
      { date: '2026-01-04', total: null, sessions: [] },
    ]);
  });

  it('sums multiple sessions on the same day', () => {
    const data = [
      makeEntry('2026-01-01', [
        { name: 'Run', duration: 30 * 60000 },
        { name: 'Yoga', duration: 20 * 60000 },
      ]),
    ];
    const rows = filterExerciseInRange(data, new Date('2026-01-01'), new Date('2026-01-01'));
    expect(rows[0].total).toBe(50);
    expect(rows[0].sessions).toHaveLength(2);
  });

  it('excludes sessions with zero or missing duration', () => {
    const data = [
      makeEntry('2026-01-01', [
        { name: 'Run', duration: 0 },
        { name: 'Bike', duration: 30 * 60000 },
      ]),
    ];
    const rows = filterExerciseInRange(data, new Date('2026-01-01'), new Date('2026-01-01'));
    expect(rows[0].sessions).toEqual([{ name: 'Bike', duration: 30 }]);
  });

  it('treats an entry with no exercise field as having no sessions', () => {
    const data = [{ date: '2026-01-01' } as FitbitEntry];
    const rows = filterExerciseInRange(data, new Date('2026-01-01'), new Date('2026-01-01'));
    expect(rows).toEqual([{ date: '2026-01-01', total: 0, sessions: [] }]);
  });

  it('falls back to an empty name for a session with no name', () => {
    const data = [makeEntry('2026-01-01', [{ name: '', duration: 30 * 60000 }])];
    const rows = filterExerciseInRange(data, new Date('2026-01-01'), new Date('2026-01-01'));
    expect(rows[0].sessions).toEqual([{ name: '', duration: 30 }]);
  });

  it('excludes entries outside the start/end range', () => {
    const data = [makeEntry('2026-01-20', [{ name: 'Run', duration: 30 * 60000 }])];
    const rows = filterExerciseInRange(data, new Date('2026-01-05'), new Date('2026-01-07'));
    expect(rows).toEqual([
      { date: '2026-01-05', total: null, sessions: [] },
      { date: '2026-01-06', total: null, sessions: [] },
      { date: '2026-01-07', total: null, sessions: [] },
    ]);
  });
});

describe('averageExerciseMinutes', () => {
  it('returns null for empty input', () => {
    expect(averageExerciseMinutes([])).toBeNull();
  });

  it('returns null when no entry falls within the date range', () => {
    const data = [makeEntry('2026-03-01', [{ name: 'Run', duration: 30 * 60000 }])];
    expect(averageExerciseMinutes(data, new Date('2026-01-01'), new Date('2026-01-02'))).toBeNull();
  });

  it('counts a day with an entry but no sessions as zero minutes', () => {
    const data = [makeEntry('2026-01-01', [])];
    expect(averageExerciseMinutes(data, new Date('2026-01-01'), new Date('2026-01-01'))).toBe(0);
  });

  it('averages only the non-null day totals, ignoring filled gap days', () => {
    const data = [
      makeEntry('2026-01-01', [{ name: 'Run', duration: 30 * 60000 }]),
      makeEntry('2026-01-03', [{ name: 'Bike', duration: 50 * 60000 }]),
    ];
    const avg = averageExerciseMinutes(data, new Date('2026-01-01'), new Date('2026-01-03'));
    expect(avg).toBe(40);
  });

  it('only averages entries within the start/end range', () => {
    const data = [
      makeEntry('2026-01-01', [{ name: 'Run', duration: 10 * 60000 }]),
      makeEntry('2026-01-10', [{ name: 'Run', duration: 90 * 60000 }]),
    ];
    const avg = averageExerciseMinutes(data, new Date('2026-01-05'), new Date('2026-01-31'));
    expect(avg).toBe(90);
  });
});
