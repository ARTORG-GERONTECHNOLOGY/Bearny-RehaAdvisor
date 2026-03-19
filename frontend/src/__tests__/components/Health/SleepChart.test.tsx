import React from 'react';
import { render } from '@testing-library/react';

// D3 is ESM-only; mock the entire module so Jest can parse it
jest.mock('d3', () => {
  const chain = () => {
    const proxy: any = new Proxy(
      {},
      {
        get: (_t, _k) => (..._args: any[]) => proxy,
      }
    );
    return proxy;
  };
  const scale = () => {
    const fn: any = (v: any) => v;
    fn.domain = () => fn;
    fn.range = () => fn;
    fn.nice = () => fn;
    fn.padding = () => fn;
    fn.bandwidth = () => 20;
    fn.ticks = () => [];
    fn.tickFormat = () => fn;
    return fn;
  };
  return {
    select: () => chain(),
    selectAll: () => chain(),
    scaleBand: scale,
    scaleLinear: scale,
    scaleTime: scale,
    axisLeft: () => chain(),
    axisRight: () => chain(),
    axisBottom: () => chain(),
    line: () => { const l: any = () => ''; l.x = () => l; l.y = () => l; return l; },
    max: () => 10,
    min: () => 0,
    mean: () => 5,
    quantile: () => 5,
    utcParse: () => () => new Date(),
    timeParse: () => () => new Date(),
    timeFormat: () => () => '',
    utcDay: { every: () => null, filter: () => null },
    utcWeek: { every: () => null },
    utcMonth: { every: () => null },
  };
});

import SleepChart from '@/components/Health/charts/SleepChart';
import type { FitbitEntry } from '@/types/health';

// D3 manipulates SVG directly; stub SVGSVGElement methods not present in jsdom
beforeAll(() => {
  (SVGSVGElement.prototype as any).getComputedTextLength = () => 0;
  (SVGSVGElement.prototype as any).getBBox = () => ({ x: 0, y: 0, width: 100, height: 20 });
});

const makeSleepEntry = (
  date: string,
  opts: {
    sleep_duration?: number;
    minutes_asleep?: number;
    sleep_start?: string;
    sleep_end?: string;
  } = {}
): FitbitEntry => ({
  date,
  sleep: {
    sleep_duration: opts.sleep_duration,
    minutes_asleep: opts.minutes_asleep,
    sleep_start: opts.sleep_start,
    sleep_end: opts.sleep_end,
  },
});

describe('SleepChart', () => {
  test('renders without crashing with empty data', () => {
    const { container } = render(<SleepChart data={[]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  test('renders without crashing when sleep data has both duration and minutes_asleep', () => {
    const data: FitbitEntry[] = [
      makeSleepEntry('2026-01-01', {
        sleep_duration: 28800000, // 8h
        minutes_asleep: 420,      // 7h
        sleep_start: '2026-01-01T22:00:00.000',
        sleep_end: '2026-01-02T06:00:00.000',
      }),
      makeSleepEntry('2026-01-02', {
        sleep_duration: 25200000, // 7h
        minutes_asleep: 390,      // 6h30m
        sleep_start: '2026-01-02T23:00:00.000',
        sleep_end: '2026-01-03T06:00:00.000',
      }),
    ];
    const { container } = render(<SleepChart data={data} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  test('renders when only sleep_duration is available (no minutes_asleep)', () => {
    const data: FitbitEntry[] = [
      makeSleepEntry('2026-01-03', {
        sleep_duration: 27000000,
        sleep_start: '2026-01-03T22:30:00.000',
        sleep_end: '2026-01-04T06:00:00.000',
      }),
    ];
    const { container } = render(<SleepChart data={data} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  test('renders when only minutes_asleep is present without duration', () => {
    const data: FitbitEntry[] = [
      makeSleepEntry('2026-01-04', { minutes_asleep: 360 }),
    ];
    const { container } = render(<SleepChart data={data} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  test('renders with start/end date range filter', () => {
    const data: FitbitEntry[] = [
      makeSleepEntry('2026-01-01', { sleep_duration: 21600000, minutes_asleep: 360 }),
      makeSleepEntry('2026-01-05', { sleep_duration: 25200000, minutes_asleep: 390 }),
    ];
    const start = new Date('2026-01-01');
    const end = new Date('2026-01-03');
    const { container } = render(<SleepChart data={data} start={start} end={end} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
