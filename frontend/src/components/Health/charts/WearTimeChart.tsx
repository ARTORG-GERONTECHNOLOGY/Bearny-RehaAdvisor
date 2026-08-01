import { forwardRef, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
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
  deviceNeverReports,
  formatTickDuration,
} from '@/utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start?: Date | null;
  end?: Date | null;
  className?: string;
};

type WearTimeRow = { date: string; wearTime: number | null };

export const filterWearTimeInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): WearTimeRow[] =>
  buildDailyRows(data, start, end, 'wearTime', (d) => d.wear_time_minutes ?? null);

export const averageWearTime = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): number | null => averageNonNull(filterWearTimeInRange(data, start, end).map((r) => r.wearTime));

// The ref points at ChartContainer's wrapping <div>, not the inner <svg> — Recharts only
// mounts its <svg> once it has measured a size, so callers should query for it at read time
// (e.g. `ref.current?.querySelector('svg')`) rather than caching a possibly-stale node.
const WearTimeChart = forwardRef<HTMLDivElement, Props>(({ data, start, end, className }, ref) => {
  const { t } = useTranslation();

  const rows = useMemo(() => filterWearTimeInRange(data, start, end), [data, start, end]);
  const hasReadings = useMemo(() => rows.some((r) => r.wearTime != null), [rows]);
  const deviceEmpty = deviceNeverReports(data, (d) => d.wear_time_minutes);

  const chartConfig: ChartConfig = useMemo(
    () => ({
      wearTime: { label: t('Wear Time (min)'), color: colors.brand },
    }),
    [t]
  );

  if (!hasReadings) {
    return (
      <ChartEmptyState
        ref={ref}
        message={t('No wear time data')}
        hint={deviceEmpty ? t('hint_wear_time_empty') : undefined}
        className={className}
      />
    );
  }

  return (
    <ChartContainer ref={ref} config={chartConfig} className={cn('w-full max-h-28', className)}>
      <BarChart accessibilityLayer data={rows}>
        <CartesianGrid vertical={false} />
        <YAxis
          domain={[0, (dataMax: number) => dataMax * 1.1]}
          {...chartYAxisProps(formatTickDuration, 34)}
        />
        <XAxis {...chartXAxisProps} />
        <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
        <Bar dataKey="wearTime" fill={colors.brand} />
      </BarChart>
    </ChartContainer>
  );
});

WearTimeChart.displayName = 'WearTimeChart';

export default WearTimeChart;
