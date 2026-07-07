import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
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
};

type WeightRow = { date: string; weight: number | null };

// One row per calendar day in the visible range (inclusive), so gaps show up as
// missing bars instead of compressing the timeline down to just the days with a reading.
export const filterWeightInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): WeightRow[] => {
  const raw = Array.isArray(data) ? data : [];
  const byDate = new Map(
    raw.filter((d) => isInRange(d.date, start, end)).map((d) => [d.date, d.weight_kg ?? null])
  );

  const dates = start && end ? eachDateInRange(start, end) : [...byDate.keys()].sort();

  return dates.map((date) => ({ date, weight: byDate.get(date) ?? null }));
};

// Mean of the non-null weight readings in the visible date range, or null if none.
export const averageWeight = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): number | null => {
  const values = filterWeightInRange(data, start, end)
    .map((r) => r.weight)
    .filter((v): v is number => v != null);

  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

const WeightChart = forwardRef<SVGSVGElement, Props>(({ data, start, end }, ref) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => filterWeightInRange(data, start, end), [data, start, end]);
  const hasReadings = useMemo(() => rows.some((r) => r.weight != null), [rows]);

  // ChartContainer's required `config` prop and its per-series CSS vars.
  const chartConfig: ChartConfig = useMemo(
    () => ({
      weight: { label: t('WeightLabel'), color: colors.brand },
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
        {t('No weight data')}
      </div>
    );
  }

  return (
    <ChartContainer ref={containerRef} config={chartConfig} className="w-full max-h-24">
      <BarChart accessibilityLayer data={rows}>
        <CartesianGrid vertical={false} />
        <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
        <XAxis hide dataKey="date" />
        <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
        <Bar dataKey="weight" fill={colors.brand} radius={4} />
      </BarChart>
    </ChartContainer>
  );
});

WeightChart.displayName = 'WeightChart';

export default WeightChart;
