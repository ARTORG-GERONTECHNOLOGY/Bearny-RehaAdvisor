// Clinical threshold shape + defaults shared by every store that reads/writes patient thresholds

export type PatientThresholds = {
  steps_goal: number;

  active_minutes_green: number;
  active_minutes_yellow: number;

  sleep_green_min: number;
  sleep_yellow_min: number;

  bp_sys_green_max: number;
  bp_sys_yellow_max: number;
  bp_dia_green_max: number;
  bp_dia_yellow_max: number;
};

export const DEFAULT_THRESHOLDS: PatientThresholds = {
  steps_goal: 10000,
  active_minutes_green: 30,
  active_minutes_yellow: 20,
  sleep_green_min: 7 * 60,
  sleep_yellow_min: 6 * 60,
  bp_sys_green_max: 129,
  bp_sys_yellow_max: 139,
  bp_dia_green_max: 84,
  bp_dia_yellow_max: 89,
};

const toFiniteNumber = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
};

// Coerces an arbitrary API/patch payload into a fully-populated PatientThresholds,
// falling back field-by-field to DEFAULT_THRESHOLDS for anything missing or non-numeric.
export const normalizeThresholds = (raw: unknown): PatientThresholds => {
  const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    steps_goal: toFiniteNumber(t.steps_goal, DEFAULT_THRESHOLDS.steps_goal),

    active_minutes_green: toFiniteNumber(
      t.active_minutes_green,
      DEFAULT_THRESHOLDS.active_minutes_green
    ),
    active_minutes_yellow: toFiniteNumber(
      t.active_minutes_yellow,
      DEFAULT_THRESHOLDS.active_minutes_yellow
    ),

    sleep_green_min: toFiniteNumber(t.sleep_green_min, DEFAULT_THRESHOLDS.sleep_green_min),
    sleep_yellow_min: toFiniteNumber(t.sleep_yellow_min, DEFAULT_THRESHOLDS.sleep_yellow_min),

    bp_sys_green_max: toFiniteNumber(t.bp_sys_green_max, DEFAULT_THRESHOLDS.bp_sys_green_max),
    bp_sys_yellow_max: toFiniteNumber(t.bp_sys_yellow_max, DEFAULT_THRESHOLDS.bp_sys_yellow_max),
    bp_dia_green_max: toFiniteNumber(t.bp_dia_green_max, DEFAULT_THRESHOLDS.bp_dia_green_max),
    bp_dia_yellow_max: toFiniteNumber(t.bp_dia_yellow_max, DEFAULT_THRESHOLDS.bp_dia_yellow_max),
  };
};

// Applies a partial patch on top of a base threshold set, then re-normalizes the result.
export const mergeThresholds = (
  base: PatientThresholds,
  patch?: Partial<PatientThresholds> | null
): PatientThresholds => normalizeThresholds({ ...base, ...(patch || {}) });
