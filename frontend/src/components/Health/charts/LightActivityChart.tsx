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
  formatTickInteger,
} from '@/utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start?: Date | null;
  end?: Date | null;
  className?: string;
};

type LightActivityRow = { date: string; lightlyActiveMinutes: number | null };

export const filterLightActivityInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): LightActivityRow[] =>
  buildDailyRows(data, start, end, 'lightlyActiveMinutes', (d) => d.lightly_active_minutes || null);

export const averageLightActivity = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): number | null =>
  averageNonNull(filterLightActivityInRange(data, start, end).map((r) => r.lightlyActiveMinutes));

// The ref points at ChartContainer's wrapping <div>, not the inner <svg> — Recharts only
// mounts its <svg> once it has measured a size, so callers should query for it at read time
// (e.g. `ref.current?.querySelector('svg')`) rather than caching a possibly-stale node.
const LightActivityChart = forwardRef<HTMLDivElement, Props>(
  ({ data, start, end, className }, ref) => {
    const { t } = useTranslation();

    const rows = useMemo(() => filterLightActivityInRange(data, start, end), [data, start, end]);
    const hasReadings = useMemo(() => rows.some((r) => r.lightlyActiveMinutes != null), [rows]);

    const chartConfig: ChartConfig = useMemo(
      () => ({
        lightlyActiveMinutes: { label: t('light_activity_minutes'), color: colors.brand },
      }),
      [t]
    );

    if (!hasReadings) {
      return (
        <ChartEmptyState ref={ref} message={t('no_light_activity_data')} className={className} />
      );
    }

    return (
      <ChartContainer ref={ref} config={chartConfig} className={cn('w-full max-h-28', className)}>
        <BarChart accessibilityLayer data={rows}>
          <CartesianGrid vertical={false} />
          <YAxis domain={[0, 'auto']} {...chartYAxisProps(formatTickInteger)} />
          <XAxis {...chartXAxisProps} />
          <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
          <Bar dataKey="lightlyActiveMinutes" fill={colors.brand} />
        </BarChart>
      </ChartContainer>
    );
  }
);

LightActivityChart.displayName = 'LightActivityChart';

export default LightActivityChart;
