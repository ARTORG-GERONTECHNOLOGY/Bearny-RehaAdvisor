// D3 is ESM-only — mock with faithful implementations of just what healthCharts.ts uses.
jest.mock('d3', () => ({
  timeParse: () => (s: string) => new Date(s),
}));

import { isInRange, thresholdTier, worstTier } from '@/utils/healthCharts';

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

describe('thresholdTier', () => {
  it('returns null when there is no value', () => {
    expect(thresholdTier(null, 30, 20, true)).toBeNull();
    expect(thresholdTier(undefined, 30, 20, true)).toBeNull();
  });

  it('returns green when there is no green threshold to fail', () => {
    expect(thresholdTier(5, null, 20, true)).toBe('green');
  });

  describe('higherIsBetter (e.g. active minutes, sleep)', () => {
    it('is green at or above the green threshold', () => {
      expect(thresholdTier(30, 30, 20, true)).toBe('green');
      expect(thresholdTier(40, 30, 20, true)).toBe('green');
    });

    it('is yellow at or above the yellow threshold but below green', () => {
      expect(thresholdTier(20, 30, 20, true)).toBe('yellow');
      expect(thresholdTier(25, 30, 20, true)).toBe('yellow');
    });

    it('is red below the yellow threshold', () => {
      expect(thresholdTier(19, 30, 20, true)).toBe('red');
    });

    it('is red below green when there is no yellow threshold', () => {
      expect(thresholdTier(10, 30, null, true)).toBe('red');
    });
  });

  describe('lower-is-better (e.g. blood pressure)', () => {
    it('is green at or below the green threshold', () => {
      expect(thresholdTier(129, 129, 139, false)).toBe('green');
      expect(thresholdTier(100, 129, 139, false)).toBe('green');
    });

    it('is yellow at or below the yellow threshold but above green', () => {
      expect(thresholdTier(135, 129, 139, false)).toBe('yellow');
      expect(thresholdTier(139, 129, 139, false)).toBe('yellow');
    });

    it('is red above the yellow threshold', () => {
      expect(thresholdTier(140, 129, 139, false)).toBe('red');
    });
  });
});

describe('worstTier', () => {
  it('returns null when all tiers are null', () => {
    expect(worstTier(null, null)).toBeNull();
  });

  it('ignores nulls and returns the only tier present', () => {
    expect(worstTier(null, 'yellow')).toBe('yellow');
  });

  it('returns the most severe tier among several', () => {
    expect(worstTier('green', 'yellow')).toBe('yellow');
    expect(worstTier('green', 'red')).toBe('red');
    expect(worstTier('yellow', 'red')).toBe('red');
    expect(worstTier('green', 'green')).toBe('green');
  });
});
