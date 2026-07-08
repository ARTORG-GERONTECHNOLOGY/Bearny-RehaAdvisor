import { forwardRef, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { FitbitEntry } from '@/types/health';
import { colors } from '@/lib/colors';
import { averageNonNull, buildDailyRows, thresholdTier } from '@/utils/healthCharts';
import type { ThresholdTier } from '@/utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start?: Date | null;
  end?: Date | null;
  /** Daily active minutes goal, drawn as a reference line; bars that reach it are brand-colored. */
  goal?: number | null;
  /** Softer "caution" threshold below goal; bars that reach it but not goal are yellow-colored. */
  yellowGoal?: number | null;
};

const TIER_COLOR: Record<ThresholdTier, string> = {
  green: colors.brand,
  yellow: colors.yellow,
  red: colors.pink,
};

type ActiveMinutesRow = { date: string; activeMinutes: number | null };

// One row per calendar day in the visible range (inclusive), so gaps show up as
// missing bars instead of compressing the timeline down to just the days with a reading.
export const filterActiveMinutesInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): ActiveMinutesRow[] =>
  buildDailyRows(data, start, end, 'activeMinutes', (d) => d.active_minutes ?? null);

// Mean of the non-null daily active minutes readings in the visible date range, or null if none.
export const averageActiveMinutes = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): number | null =>
  averageNonNull(filterActiveMinutesInRange(data, start, end).map((r) => r.activeMinutes));

// The ref points at ChartContainer's wrapping <div>, not the inner <svg> — Recharts only
// mounts its <svg> once it has measured a size, so callers should query for it at read time
// (e.g. `ref.current?.querySelector('svg')`) rather than caching a possibly-stale node.
const ActiveMinutesChart = forwardRef<HTMLDivElement, Props>(
  ({ data, start, end, goal, yellowGoal }, ref) => {
    const { t } = useTranslation();

    const rows = useMemo(() => filterActiveMinutesInRange(data, start, end), [data, start, end]);
    const hasReadings = useMemo(() => rows.some((r) => r.activeMinutes != null), [rows]);

    const chartConfig: ChartConfig = useMemo(
      () => ({
        activeMinutes: { label: t('Active Minutes'), color: colors.brand },
      }),
      [t]
    );

    if (!hasReadings) {
      return (
        <div
          ref={ref}
          className="flex h-24 w-full items-center justify-center text-sm text-zinc-500"
        >
          {t('No active minutes data')}
        </div>
      );
    }

    return (
      <ChartContainer ref={ref} config={chartConfig} className="w-full max-h-24">
        <BarChart accessibilityLayer data={rows}>
          <CartesianGrid vertical={false} />
          <YAxis hide domain={[0, (dataMax: number) => Math.max(dataMax, goal ?? 0) * 1.1]} />
          <XAxis hide dataKey="date" />
          <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
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
          <Bar dataKey="activeMinutes">
            {rows.map((row, index) => {
              const tier = thresholdTier(row.activeMinutes, goal, yellowGoal, true);
              return <Cell key={`cell-${index}`} fill={tier ? TIER_COLOR[tier] : 'transparent'} />;
            })}
          </Bar>
        </BarChart>
      </ChartContainer>
    );
  }
);

ActiveMinutesChart.displayName = 'ActiveMinutesChart';

export default ActiveMinutesChart;
