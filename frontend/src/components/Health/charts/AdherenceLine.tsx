import { forwardRef, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { AdherenceEntry } from '@/types/health';
import { colors } from '@/lib/colors';
import { eachDateInRange, isInRange } from '@/utils/healthCharts';

type Props = {
  data: AdherenceEntry[];
  start?: Date | null;
  end?: Date | null;
};

type AdherenceRow = { date: string; pct: number | null };

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

// One row per calendar day in the visible range (inclusive), so gaps show up as
// breaks in the line instead of compressing the timeline down to just the days with a reading.
export const filterAdherenceInRange = (
  data: AdherenceEntry[],
  start?: Date | null,
  end?: Date | null
): AdherenceRow[] => {
  const raw = Array.isArray(data) ? data : [];
  const byDate = new Map(
    raw
      .filter((r) => isInRange(r.date, start, end))
      .map((r) => [r.date, Number.isFinite(r.pct) ? clampPct(r.pct as number) : null])
  );

  const dates = start && end ? eachDateInRange(start, end) : [...byDate.keys()].sort();

  return dates.map((date) => ({ date, pct: byDate.get(date) ?? null }));
};

// Mean of the non-null pct values in the visible date range, or null if none.
export const averageAdherencePct = (
  data: AdherenceEntry[],
  start?: Date | null,
  end?: Date | null
): number | null => {
  const values = filterAdherenceInRange(data, start, end)
    .map((r) => r.pct)
    .filter((v): v is number => v != null);

  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

// The ref points at ChartContainer's wrapping <div>, not the inner <svg> — Recharts only
// mounts its <svg> once it has measured a size, so callers should query for it at read time
// (e.g. `ref.current?.querySelector('svg')`) rather than caching a possibly-stale node.
const AdherenceLine = forwardRef<HTMLDivElement, Props>(({ data, start, end }, ref) => {
  const { t } = useTranslation();

  const rows = useMemo(() => filterAdherenceInRange(data, start, end), [data, start, end]);
  const hasReadings = useMemo(() => rows.some((r) => r.pct != null), [rows]);

  const chartConfig: ChartConfig = useMemo(
    () => ({
      pct: { label: t('Adherence (%)') },
    }),
    [t]
  );

  if (!hasReadings) {
    return (
      <div ref={ref} className="flex h-24 w-full items-center justify-center text-sm text-zinc-500">
        {t('No adherence data')}
      </div>
    );
  }

  return (
    <ChartContainer ref={ref} config={chartConfig} className="w-full max-h-24">
      <AreaChart accessibilityLayer data={rows}>
        <CartesianGrid vertical={false} />
        <YAxis hide domain={[0, 100]} />
        <XAxis hide dataKey="date" />
        <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
        <Area
          type="monotone"
          dataKey="pct"
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

AdherenceLine.displayName = 'AdherenceLine';

export default AdherenceLine;
