import { forwardRef, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import ChartEmptyState from '@/components/Health/charts/ChartEmptyState';
import type { FitbitEntry } from '@/types/health';
import { colors } from '@/lib/colors';
import { cn } from '@/lib/utils';
import {
  averageNonNull,
  buildDailyRows,
  chartXAxisProps,
  chartYAxisProps,
  thresholdTier,
} from '@/utils/healthCharts';
import type { ThresholdTier } from '@/utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start?: Date | null;
  end?: Date | null;
  goal?: number | null;
  yellowGoal?: number | null;
  className?: string;
};

export const TIER_COLOR: Record<ThresholdTier, string> = {
  green: colors.brand,
  yellow: colors.yellow,
  red: colors.pink,
};

type ActiveMinutesRow = { date: string; activeMinutes: number | null };

export const filterActiveMinutesInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): ActiveMinutesRow[] =>
  buildDailyRows(data, start, end, 'activeMinutes', (d) => d.active_minutes ?? null);

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
  ({ data, start, end, goal, yellowGoal, className }, ref) => {
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
        <ChartEmptyState ref={ref} message={t('No active minutes data')} className={className} />
      );
    }

    return (
      <ChartContainer ref={ref} config={chartConfig} className={cn('w-full max-h-28', className)}>
        <BarChart accessibilityLayer data={rows}>
          <CartesianGrid vertical={false} />
          <YAxis
            domain={[0, (dataMax: number) => Math.max(dataMax, goal ?? 0) * 1.1]}
            {...chartYAxisProps((v) => `${Math.round(v)}`)}
          />
          <XAxis {...chartXAxisProps} />
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
