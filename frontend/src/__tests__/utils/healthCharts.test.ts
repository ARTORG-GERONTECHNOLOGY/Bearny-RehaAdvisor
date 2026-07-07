// D3 is ESM-only — mock with faithful implementations of just what healthCharts.ts uses.
jest.mock('d3', () => ({
  timeParse: () => (s: string) => new Date(s),
}));

import { isInRange } from '@/utils/healthCharts';

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
