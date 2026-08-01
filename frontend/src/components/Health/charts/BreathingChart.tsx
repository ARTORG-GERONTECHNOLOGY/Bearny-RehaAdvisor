import { forwardRef, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
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
  formatTickDecimal,
} from '@/utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start?: Date | null;
  end?: Date | null;
  className?: string;
};

type BreathingRow = { date: string; breathingRate: number | null };

export const filterBreathingInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): BreathingRow[] =>
  buildDailyRows(data, start, end, 'breathingRate', (d) => d.breathing_rate?.breathingRate ?? null);

export const averageBreathingRate = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): number | null =>
  averageNonNull(filterBreathingInRange(data, start, end).map((r) => r.breathingRate));

// The ref points at ChartContainer's wrapping <div>, not the inner <svg> — Recharts only
// mounts its <svg> once it has measured a size, so callers should query for it at read time
// (e.g. `ref.current?.querySelector('svg')`) rather than caching a possibly-stale node.
const BreathingChart = forwardRef<HTMLDivElement, Props>(({ data, start, end, className }, ref) => {
  const { t } = useTranslation();

  const rows = useMemo(() => filterBreathingInRange(data, start, end), [data, start, end]);
  const hasReadings = useMemo(() => rows.some((r) => r.breathingRate != null), [rows]);
  const deviceEmpty = deviceNeverReports(data, (d) => d.breathing_rate?.breathingRate);

  const chartConfig: ChartConfig = useMemo(
    () => ({
      breathingRate: { label: t('Breathing Rate (breaths/min)'), color: colors.brand },
    }),
    [t]
  );

  if (!hasReadings) {
    return (
      <ChartEmptyState
        ref={ref}
        message={t('No breathing rate data')}
        hint={deviceEmpty ? t('hint_breathing_rate_empty') : undefined}
        className={className}
      />
    );
  }

  return (
    <ChartContainer ref={ref} config={chartConfig} className={cn('w-full max-h-28', className)}>
      <AreaChart accessibilityLayer data={rows}>
        <CartesianGrid vertical={false} />
        <YAxis domain={['dataMin - 1', 'dataMax + 1']} {...chartYAxisProps(formatTickDecimal)} />
        <XAxis {...chartXAxisProps} />
        <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
        <Area
          type="monotone"
          dataKey="breathingRate"
          stroke={colors.brand}
          strokeWidth={2}
          fill={colors.brand}
          fillOpacity={0.5}
          dot={{ r: 3, fill: colors.brand, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
          connectNulls
        />
      </AreaChart>
    </ChartContainer>
  );
});

BreathingChart.displayName = 'BreathingChart';

export default BreathingChart;
