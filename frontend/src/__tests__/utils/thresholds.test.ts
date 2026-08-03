import {
  DEFAULT_THRESHOLDS,
  normalizeThresholds,
  mergeThresholds,
  type PatientThresholds,
} from '@/utils/thresholds';

describe('thresholds', () => {
  it('defines every field of PatientThresholds', () => {
    const keys: (keyof PatientThresholds)[] = [
      'steps_goal',
      'active_minutes_green',
      'active_minutes_yellow',
      'sleep_green_min',
      'sleep_yellow_min',
      'bp_sys_green_max',
      'bp_sys_yellow_max',
      'bp_dia_green_max',
      'bp_dia_yellow_max',
    ];

    keys.forEach((key) => {
      expect(typeof DEFAULT_THRESHOLDS[key]).toBe('number');
    });
    expect(Object.keys(DEFAULT_THRESHOLDS).sort()).toEqual([...keys].sort());
  });

  it('matches the known clinical defaults', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      steps_goal: 10000,
      active_minutes_green: 30,
      active_minutes_yellow: 20,
      sleep_green_min: 420,
      sleep_yellow_min: 360,
      bp_sys_green_max: 129,
      bp_sys_yellow_max: 139,
      bp_dia_green_max: 84,
      bp_dia_yellow_max: 89,
    });
  });

  it('orders green thresholds stricter than yellow thresholds', () => {
    expect(DEFAULT_THRESHOLDS.active_minutes_green).toBeGreaterThan(
      DEFAULT_THRESHOLDS.active_minutes_yellow
    );
    expect(DEFAULT_THRESHOLDS.sleep_green_min).toBeGreaterThan(DEFAULT_THRESHOLDS.sleep_yellow_min);
    expect(DEFAULT_THRESHOLDS.bp_sys_green_max).toBeLessThan(DEFAULT_THRESHOLDS.bp_sys_yellow_max);
    expect(DEFAULT_THRESHOLDS.bp_dia_green_max).toBeLessThan(DEFAULT_THRESHOLDS.bp_dia_yellow_max);
  });
});

describe('normalizeThresholds', () => {
  it('returns all defaults when given nothing', () => {
    expect(normalizeThresholds(undefined)).toEqual(DEFAULT_THRESHOLDS);
    expect(normalizeThresholds(null)).toEqual(DEFAULT_THRESHOLDS);
  });

  it('passes through valid numeric fields', () => {
    const result = normalizeThresholds({ steps_goal: 5000 });
    expect(result.steps_goal).toBe(5000);
    expect(result.sleep_green_min).toBe(DEFAULT_THRESHOLDS.sleep_green_min);
  });

  it('coerces numeric strings', () => {
    expect(normalizeThresholds({ steps_goal: '7500' }).steps_goal).toBe(7500);
  });

  it('falls back to the default for missing or non-numeric fields, including null', () => {
    expect(normalizeThresholds({ steps_goal: null }).steps_goal).toBe(
      DEFAULT_THRESHOLDS.steps_goal
    );
    expect(normalizeThresholds({ steps_goal: 'not-a-number' }).steps_goal).toBe(
      DEFAULT_THRESHOLDS.steps_goal
    );
    expect(normalizeThresholds({}).steps_goal).toBe(DEFAULT_THRESHOLDS.steps_goal);
  });

  it('ignores non-object input', () => {
    expect(normalizeThresholds('nonsense')).toEqual(DEFAULT_THRESHOLDS);
  });
});

describe('mergeThresholds', () => {
  it('overlays patch fields onto the base, keeping the rest', () => {
    const base: PatientThresholds = { ...DEFAULT_THRESHOLDS, steps_goal: 8000 };
    const merged = mergeThresholds(base, { sleep_green_min: 480 });
    expect(merged.steps_goal).toBe(8000);
    expect(merged.sleep_green_min).toBe(480);
  });

  it('returns the base unchanged when patch is omitted', () => {
    const base: PatientThresholds = { ...DEFAULT_THRESHOLDS, steps_goal: 8000 };
    expect(mergeThresholds(base)).toEqual(base);
    expect(mergeThresholds(base, null)).toEqual(base);
  });
});
