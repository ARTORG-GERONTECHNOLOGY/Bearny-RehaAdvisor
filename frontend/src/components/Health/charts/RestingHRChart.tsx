import { forwardRef, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
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

type RestingHRRow = { date: string; restingHR: number | null };

// One row per calendar day in the visible range (inclusive), so gaps show up as
// breaks in the line instead of compressing the timeline down to just the days with a reading.
export const filterRestingHRInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): RestingHRRow[] => {
  const raw = Array.isArray(data) ? data : [];
  const byDate = new Map(
    raw
      .filter((d) => isInRange(d.date, start, end))
      .map((d) => [d.date, d.resting_heart_rate ?? null])
  );

  const dates = start && end ? eachDateInRange(start, end) : [...byDate.keys()].sort();

  return dates.map((date) => ({ date, restingHR: byDate.get(date) ?? null }));
};

// Mean of the non-null resting heart rate readings in the visible date range, or null if none.
export const averageRestingHR = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): number | null => {
  const values = filterRestingHRInRange(data, start, end)
    .map((r) => r.restingHR)
    .filter((v): v is number => v != null);

  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

// The ref points at ChartContainer's wrapping <div>, not the inner <svg> — Recharts only
// mounts its <svg> once it has measured a size, so callers should query for it at read time
// (e.g. `ref.current?.querySelector('svg')`) rather than caching a possibly-stale node.
const RestingHRChart = forwardRef<HTMLDivElement, Props>(({ data, start, end }, ref) => {
  const { t } = useTranslation();

  const rows = useMemo(() => filterRestingHRInRange(data, start, end), [data, start, end]);
  const hasReadings = useMemo(() => rows.some((r) => r.restingHR != null), [rows]);
  // Device-capability hint: some Fitbit devices never report resting heart rate. Show the
  // hint only when there IS Fitbit data, just none of it has this field.
  const deviceEmpty = data.length > 0 && data.every((d) => d.resting_heart_rate == null);

  const chartConfig: ChartConfig = useMemo(
    () => ({
      restingHR: { label: t('Resting Heart Rate'), color: colors.brand },
    }),
    [t]
  );

  if (!hasReadings) {
    return (
      <div ref={ref} className="flex h-24 w-full flex-col items-center justify-center gap-1 text-center">
        <span className="text-sm text-zinc-500">{t('No resting heart rate data')}</span>
        {deviceEmpty && <span className="text-xs text-zinc-500">{t('hint_resting_hr_empty')}</span>}
      </div>
    );
  }

  return (
    <ChartContainer ref={ref} config={chartConfig} className="w-full max-h-24">
      <AreaChart accessibilityLayer data={rows}>
        <CartesianGrid vertical={false} />
        <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
        <XAxis hide dataKey="date" />
        <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
        <Area
          type="monotone"
          dataKey="restingHR"
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

RestingHRChart.displayName = 'RestingHRChart';

export default RestingHRChart;
