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
  TIER_COLOR,
} from '@/utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start?: Date | null;
  end?: Date | null;
  goal?: number | null;
  className?: string;
};

type StepsRow = { date: string; steps: number | null };

const formatStepsTick = (value: number): string =>
  value >= 1000 ? `${Math.round(value / 1000)}k` : `${Math.round(value)}`;

export const filterStepsInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): StepsRow[] => buildDailyRows(data, start, end, 'steps', (d) => d.steps ?? null);

export const averageSteps = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): number | null => averageNonNull(filterStepsInRange(data, start, end).map((r) => r.steps));

// The ref points at ChartContainer's wrapping <div>, not the inner <svg> — Recharts only
// mounts its <svg> once it has measured a size, so callers should query for it at read time
// (e.g. `ref.current?.querySelector('svg')`) rather than caching a possibly-stale node.
const StepsChart = forwardRef<HTMLDivElement, Props>(
  ({ data, start, end, goal, className }, ref) => {
    const { t } = useTranslation();

    const rows = useMemo(() => filterStepsInRange(data, start, end), [data, start, end]);
    const hasReadings = useMemo(() => rows.some((r) => r.steps != null), [rows]);

    const chartConfig: ChartConfig = useMemo(
      () => ({
        steps: { label: t('Steps'), color: colors.brand },
      }),
      [t]
    );

    if (!hasReadings) {
      return <ChartEmptyState ref={ref} message={t('No steps data')} className={className} />;
    }

    return (
      <ChartContainer ref={ref} config={chartConfig} className={cn('w-full max-h-28', className)}>
        <BarChart accessibilityLayer data={rows}>
          <CartesianGrid vertical={false} />
          <YAxis
            domain={[0, (dataMax: number) => Math.max(dataMax, goal ?? 0) * 1.1]}
            {...chartYAxisProps(formatStepsTick)}
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
          <Bar dataKey="steps">
            {rows.map((row, index) => {
              const tier = thresholdTier(row.steps, goal, null, true);
              return <Cell key={`cell-${index}`} fill={tier ? TIER_COLOR[tier] : 'transparent'} />;
            })}
          </Bar>
        </BarChart>
      </ChartContainer>
    );
  }
);

StepsChart.displayName = 'StepsChart';

export default StepsChart;
