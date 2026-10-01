// src/utils/templateSchedule.ts
// Template schedule segments ("Day S → N, every K days/weeks/months") and their display text.

import type { TFunction } from 'i18next';
import type { ScheduleUnit, TemplateItem } from '@/types/templates';
import { asArray, asRecord, isString } from '@/utils/typeGuards';

export type TemplateSegment = {
  unit: ScheduleUnit;
  interval: number;
  selectedDays: string[];
  start_day: number;
  end_day?: number;
  start_time: string;
};

const toUnit = (v: unknown): ScheduleUnit => (v === 'week' || v === 'month' ? v : 'day');

const toNumber = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/** Accepts both the calendar `schedule` (camelCase) and stored segments (snake_case). */
export const normalizeSegment = (input: unknown): TemplateSegment => {
  const outer = asRecord(input);
  // Older payloads wrap the block as { schedule, from_day }.
  const raw = outer.schedule ? asRecord(outer.schedule) : outer;
  return {
    unit: toUnit(raw.unit),
    interval: toNumber(raw.interval) ?? 1,
    selectedDays: asArray(raw.selectedDays ?? raw.selected_days).filter(isString),
    start_day: toNumber(outer.from_day) ?? toNumber(raw.start_day) ?? 1,
    end_day: toNumber(raw.end_day) ?? toNumber(outer.end_day),
    start_time: [raw.start_time, raw.startTime].find(isString) ?? '08:00',
  };
};

export const getSegments = (item: TemplateItem): TemplateSegment[] =>
  item.segments?.length ? item.segments.map(normalizeSegment) : [normalizeSegment(item.schedule)];

export const pickSegmentForDay = (item: TemplateItem, day: number): TemplateSegment => {
  const segments = getSegments(item);
  const inRange = (s: TemplateSegment) => day >= s.start_day && (!s.end_day || day <= s.end_day);
  return segments.find(inRange) ?? segments[0];
};

export const hasWeekdaySegment = (segments: TemplateSegment[]): boolean =>
  segments.some((s) => s.unit === 'week' && s.selectedDays.length > 0);

export const countOccurrencesInRange = (item: TemplateItem, fromDay: number, toDay?: number) =>
  item.occurrences.filter((o) => o.day >= fromDay && (!toDay || o.day <= toDay)).length;

// Passing `count` makes i18next pick the `<key>_one` / `<key>_other` entry, e.g. "Weekly" vs "Every 2 weeks".
const formatInterval = (unit: ScheduleUnit, interval: number, t: TFunction): string => {
  switch (unit) {
    case 'day':
      return t('scheduleEveryDay', { count: interval });
    case 'week':
      return t('scheduleEveryWeek', { count: interval });
    case 'month':
      return t('scheduleEveryMonth', { count: interval });
  }
};

/** "Every 2 weeks on Mon, Fri" */
export const formatFrequency = (
  unit: ScheduleUnit,
  interval: number,
  selectedDays: string[],
  t: TFunction
): string => {
  const frequency = formatInterval(unit, interval, t);
  if (selectedDays.length === 0) return frequency;

  const days = selectedDays.map((day) => t(day)).join(', ');
  return t('scheduleOnDays', { frequency, days });
};

/** "Day 1 → 10", or "from day 4" when there is no last day */
export const formatDayRange = (start: number, end: number | undefined, t: TFunction): string =>
  end ? t('scheduleDayRange', { start, end }) : t('scheduleFromDay', { start });

/** "Every 2 weeks on Wed • Day 1 → 14 • 1 session" */
export const formatSegmentSummary = (
  segment: TemplateSegment,
  occurrenceCount: number,
  t: TFunction
): string => {
  const parts = [
    formatFrequency(segment.unit, segment.interval, segment.selectedDays, t),
    formatDayRange(segment.start_day, segment.end_day, t),
    t('scheduleOccurrences', { count: occurrenceCount }),
  ];
  return parts.join(' • ');
};
