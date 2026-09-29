import { forwardRef, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { AlertTriangle } from 'lucide-react';
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

type SedentaryRow = { date: string; sedentaryMinutes: number | null };

export const filterSedentaryInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): SedentaryRow[] =>
  buildDailyRows(data, start, end, 'sedentaryMinutes', (d) => d.inactivity_minutes || null);

export const averageSedentary = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): number | null =>
  averageNonNull(filterSedentaryInRange(data, start, end).map((r) => r.sedentaryMinutes));

// The ref points at ChartContainer's wrapping <div>, not the inner <svg> — Recharts only
// mounts its <svg> once it has measured a size, so callers should query for it at read time
// (e.g. `ref.current?.querySelector('svg')`) rather than caching a possibly-stale node.
const SedentaryChart = forwardRef<HTMLDivElement, Props>(({ data, start, end, className }, ref) => {
  const { t } = useTranslation();

  const rows = useMemo(() => filterSedentaryInRange(data, start, end), [data, start, end]);
  const hasReadings = useMemo(() => rows.some((r) => r.sedentaryMinutes != null), [rows]);

  // Warn when any day with sedentary data has no detected sleep — missing sleep
  // inflates the inactivity figure since sleep_minutes contributes 0 to the formula.
  const hasMissingSleep = useMemo(() => {
    const dataByDate = new Map(data.map((d) => [d.date, d]));
    return rows.some((r) => r.sedentaryMinutes != null && !dataByDate.get(r.date)?.sleep);
  }, [rows, data]);

  const chartConfig: ChartConfig = useMemo(
    () => ({
      sedentaryMinutes: { label: t('sedentary_minutes'), color: colors.chartMuted },
    }),
    [t]
  );

  if (!hasReadings) {
    return <ChartEmptyState ref={ref} message={t('no_sedentary_data')} className={className} />;
  }

  return (
    <div className={cn('w-full', className)}>
      <ChartContainer ref={ref} config={chartConfig} className="w-full max-h-28">
        <BarChart accessibilityLayer data={rows}>
          <CartesianGrid vertical={false} />
          <YAxis domain={[0, 'auto']} {...chartYAxisProps(formatTickInteger)} />
          <XAxis {...chartXAxisProps} />
          <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
          <Bar dataKey="sedentaryMinutes" fill={colors.chartMuted} />
        </BarChart>
      </ChartContainer>
      {hasMissingSleep && (
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {t('inactivity_sleep_warning')}
        </p>
      )}
    </div>
  );
});

SedentaryChart.displayName = 'SedentaryChart';

export default SedentaryChart;
