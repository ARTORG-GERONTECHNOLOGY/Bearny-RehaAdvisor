import { forwardRef, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { FitbitEntry } from '@/types/health';
import { colors } from '@/lib/colors';
import { averageNonNull, eachDateInRange, isInRange } from '@/utils/healthCharts';
import { formatDurationMinutes } from '@/utils/dateFormat';

type Props = {
  data: FitbitEntry[];
  start?: Date | null;
  end?: Date | null;
};

const ZONE_KEYS = ['outOfRange', 'fatBurn', 'cardio', 'peak'] as const;
type ZoneKey = (typeof ZONE_KEYS)[number];

// Out of Range (resting/background) is excluded from the stacked bars
// It's still tracked in the row data and available via zoneBpmRanges.
const STACK_ZONE_KEYS = ['fatBurn', 'cardio', 'peak'] as const satisfies readonly ZoneKey[];

// Maps the Fitbit zone name (as reported by the API) to our internal row key.
const ZONE_NAME_TO_KEY: Record<string, ZoneKey> = {
  'Out of Range': 'outOfRange',
  'Fat Burn': 'fatBurn',
  Cardio: 'cardio',
  Peak: 'peak',
};

const ZONE_LABEL_KEY: Record<ZoneKey, string> = {
  outOfRange: 'hr_zone_out_of_range',
  fatBurn: 'hr_zone_fat_burn',
  cardio: 'hr_zone_cardio',
  peak: 'hr_zone_peak',
};

const ZONE_COLOR: Record<ZoneKey, string> = {
  outOfRange: colors.chartMuted,
  fatBurn: colors.brand,
  cardio: colors.yellow,
  peak: colors.nok,
};

type HRZonesRow = { date: string } & Record<ZoneKey, number>;

export const zoneBpmRanges = (data: FitbitEntry[]): Partial<Record<ZoneKey, string>> => {
  const ranges: Partial<Record<ZoneKey, string>> = {};
  (Array.isArray(data) ? data : []).forEach((d) =>
    (d.heart_rate_zones || []).forEach((z) => {
      const key = ZONE_NAME_TO_KEY[z.name];
      if (key && !ranges[key] && z.min != null && z.max != null) {
        ranges[key] = `${z.min}–${z.max} bpm`;
      }
    })
  );
  return ranges;
};

export const averageActiveHRZoneMinutes = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): number | null => {
  const raw = Array.isArray(data) ? data : [];
  const dailyTotals = raw
    .filter((d) => isInRange(d.date, start, end) && (d.heart_rate_zones?.length ?? 0) > 0)
    .map((d) =>
      (d.heart_rate_zones || []).reduce((sum, z) => {
        const key = ZONE_NAME_TO_KEY[z.name];
        return key && key !== 'outOfRange' ? sum + (z.minutes || 0) : sum;
      }, 0)
    );

  return averageNonNull(dailyTotals);
};

export const filterHRZonesInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): HRZonesRow[] => {
  const raw = Array.isArray(data) ? data : [];
  const byDate = new Map(
    raw.filter((d) => isInRange(d.date, start, end)).map((d) => [d.date, d.heart_rate_zones ?? []])
  );

  const dates = start && end ? eachDateInRange(start, end) : [...byDate.keys()].sort();

  return dates.map((date) => {
    const zones = byDate.get(date) ?? [];
    const row = { date } as HRZonesRow;
    ZONE_KEYS.forEach((k) => (row[k] = 0));
    zones.forEach((z) => {
      const key = ZONE_NAME_TO_KEY[z.name];
      if (key) row[key] = z.minutes || 0;
    });
    return row;
  });
};

const formatHM = (min: number) => {
  if (!min || min <= 0) return '0m';
  return formatDurationMinutes(min);
};

// The ref points at ChartContainer's wrapping <div>, not the inner <svg> — Recharts only
// mounts its <svg> once it has measured a size, so callers should query for it at read time
// (e.g. `ref.current?.querySelector('svg')`) rather than caching a possibly-stale node.
const HRZonesStacked = forwardRef<HTMLDivElement, Props>(({ data, start, end }, ref) => {
  const { t } = useTranslation();

  const rows = useMemo(() => filterHRZonesInRange(data, start, end), [data, start, end]);
  // Distinguish "the device recorded nothing" from "readings exist but all in the
  // resting (Out of Range) zone" — the latter is real data, not missing data.
  const hasAnyReadings = useMemo(() => rows.some((r) => ZONE_KEYS.some((k) => r[k] > 0)), [rows]);
  const hasActiveZoneMinutes = useMemo(
    () => rows.some((r) => STACK_ZONE_KEYS.some((k) => r[k] > 0)),
    [rows]
  );
  const bpmRanges = useMemo(() => zoneBpmRanges(data), [data]);

  const chartConfig: ChartConfig = useMemo(
    () =>
      Object.fromEntries(
        ZONE_KEYS.map((k) => [
          k,
          {
            label: `${t(ZONE_LABEL_KEY[k])}${bpmRanges[k] ? ` (${bpmRanges[k]})` : ''}`,
            color: ZONE_COLOR[k],
          },
        ])
      ) as ChartConfig,
    [t, bpmRanges]
  );

  if (!hasAnyReadings) {
    return (
      <div ref={ref} className="flex h-24 w-full items-center justify-center text-sm text-zinc-500">
        {t('No heart rate zone data')}
      </div>
    );
  }

  if (!hasActiveZoneMinutes) {
    return (
      <div ref={ref} className="flex h-24 w-full items-center justify-center text-sm text-zinc-500">
        {t('No time in active heart rate zones')}
      </div>
    );
  }

  return (
    <ChartContainer ref={ref} config={chartConfig} className="w-full max-h-24">
      <BarChart accessibilityLayer data={rows}>
        <CartesianGrid vertical={false} />
        <YAxis hide domain={[0, (dataMax: number) => dataMax * 1.1]} />
        <XAxis hide dataKey="date" />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => (
                <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: item.color }}
                    />
                    {chartConfig[name as ZoneKey]?.label}
                  </span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {formatHM(value as number)}
                  </span>
                </div>
              )}
            />
          }
        />
        {STACK_ZONE_KEYS.map((k) => (
          <Bar key={k} dataKey={k} stackId="zones" fill={ZONE_COLOR[k]} />
        ))}
      </BarChart>
    </ChartContainer>
  );
});

HRZonesStacked.displayName = 'HRZonesStacked';

export default HRZonesStacked;
