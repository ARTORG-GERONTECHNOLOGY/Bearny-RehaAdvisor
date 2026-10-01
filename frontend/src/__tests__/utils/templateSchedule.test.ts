import i18next, { type TFunction } from 'i18next';
import type { TemplateItem } from '@/types/templates';
import en from '@/assets/lang/en.json';
import de from '@/assets/lang/de.json';
import {
  countDailySessions,
  countOccurrencesInRange,
  formatDayRange,
  formatFrequency,
  formatSegmentSummary,
  getSegments,
  hasWeekdaySegment,
  normalizeSegment,
  pickSegmentForDay,
  type TemplateSegment,
} from '@/utils/templateSchedule';

// A real i18next instance (same resources as i18n.js) so plural keys resolve as in the app.
let t: TFunction;
let tDe: TFunction;
beforeAll(async () => {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: en }, de: { translation: de } },
    interpolation: { escapeValue: false },
  });
  t = i18n.getFixedT('en');
  tDe = i18n.getFixedT('de');
});

const segment = (overrides: Partial<TemplateSegment> = {}): TemplateSegment => ({
  unit: 'day',
  interval: 1,
  selectedDays: [],
  start_day: 1,
  start_time: '08:00',
  ...overrides,
});

const item = (overrides: Partial<TemplateItem> = {}): TemplateItem => ({
  diagnosis: 'Stroke',
  intervention: { _id: 'int-1', title: 'Breathing' },
  schedule: { unit: 'day', interval: 1, selectedDays: [], start_day: 1, end_day: 10 },
  occurrences: [],
  ...overrides,
});

describe('normalizeSegment', () => {
  it('reads the camelCase calendar schedule', () => {
    expect(
      normalizeSegment({
        unit: 'week',
        interval: 2,
        selectedDays: ['Mon'],
        start_day: 3,
        end_day: null,
      })
    ).toEqual(segment({ unit: 'week', interval: 2, selectedDays: ['Mon'], start_day: 3 }));
  });

  it('reads snake_case stored segments', () => {
    expect(
      normalizeSegment({
        unit: 'month',
        interval: 1,
        selected_days: ['Fri'],
        start_day: 2,
        end_day: 9,
        start_time: '10:30',
      })
    ).toEqual(
      segment({
        unit: 'month',
        selectedDays: ['Fri'],
        start_day: 2,
        end_day: 9,
        start_time: '10:30',
      })
    );
  });

  it('unwraps the legacy { schedule, from_day } shape', () => {
    expect(normalizeSegment({ from_day: 5, schedule: { unit: 'week', end_day: 12 } })).toEqual(
      segment({ unit: 'week', start_day: 5, end_day: 12 })
    );
  });

  it('falls back to a daily segment for missing or malformed input', () => {
    expect(normalizeSegment(undefined)).toEqual(segment());
    expect(normalizeSegment({ unit: 'year', selectedDays: ['Mon', 3] })).toEqual(
      segment({ selectedDays: ['Mon'] })
    );
  });
});

describe('getSegments / pickSegmentForDay', () => {
  const twoSegments = item({
    segments: [
      {
        unit: 'day',
        interval: 1,
        selected_days: [],
        start_day: 1,
        end_day: 3,
        start_time: '08:00',
      },
      {
        unit: 'week',
        interval: 1,
        selected_days: ['Tue'],
        start_day: 4,
        end_day: 10,
        start_time: '08:00',
      },
    ],
  });

  it('prefers stored segments over the summarised schedule', () => {
    expect(getSegments(twoSegments).map((s) => s.unit)).toEqual(['day', 'week']);
    expect(getSegments(item())).toEqual([segment({ end_day: 10 })]);
  });

  it('picks the segment covering the day, or the first one', () => {
    expect(pickSegmentForDay(twoSegments, 5).unit).toBe('week');
    expect(pickSegmentForDay(twoSegments, 2).unit).toBe('day');
    expect(pickSegmentForDay(twoSegments, 50).unit).toBe('day');
  });
});

describe('hasWeekdaySegment', () => {
  it('is true only for weekly segments with selected days', () => {
    expect(hasWeekdaySegment([segment({ unit: 'week', selectedDays: ['Mon'] })])).toBe(true);
    expect(hasWeekdaySegment([segment({ unit: 'week' })])).toBe(false);
    expect(hasWeekdaySegment([segment({ selectedDays: ['Mon'] })])).toBe(false);
  });
});

describe('countDailySessions', () => {
  it('counts every interval-th day including both ends when they line up', () => {
    expect(countDailySessions(1, 10, 1)).toBe(10);
    expect(countDailySessions(1, 10, 3)).toBe(4);
    expect(countDailySessions(5, 5, 2)).toBe(1);
  });
});

describe('countOccurrencesInRange', () => {
  it('counts occurrences inside the day range only', () => {
    const it3 = item({ occurrences: [{ day: 1 }, { day: 5 }, { day: 9 }] });
    expect(countOccurrencesInRange(it3, 2, 9)).toBe(2);
    expect(countOccurrencesInRange(it3, 5)).toBe(2);
  });
});

describe('formatting', () => {
  it('uses singular and plural frequency wording', () => {
    expect(formatFrequency('day', 1, [], t)).toBe('Daily');
    expect(formatFrequency('week', 2, [], t)).toBe('Every 2 weeks');
    expect(formatFrequency('month', 3, [], t)).toBe('Every 3 months');
  });

  it('appends translated weekdays', () => {
    expect(formatFrequency('week', 1, ['Mon', 'Fri'], t)).toBe('Weekly on Mon, Fri');
    expect(formatFrequency('week', 2, ['Mon', 'Fri'], tDe)).toBe('Alle 2 Wochen: Mo, Fr');
  });

  it('formats a bounded and an open day range', () => {
    expect(formatDayRange(1, 10, t)).toBe('Day 1 → 10');
    expect(formatDayRange(4, undefined, t)).toBe('from day 4');
  });

  it('joins frequency, range and occurrence count into one summary', () => {
    expect(
      formatSegmentSummary(
        segment({ unit: 'week', interval: 2, selectedDays: ['Wed'], end_day: 14 }),
        1,
        t
      )
    ).toBe('Every 2 weeks on Wed • Day 1 → 14 • 1 session');
  });
});
