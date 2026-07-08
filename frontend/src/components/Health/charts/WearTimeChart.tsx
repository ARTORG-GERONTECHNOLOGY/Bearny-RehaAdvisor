import { forwardRef, useMemo } from 'react';
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

type WearTimeRow = { date: string; wearTime: number | null };

// One row per calendar day in the visible range (inclusive), so gaps show up as
// missing bars instead of compressing the timeline down to just the days with a reading.
export const filterWearTimeInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): WearTimeRow[] => {
  const raw = Array.isArray(data) ? data : [];
  const byDate = new Map(
    raw
      .filter((d) => isInRange(d.date, start, end))
      .map((d) => [d.date, d.wear_time_minutes ?? null])
  );

  const dates = start && end ? eachDateInRange(start, end) : [...byDate.keys()].sort();

  return dates.map((date) => ({ date, wearTime: byDate.get(date) ?? null }));
};

// Mean of the non-null daily wear-time readings in the visible date range, or null if none.
export const averageWearTime = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): number | null => {
  const values = filterWearTimeInRange(data, start, end)
    .map((r) => r.wearTime)
    .filter((v): v is number => v != null);

  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

// The ref points at ChartContainer's wrapping <div>, not the inner <svg> — Recharts only
// mounts its <svg> once it has measured a size, so callers should query for it at read time
// (e.g. `ref.current?.querySelector('svg')`) rather than caching a possibly-stale node.
const WearTimeChart = forwardRef<HTMLDivElement, Props>(({ data, start, end }, ref) => {
  const { t } = useTranslation();

  const rows = useMemo(() => filterWearTimeInRange(data, start, end), [data, start, end]);
  const hasReadings = useMemo(() => rows.some((r) => r.wearTime != null), [rows]);
  const deviceEmpty = data.length > 0 && data.every((d) => d.wear_time_minutes == null);

  const chartConfig: ChartConfig = useMemo(
    () => ({
      wearTime: { label: t('Wear Time (min)'), color: colors.brand },
    }),
    [t]
  );

  if (!hasReadings) {
    return (
      <div ref={ref} className="flex h-24 w-full flex-col items-center justify-center gap-1 text-center">
        <span className="text-sm text-zinc-500">{t('No wear time data')}</span>
        {deviceEmpty && <span className="text-xs text-zinc-500">{t('hint_wear_time_empty')}</span>}
      </div>
    );
  }

  return (
    <ChartContainer ref={ref} config={chartConfig} className="w-full max-h-24">
      <BarChart accessibilityLayer data={rows}>
        <CartesianGrid vertical={false} />
        <YAxis hide domain={[0, (dataMax: number) => dataMax * 1.1]} />
        <XAxis hide dataKey="date" />
        <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
        <Bar dataKey="wearTime" fill={colors.brand} />
      </BarChart>
    </ChartContainer>
  );
});

WearTimeChart.displayName = 'WearTimeChart';

export default WearTimeChart;
