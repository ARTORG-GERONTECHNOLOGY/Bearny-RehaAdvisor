import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts';
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
  /** Daily steps goal, drawn as a reference line; bars that reach it are brand-colored. */
  goal?: number | null;
};

type StepsRow = { date: string; steps: number | null };

// One row per calendar day in the visible range (inclusive), so gaps show up as
// missing bars instead of compressing the timeline down to just the days with a reading.
export const filterStepsInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): StepsRow[] => {
  const raw = Array.isArray(data) ? data : [];
  const byDate = new Map(
    raw.filter((d) => isInRange(d.date, start, end)).map((d) => [d.date, d.steps ?? null])
  );

  const dates = start && end ? eachDateInRange(start, end) : [...byDate.keys()].sort();

  return dates.map((date) => ({ date, steps: byDate.get(date) ?? null }));
};

// Mean of the non-null daily steps readings in the visible date range, or null if none.
export const averageSteps = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): number | null => {
  const values = filterStepsInRange(data, start, end)
    .map((r) => r.steps)
    .filter((v): v is number => v != null);

  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

const StepsChart = forwardRef<SVGSVGElement, Props>(({ data, start, end, goal }, ref) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => filterStepsInRange(data, start, end), [data, start, end]);
  const hasReadings = useMemo(() => rows.some((r) => r.steps != null), [rows]);

  const chartConfig: ChartConfig = useMemo(
    () => ({
      steps: { label: t('Steps'), color: colors.brand },
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
        {t('No steps data')}
      </div>
    );
  }

  return (
    <ChartContainer ref={containerRef} config={chartConfig} className="w-full max-h-24">
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
        <Bar dataKey="steps" radius={4}>
          {rows.map((row, index) => (
            <Cell
              key={`cell-${index}`}
              fill={
                row.steps == null
                  ? 'transparent'
                  : goal == null || row.steps >= goal
                    ? colors.brand
                    : colors.pink
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
});

StepsChart.displayName = 'StepsChart';

export default StepsChart;
