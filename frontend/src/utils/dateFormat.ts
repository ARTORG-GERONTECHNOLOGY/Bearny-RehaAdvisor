// Local calendar YYYY-MM-DD (getFullYear/getMonth/getDate) — use for "what day is this on
// the user's own clock" (form defaults, day keys). NOT interchangeable with toISODateUTC:
// near midnight in a non-UTC timezone the two can disagree by a day.
export const toLocalYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// UTC YYYY-MM-DD (toISOString().slice(0, 10)) — use for machine-facing values (API params,
// filenames) where the reference frame just needs to be consistent, not calendar-accurate.
export const toISODateUTC = (d: Date): string => d.toISOString().slice(0, 10);

// Browser/OS default locale date, e.g. "3/7/2024" or "07.03.2024" depending on the user's
// system settings. Does not validate `input`; callers own their own invalid-date fallback.
export const formatLocaleDate = (input: string | Date): string => {
  const d = input instanceof Date ? input : new Date(input);
  return d.toLocaleDateString();
};

// Browser/OS default locale date + time. Does not validate `input`; callers own their own
// invalid-date fallback.
export const formatLocaleDateTime = (input: string | Date): string => {
  const d = input instanceof Date ? input : new Date(input);
  return d.toLocaleString();
};

// "Xh Ym" (or "Xh Ymin" via `unit`) — callers own their own fallback for null/zero/negative input.
export const formatDurationMinutes = (minutes: number, unit: 'm' | 'min' = 'm'): string => {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}${unit}` : `${m}${unit}`;
};

export const formatDurationMs = (ms: number, unit: 'm' | 'min' = 'm'): string =>
  formatDurationMinutes(ms / 60000, unit);
