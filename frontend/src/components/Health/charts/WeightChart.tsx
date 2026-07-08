import { forwardRef, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { FitbitEntry } from '@/types/health';
import { colors } from '@/lib/colors';
import { averageNonNull, buildDailyRows } from '@/utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start?: Date | null;
  end?: Date | null;
};

type WeightRow = { date: string; weight: number | null };

// One row per calendar day in the visible range (inclusive), so gaps show up as
// missing bars instead of compressing the timeline down to just the days with a reading.
export const filterWeightInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): WeightRow[] => buildDailyRows(data, start, end, 'weight', (d) => d.weight_kg ?? null);

// Mean of the non-null weight readings in the visible date range, or null if none.
export const averageWeight = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): number | null => averageNonNull(filterWeightInRange(data, start, end).map((r) => r.weight));

// The ref points at ChartContainer's wrapping <div>, not the inner <svg> — Recharts only
// mounts its <svg> once it has measured a size, so callers should query for it at read time
// (e.g. `ref.current?.querySelector('svg')`) rather than caching a possibly-stale node.
const WeightChart = forwardRef<HTMLDivElement, Props>(({ data, start, end }, ref) => {
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
      <div ref={ref} className="flex h-24 w-full items-center justify-center text-sm text-zinc-500">
        {t('No weight data')}
      </div>
    );
  }

  return (
    <ChartContainer ref={ref} config={chartConfig} className="w-full max-h-24">
      <BarChart accessibilityLayer data={rows}>
        <CartesianGrid vertical={false} />
        <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
        <XAxis hide dataKey="date" />
        <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
        <Bar dataKey="weight" fill={colors.brand} />
      </BarChart>
    </ChartContainer>
  );
});

WeightChart.displayName = 'WeightChart';

export default WeightChart;
