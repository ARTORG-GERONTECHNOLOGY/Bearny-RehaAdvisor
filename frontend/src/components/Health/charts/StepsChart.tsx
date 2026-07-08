import { forwardRef, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts';
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
  /** Daily steps goal, drawn as a reference line; bars that reach it are brand-colored. */
  goal?: number | null;
};

type StepsRow = { date: string; steps: number | null };

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
const StepsChart = forwardRef<HTMLDivElement, Props>(({ data, start, end, goal }, ref) => {
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
    return (
      <div ref={ref} className="flex h-24 w-full items-center justify-center text-sm text-zinc-500">
        {t('No steps data')}
      </div>
    );
  }

  return (
    <ChartContainer ref={ref} config={chartConfig} className="w-full max-h-24">
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
        <Bar dataKey="steps">
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
