// D3 is ESM-only — mock with faithful implementations of just what healthCharts.ts uses.
jest.mock('d3', () => ({
  quantile: (values: number[], p: number) => {
    if (!values.length) return undefined;
    const sorted = [...values].sort((a, b) => a - b);
    if (p <= 0) return sorted[0];
    if (p >= 1) return sorted[sorted.length - 1];
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  },
  mean: (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined,
  utcDay: { offset: (date: Date, days: number) => new Date(date.getTime() + days * 86400000) },
  timeParse: () => (s: string) => new Date(s),
}));

import { personalRangeFromWindow, isInRange } from '@/utils/healthCharts';

describe('personalRangeFromWindow', () => {
  type Entry = { date: string; value: number };

  const entry = (date: string, value: number): Entry => ({ date, value });

  it('computes the P{lower}-P{upper} band over the trailing window ending at `end`', () => {
    const data: Entry[] = [
      entry('2024-01-01', 10),
      entry('2024-01-02', 20),
      entry('2024-01-03', 30),
      entry('2024-01-04', 40),
      entry('2024-01-05', 50),
    ];

    const { lo, hi, mean } = personalRangeFromWindow(
      data,
      (d) => d.date,
      (d) => d.value,
      { windowDays: 5, lowerPct: 0, upperPct: 100, end: new Date('2024-01-05') }
    );

    expect(lo).toBe(10);
    expect(hi).toBe(50);
    expect(mean).toBe(30);
  });

  it('excludes values outside the trailing window', () => {
    const data: Entry[] = [
      entry('2023-12-01', 1000), // way outside the window — must not affect the band
      entry('2024-01-04', 40),
      entry('2024-01-05', 50),
    ];

    const { lo, hi } = personalRangeFromWindow(
      data,
      (d) => d.date,
      (d) => d.value,
      {
        windowDays: 2,
        lowerPct: 0,
        upperPct: 100,
        end: new Date('2024-01-05'),
      }
    );

    expect(lo).toBe(40);
    expect(hi).toBe(50);
  });

  it('ignores null/undefined values', () => {
    const data = [
      entry('2024-01-04', 40),
      { date: '2024-01-05', value: undefined as unknown as number },
    ];

    const { hi } = personalRangeFromWindow(
      data,
      (d) => d.date,
      (d) => d.value,
      {
        windowDays: 5,
        lowerPct: 0,
        upperPct: 100,
        end: new Date('2024-01-05'),
      }
    );

    expect(hi).toBe(40);
  });

  it('returns nulls when no values fall in the window', () => {
    const { lo, hi, mean } = personalRangeFromWindow(
      [],
      (d: Entry) => d.date,
      (d: Entry) => d.value,
      {
        windowDays: 30,
        lowerPct: 3,
        upperPct: 97,
        end: new Date('2024-01-05'),
      }
    );

    expect(lo).toBeNull();
    expect(hi).toBeNull();
    expect(mean).toBeNull();
  });
});

describe('isInRange', () => {
  it('is true when no bounds are given', () => {
    expect(isInRange('2024-01-01')).toBe(true);
  });

  it('respects start and end bounds', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-01-31');
    expect(isInRange('2024-01-15', start, end)).toBe(true);
    expect(isInRange('2023-12-31', start, end)).toBe(false);
    expect(isInRange('2024-02-01', start, end)).toBe(false);
  });
});
