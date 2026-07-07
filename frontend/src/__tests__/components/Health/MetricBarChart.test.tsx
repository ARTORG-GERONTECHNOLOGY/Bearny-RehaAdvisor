import React from 'react';
import { render } from '@testing-library/react';

// D3 is ESM-only; mock the entire module so Jest can parse it
jest.mock('d3', () => {
  const chain = () => {
    const proxy: any = new Proxy(
      {},
      {
        get: () => () => proxy,
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
    max: () => 10,
    min: () => 0,
    mean: (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined),
    quantile: (values: number[], p: number) => (values.length ? values[Math.floor(p * (values.length - 1))] : undefined),
    utcDay: { offset: (d: Date) => d, every: () => null, filter: () => null },
    utcWeek: { every: () => null },
    utcMonth: { every: () => null },
    utcParse: () => () => new Date(),
    timeParse: () => (s: string) => new Date(s),
    timeFormat: () => () => '',
  };
});

import MetricBarChart from '@/components/Health/charts/MetricBarChart';
import type { FitbitEntry } from '@/types/health';

// D3 manipulates SVG directly; stub SVGSVGElement methods not present in jsdom
beforeAll(() => {
  (SVGSVGElement.prototype as any).getComputedTextLength = () => 0;
  (SVGSVGElement.prototype as any).getBBox = () => ({ x: 0, y: 0, width: 100, height: 20 });
});

const makeEntry = (date: string, steps: number | null): FitbitEntry => ({
  date,
  steps: steps ?? undefined,
});

const stepsAccessor = (d: FitbitEntry) => d.steps ?? null;

describe('MetricBarChart', () => {
  test('renders without crashing with empty data', () => {
    const { container } = render(
      <MetricBarChart titleKey="Steps" data={[]} accessor={stepsAccessor} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  test('renders without crashing with populated data', () => {
    const data: FitbitEntry[] = [
      makeEntry('2026-01-01', 8000),
      makeEntry('2026-01-02', 9500),
      makeEntry('2026-01-03', 7200),
    ];
    const { container } = render(
      <MetricBarChart titleKey="Steps" data={data} accessor={stepsAccessor} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  test('renders when accessor returns null/undefined for some entries', () => {
    const data: FitbitEntry[] = [
      makeEntry('2026-01-01', 8000),
      makeEntry('2026-01-02', null),
      makeEntry('2026-01-03', 7200),
    ];
    const { container } = render(
      <MetricBarChart titleKey="Steps" data={data} accessor={stepsAccessor} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  test('renders with a start/end date range filter', () => {
    const data: FitbitEntry[] = [
      makeEntry('2026-01-01', 8000),
      makeEntry('2026-01-05', 9500),
      makeEntry('2026-01-10', 7200),
    ];
    const start = new Date('2026-01-01');
    const end = new Date('2026-01-06');
    const { container } = render(
      <MetricBarChart titleKey="Steps" data={data} accessor={stepsAccessor} start={start} end={end} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  test('renders with showPersonalRange disabled', () => {
    const data: FitbitEntry[] = [makeEntry('2026-01-01', 8000), makeEntry('2026-01-02', 9500)];
    const { container } = render(
      <MetricBarChart
        titleKey="Steps"
        data={data}
        accessor={stepsAccessor}
        showPersonalRange={false}
      />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  test('renders with a fixed goal value', () => {
    const data: FitbitEntry[] = [makeEntry('2026-01-01', 8000), makeEntry('2026-01-02', 9500)];
    const { container } = render(
      <MetricBarChart titleKey="Steps" data={data} accessor={stepsAccessor} goal={10000} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  test('renders with custom personal range window/percentiles', () => {
    const data: FitbitEntry[] = [
      makeEntry('2026-01-01', 8000),
      makeEntry('2026-01-02', 9500),
      makeEntry('2026-01-03', 7200),
      makeEntry('2026-01-04', 8800),
    ];
    const { container } = render(
      <MetricBarChart
        titleKey="Steps"
        data={data}
        accessor={stepsAccessor}
        rangeWindowDays={7}
        rangeLowerPct={10}
        rangeUpperPct={90}
      />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
