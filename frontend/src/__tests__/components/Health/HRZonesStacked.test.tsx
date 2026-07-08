import React from 'react';
import { render, screen } from '@testing-library/react';

// D3 is ESM-only — mock before any import that pulls in utils/healthCharts.
jest.mock('d3', () => ({ timeParse: () => (s: string) => new Date(s) }));

jest.mock('recharts', () => ({
  Bar: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

jest.mock('@/components/ui/chart', () => {
  const ChartContainer = React.forwardRef<HTMLDivElement, { children: React.ReactNode }>(
    ({ children }, ref) => <div ref={ref}>{children}</div>
  );
  ChartContainer.displayName = 'ChartContainer';
  return {
    ChartContainer,
    ChartTooltip: () => null,
    ChartTooltipContent: () => null,
  };
});

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

import HRZonesStacked, {
  averageActiveHRZoneMinutes,
  filterHRZonesInRange,
  zoneBpmRanges,
} from '@/components/Health/charts/HRZonesStacked';
import type { FitbitEntry } from '@/types/health';

const makeEntry = (
  date: string,
  zones: { name: string; minutes: number; min?: number; max?: number }[]
): FitbitEntry => ({ date, heart_rate_zones: zones });

describe('HRZonesStacked', () => {
  it('shows the empty state when data is empty', () => {
    const { container } = render(<HRZonesStacked data={[]} />);
    expect(screen.getByText('No heart rate zone data')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('shows the empty state when all entries fall outside the date range', () => {
    const data = [makeEntry('2026-01-01', [{ name: 'Fat Burn', minutes: 30 }])];
    render(
      <HRZonesStacked data={data} start={new Date('2026-02-01')} end={new Date('2026-02-28')} />
    );
    expect(screen.getByText('No heart rate zone data')).toBeInTheDocument();
  });

  it('shows the empty state when every zone is zero minutes', () => {
    const data = [
      makeEntry('2026-01-01', [
        { name: 'Out of Range', minutes: 0 },
        { name: 'Fat Burn', minutes: 0 },
      ]),
    ];
    render(
      <HRZonesStacked data={data} start={new Date('2026-01-01')} end={new Date('2026-01-01')} />
    );
    expect(screen.getByText('No heart rate zone data')).toBeInTheDocument();
  });

  it('renders the chart when in-range zone data is present', () => {
    const data = [
      makeEntry('2026-01-01', [
        { name: 'Fat Burn', minutes: 30 },
        { name: 'Cardio', minutes: 10 },
      ]),
    ];
    const { container } = render(
      <HRZonesStacked data={data} start={new Date('2026-01-01')} end={new Date('2026-01-31')} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('No heart rate zone data')).not.toBeInTheDocument();
  });

  it('forwards the underlying container element via ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    const data = [makeEntry('2026-01-01', [{ name: 'Fat Burn', minutes: 30 }])];
    render(<HRZonesStacked ref={ref} data={data} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('filterHRZonesInRange', () => {
  it('returns an empty array for empty input with no start/end', () => {
    expect(filterHRZonesInRange([])).toEqual([]);
  });

  it('fills in every day between start and end, defaulting missing zones to 0', () => {
    const data = [
      makeEntry('2026-01-01', [
        { name: 'Out of Range', minutes: 100 },
        { name: 'Fat Burn', minutes: 40 },
        { name: 'Cardio', minutes: 15 },
        { name: 'Peak', minutes: 5 },
      ]),
    ];
    const rows = filterHRZonesInRange(data, new Date('2026-01-01'), new Date('2026-01-02'));
    expect(rows).toEqual([
      { date: '2026-01-01', outOfRange: 100, fatBurn: 40, cardio: 15, peak: 5 },
      { date: '2026-01-02', outOfRange: 0, fatBurn: 0, cardio: 0, peak: 0 },
    ]);
  });

  it('excludes entries outside the start/end range', () => {
    const data = [makeEntry('2026-01-20', [{ name: 'Fat Burn', minutes: 40 }])];
    const rows = filterHRZonesInRange(data, new Date('2026-01-05'), new Date('2026-01-06'));
    expect(rows).toEqual([
      { date: '2026-01-05', outOfRange: 0, fatBurn: 0, cardio: 0, peak: 0 },
      { date: '2026-01-06', outOfRange: 0, fatBurn: 0, cardio: 0, peak: 0 },
    ]);
  });
});

describe('zoneBpmRanges', () => {
  it('returns an empty object for empty input', () => {
    expect(zoneBpmRanges([])).toEqual({});
  });

  it('extracts the bpm range for each recognized zone', () => {
    const data = [
      makeEntry('2026-01-01', [
        { name: 'Fat Burn', minutes: 40, min: 100, max: 120 },
        { name: 'Cardio', minutes: 15, min: 120, max: 150 },
      ]),
    ];
    expect(zoneBpmRanges(data)).toEqual({
      fatBurn: '100–120 bpm',
      cardio: '120–150 bpm',
    });
  });

  it('takes the first non-null occurrence when a zone repeats across days', () => {
    const data = [
      makeEntry('2026-01-01', [{ name: 'Peak', minutes: 5, min: 150, max: 220 }]),
      makeEntry('2026-01-02', [{ name: 'Peak', minutes: 8, min: 999, max: 999 }]),
    ];
    expect(zoneBpmRanges(data)).toEqual({ peak: '150–220 bpm' });
  });
});

describe('averageActiveHRZoneMinutes', () => {
  it('returns null for empty input', () => {
    expect(averageActiveHRZoneMinutes([])).toBeNull();
  });

  it('returns null when no entry in range has zone readings', () => {
    const data = [makeEntry('2026-01-01', [])];
    expect(
      averageActiveHRZoneMinutes(data, new Date('2026-01-01'), new Date('2026-01-02'))
    ).toBeNull();
  });

  it('excludes Out of Range minutes from the total', () => {
    const data = [
      makeEntry('2026-01-01', [
        { name: 'Out of Range', minutes: 500 },
        { name: 'Fat Burn', minutes: 30 },
        { name: 'Cardio', minutes: 10 },
        { name: 'Peak', minutes: 5 },
      ]),
    ];
    expect(averageActiveHRZoneMinutes(data)).toBe(45);
  });

  it('averages only days that have a zone reading, ignoring gap days', () => {
    const data = [
      makeEntry('2026-01-01', [{ name: 'Fat Burn', minutes: 30 }]),
      makeEntry('2026-01-03', [{ name: 'Fat Burn', minutes: 50 }]),
    ];
    const avg = averageActiveHRZoneMinutes(data, new Date('2026-01-01'), new Date('2026-01-03'));
    expect(avg).toBe(40);
  });

  it('only averages entries within the start/end range', () => {
    const data = [
      makeEntry('2026-01-01', [{ name: 'Fat Burn', minutes: 10 }]),
      makeEntry('2026-01-10', [{ name: 'Fat Burn', minutes: 90 }]),
    ];
    const avg = averageActiveHRZoneMinutes(data, new Date('2026-01-05'), new Date('2026-01-31'));
    expect(avg).toBe(90);
  });
});
