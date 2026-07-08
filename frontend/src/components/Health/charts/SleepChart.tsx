import { forwardRef, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { FitbitEntry } from '@/types/health';
import { colors } from '@/lib/colors';
import { averageNonNull, eachDateInRange, isInRange, thresholdTier } from '@/utils/healthCharts';
import type { ThresholdTier } from '@/utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start?: Date | null;
  end?: Date | null;
  /** Minimum minutes asleep to count as "enough sleep", drawn as a reference line; bars that reach it are brand-colored. */
  goal?: number | null;
  /** Softer "caution" threshold below goal; bars that reach it but not goal are yellow-colored. */
  yellowGoal?: number | null;
};

const TIER_COLOR: Record<ThresholdTier, string> = {
  green: colors.brand,
  yellow: colors.yellow,
  red: colors.pink,
};

type SleepRow = {
  date: string;
  minutesAsleep: number | null;
  sleepStart: string | null;
  sleepEnd: string | null;
};

// Prefers minutes_asleep (actual sleep, matches the Fitbit app). Legacy records only have
// sleep_duration (ms, total time in bed), so fall back to that rather than dropping the day.
const resolveMinutesAsleep = (sleep: FitbitEntry['sleep']): number | null => {
  if (!sleep) return null;
  if (sleep.minutes_asleep != null) return sleep.minutes_asleep;
  if (sleep.sleep_duration != null) return sleep.sleep_duration / 60000;
  return null;
};

// One row per calendar day, so every day gets a bar slot even without a reading.
export const filterSleepInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): SleepRow[] => {
  const raw = Array.isArray(data) ? data : [];
  const byDate = new Map(
    raw
      .filter((d) => isInRange(d.date, start, end))
      .map((d) => [
        d.date,
        {
          minutesAsleep: resolveMinutesAsleep(d.sleep),
          sleepStart: d.sleep?.sleep_start ?? null,
          sleepEnd: d.sleep?.sleep_end ?? null,
        },
      ])
  );

  const dates = start && end ? eachDateInRange(start, end) : [...byDate.keys()].sort();

  return dates.map((date) => {
    const entry = byDate.get(date);
    return {
      date,
      minutesAsleep: entry?.minutesAsleep ?? null,
      sleepStart: entry?.sleepStart ?? null,
      sleepEnd: entry?.sleepEnd ?? null,
    };
  });
};

export const averageSleepMinutes = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): number | null => {
  return averageNonNull(filterSleepInRange(data, start, end).map((r) => r.minutesAsleep));
};

export const formatSleepDuration = (min: number) => {
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// sleep_start/sleep_end are naive local ISO timestamps (e.g. "2026-01-01T22:00:00.000") —
// slicing avoids a timezone-shifting Date parse for what's just a clock-time display.
const formatTimeOfDay = (iso: string) => iso.slice(11, 16);

// The ref points at ChartContainer's wrapping <div>, not the inner <svg> — Recharts only
// mounts its <svg> once it has measured a size, so callers should query for it at read time
// (e.g. `ref.current?.querySelector('svg')`) rather than caching a possibly-stale node.
const SleepChart = forwardRef<HTMLDivElement, Props>(
  ({ data, start, end, goal, yellowGoal }, ref) => {
    const { t } = useTranslation();

    const rows = useMemo(() => filterSleepInRange(data, start, end), [data, start, end]);
    const hasReadings = useMemo(() => rows.some((r) => r.minutesAsleep != null), [rows]);

    const chartConfig: ChartConfig = useMemo(
      () => ({
        minutesAsleep: { label: t('Asleep'), color: colors.brand },
      }),
      [t]
    );

    if (!hasReadings) {
      return (
        <div
          ref={ref}
          className="flex h-24 w-full items-center justify-center text-sm text-zinc-500"
        >
          {t('No sleep data')}
        </div>
      );
    }

    return (
      <ChartContainer ref={ref} config={chartConfig} className="w-full max-h-24">
        <BarChart accessibilityLayer data={rows}>
          <CartesianGrid vertical={false} />
          <YAxis hide domain={[0, (dataMax: number) => Math.max(dataMax, goal ?? 0) * 1.1]} />
          <XAxis hide dataKey="date" />
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideIndicator
                formatter={(value, _name, item) => {
                  const minutesAsleep = value as number | null;
                  const row = item.payload as SleepRow;
                  return (
                    <div className="flex flex-1 flex-col gap-1">
                      <div className="flex items-center justify-between gap-4 leading-none">
                        <span className="text-muted-foreground">{t('Asleep')}</span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {minutesAsleep != null ? formatSleepDuration(minutesAsleep) : '--'}
                        </span>
                      </div>
                      {row.sleepStart && row.sleepEnd && (
                        <div className="flex items-center justify-between gap-4 leading-none">
                          <span className="text-muted-foreground">{t('Sleep window')}</span>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {formatTimeOfDay(row.sleepStart)}–{formatTimeOfDay(row.sleepEnd)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
            }
          />
          {goal != null && (
            <ReferenceLine
              y={goal}
              stroke={colors.chartMuted}
              strokeWidth={2}
              strokeDasharray="8 8"
            />
          )}
          {yellowGoal != null && (
            <ReferenceLine
              y={yellowGoal}
              stroke={colors.chartMuted}
              strokeWidth={2}
              strokeDasharray="4 4"
            />
          )}
          <Bar dataKey="minutesAsleep">
            {rows.map((row, index) => {
              const tier = thresholdTier(row.minutesAsleep, goal, yellowGoal, true);
              return <Cell key={`cell-${index}`} fill={tier ? TIER_COLOR[tier] : 'transparent'} />;
            })}
          </Bar>
        </BarChart>
      </ChartContainer>
    );
  }
);

SleepChart.displayName = 'SleepChart';

export default SleepChart;
