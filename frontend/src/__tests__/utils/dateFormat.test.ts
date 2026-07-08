import {
  toLocalYMD,
  toISODateUTC,
  formatLocaleDate,
  formatLocaleDateTime,
  formatDurationMinutes,
  formatDurationMs,
} from '@/utils/dateFormat';

describe('toLocalYMD', () => {
  it("formats using the Date object's local calendar fields", () => {
    expect(toLocalYMD(new Date(2024, 2, 7))).toBe('2024-03-07');
  });

  it('zero-pads single-digit month and day', () => {
    expect(toLocalYMD(new Date(2024, 0, 5))).toBe('2024-01-05');
  });
});

describe('toISODateUTC', () => {
  it("formats using the Date object's UTC calendar fields", () => {
    expect(toISODateUTC(new Date(Date.UTC(2024, 2, 7)))).toBe('2024-03-07');
  });

  it('disagrees with toLocalYMD near a UTC day boundary in a positive-offset timezone', () => {
    // 2024-03-07T23:30 UTC is already 2024-03-08 local in any timezone ahead of UTC (this
    // test suite runs in Europe/Zurich) — this is exactly the discrepancy the two functions
    // exist to keep separate; conflating them is the class of bug this pair guards against.
    const d = new Date(Date.UTC(2024, 2, 7, 23, 30));
    expect(toISODateUTC(d)).toBe('2024-03-07');
    expect(toLocalYMD(d)).not.toBe(toISODateUTC(d));
  });
});

describe('formatLocaleDate / formatLocaleDateTime', () => {
  it('accepts a Date or a date string equivalently', () => {
    const iso = '2024-03-07T00:00:00.000Z';
    expect(formatLocaleDate(iso)).toBe(formatLocaleDate(new Date(iso)));
    expect(formatLocaleDateTime(iso)).toBe(formatLocaleDateTime(new Date(iso)));
  });

  it('delegates to the platform locale formatters', () => {
    const d = new Date('2024-03-07T10:00:00.000Z');
    expect(formatLocaleDate(d)).toBe(d.toLocaleDateString());
    expect(formatLocaleDateTime(d)).toBe(d.toLocaleString());
  });
});

describe('formatDurationMinutes', () => {
  it('formats under an hour as just minutes', () => {
    expect(formatDurationMinutes(45)).toBe('45m');
  });

  it('formats an hour or more as "Xh Ym"', () => {
    expect(formatDurationMinutes(125)).toBe('2h 5m');
  });

  it('omits the hours segment at exactly 0 minutes past the hour', () => {
    expect(formatDurationMinutes(120)).toBe('2h 0m');
  });

  it('rounds fractional minutes before splitting into h/m, so 359.6 never yields "5h 60m"', () => {
    expect(formatDurationMinutes(359.6)).toBe('6h 0m');
  });

  it('clamps negative input to zero', () => {
    expect(formatDurationMinutes(-10)).toBe('0m');
  });

  it('supports the "min" unit suffix', () => {
    expect(formatDurationMinutes(125, 'min')).toBe('2h 5min');
  });
});

describe('formatDurationMs', () => {
  it('converts milliseconds to minutes before formatting', () => {
    expect(formatDurationMs(90 * 60000)).toBe('1h 30m');
  });
});
