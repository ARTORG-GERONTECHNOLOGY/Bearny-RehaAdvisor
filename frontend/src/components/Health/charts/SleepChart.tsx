import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { FitbitEntry } from '@/types/health';
import { colors } from '@/lib/colors';
import { eachDateInRange, isInRange } from '@/utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start?: Date | null;
  end?: Date | null;
  goal?: number | null;
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
  const values = filterSleepInRange(data, start, end)
    .map((r) => r.minutesAsleep)
    .filter((v): v is number => v != null);

  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

export const formatSleepDuration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const formatTimeOfDay = (iso: string) => iso.slice(11, 16);

const SleepChart = forwardRef<SVGSVGElement, Props>(({ data, start, end, goal }, ref) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => filterSleepInRange(data, start, end), [data, start, end]);
  const hasReadings = useMemo(() => rows.some((r) => r.minutesAsleep != null), [rows]);

  const chartConfig: ChartConfig = useMemo(
    () => ({
      minutesAsleep: { label: t('Asleep'), color: colors.brand },
    }),
    [t]
  );

  // Recharts doesn't expose its inner <svg> via a ref prop, so grab it off the
  // container once rendered. Used for PDF export, which needs a real SVGSVGElement.
  useEffect(() => {
    if (!ref || typeof ref === 'function') return;
    (ref as React.RefObject<SVGSVGElement | null>).current =
      containerRef.current?.querySelector('svg') ?? null;
  });

  if (!hasReadings) {
    return (
      <div className="flex h-24 w-full items-center justify-center text-sm text-zinc-500">
        {t('No sleep data')}
      </div>
    );
  }

  return (
    <ChartContainer ref={containerRef} config={chartConfig} className="w-full max-h-24">
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
        <Bar dataKey="minutesAsleep">
          {rows.map((row, index) => (
            <Cell
              key={`cell-${index}`}
              fill={
                row.minutesAsleep == null
                  ? 'transparent'
                  : goal == null || row.minutesAsleep >= goal
                    ? colors.brand
                    : colors.pink
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
});

SleepChart.displayName = 'SleepChart';

export default SleepChart;
