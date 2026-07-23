// src/utils/healthCharts.ts
import { toLocalYMD } from '@/utils/dateFormat';

// `start`/`end` are always constructed as local calendar dates (e.g. `new Date(y, m, d)`).
// Comparing them as UTC instants against a UTC-parsed `iso` shifts the range by a day in any
// non-UTC timezone, so we compare calendar-date strings instead.
export const isInRange = (iso: string, start?: Date | null, end?: Date | null) => {
  const day = iso.slice(0, 10);
  return (!start || day >= toLocalYMD(start)) && (!end || day <= toLocalYMD(end));
};

// Every calendar date (YYYY-MM-DD, local) from `start` to `end` inclusive
export const eachDateInRange = (start: Date, end: Date): string[] => {
  const dates: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cur.getTime() <= last.getTime()) {
    dates.push(toLocalYMD(cur));
    cur.setDate(cur.getDate() + 1);
  }

  return dates;
};

// DD.MM.YYYY — used for both on-screen range labels and export files.
export const toEuroDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  const [y, m, d] = parts;
  return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`;
};

export const formatDateEU = (d: Date): string => toEuroDate(toLocalYMD(d));

// Fills gaps with null so charts show breaks instead of compressing to just the days with data.
export const buildDailyRows = <T extends { date: string }, K extends string>(
  data: T[],
  start: Date | null | undefined,
  end: Date | null | undefined,
  key: K,
  accessor: (entry: T) => number | null
): Array<{ date: string } & Record<K, number | null>> => {
  const raw = Array.isArray(data) ? data : [];
  const byDate = new Map(
    raw.filter((d) => isInRange(d.date, start, end)).map((d) => [d.date, accessor(d)])
  );

  const dates = start && end ? eachDateInRange(start, end) : [...byDate.keys()].sort();

  return dates.map(
    (date) =>
      ({ date, [key]: byDate.get(date) ?? null }) as { date: string } & Record<K, number | null>
  );
};

export const averageNonNull = (values: Array<number | null | undefined>): number | null => {
  const nums = values.filter((v): v is number => v != null);
  if (!nums.length) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
};

// ---------- threshold tiers (green/yellow/red goal coloring) ----------
export type ThresholdTier = 'green' | 'yellow' | 'red';

const TIER_SEVERITY: Record<ThresholdTier, number> = { green: 0, yellow: 1, red: 2 };

// Classifies a value against a green ("good") and yellow ("caution") threshold.
// `higherIsBetter` flips the comparison for metrics like blood pressure, where lower is healthier.
// Returns null when there's no value to classify (e.g. a day with no reading).
export const thresholdTier = (
  value: number | null | undefined,
  green: number | null | undefined,
  yellow: number | null | undefined,
  higherIsBetter: boolean
): ThresholdTier | null => {
  if (value == null) return null;
  if (green == null) return 'green';

  const reachedGreen = higherIsBetter ? value >= green : value <= green;
  if (reachedGreen) return 'green';

  const reachedYellow = yellow != null && (higherIsBetter ? value >= yellow : value <= yellow);
  return reachedYellow ? 'yellow' : 'red';
};

// Worst (most severe) of several tiers, ignoring nulls. Used when a single day is
// judged by more than one metric (e.g. blood pressure's systolic + diastolic readings).
export const worstTier = (...tiers: (ThresholdTier | null)[]): ThresholdTier | null =>
  tiers
    .filter((t): t is ThresholdTier => t != null)
    .reduce<ThresholdTier | null>(
      (worst, t) => (worst == null || TIER_SEVERITY[t] > TIER_SEVERITY[worst] ? t : worst),
      null
    );

// ---------- svg & shared UI ----------
// Export → data URL (for PDF export)
export const svgToImageDataUrl = (el: SVGSVGElement): Promise<string> =>
  new Promise((resolve) => {
    const vb = el.viewBox.baseVal;
    const w = vb?.width || 800;
    const h = vb?.height || 300;

    const clone = el.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));

    const s = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([s], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = url;
  });
