import { forwardRef, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { FitbitEntry } from '@/types/health';
import { colors } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { averageNonNull, buildDailyRows, formatTickDate } from '@/utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start?: Date | null;
  end?: Date | null;
  className?: string;
};

type WeightRow = { date: string; weight: number | null };

export const filterWeightInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): WeightRow[] => buildDailyRows(data, start, end, 'weight', (d) => d.weight_kg ?? null);

export const averageWeight = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): number | null => averageNonNull(filterWeightInRange(data, start, end).map((r) => r.weight));

// The ref points at ChartContainer's wrapping <div>, not the inner <svg> — Recharts only
// mounts its <svg> once it has measured a size, so callers should query for it at read time
// (e.g. `ref.current?.querySelector('svg')`) rather than caching a possibly-stale node.
const WeightChart = forwardRef<HTMLDivElement, Props>(({ data, start, end, className }, ref) => {
  const { t } = useTranslation();

  const rows = useMemo(() => filterWeightInRange(data, start, end), [data, start, end]);
  const hasReadings = useMemo(() => rows.some((r) => r.weight != null), [rows]);

  // ChartContainer's required `config` prop and its per-series CSS vars.
  const chartConfig: ChartConfig = useMemo(
    () => ({
      weight: { label: t('WeightLabel'), color: colors.brand },
    }),
    [t]
  );

  if (!hasReadings) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex h-28 w-full items-center justify-center text-sm text-zinc-500',
          className
        )}
      >
        {t('No weight data')}
      </div>
    );
  }

  return (
    <ChartContainer ref={ref} config={chartConfig} className={cn('w-full max-h-28', className)}>
      <BarChart accessibilityLayer data={rows}>
        <CartesianGrid vertical={false} />
        <YAxis
          domain={['dataMin - 1', 'dataMax + 1']}
          width={30}
          tickCount={3}
          tickFormatter={(v: number) => `${Math.round(v * 10) / 10}`}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10 }}
        />
        <XAxis
          dataKey="date"
          tickFormatter={formatTickDate}
          interval="preserveStartEnd"
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          tick={{ fontSize: 10 }}
        />
        <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
        <Bar dataKey="weight" fill={colors.brand} />
      </BarChart>
    </ChartContainer>
  );
});

WeightChart.displayName = 'WeightChart';

export default WeightChart;
