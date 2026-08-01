import { forwardRef, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { AdherenceEntry } from '@/types/health';
import { colors } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { toLocalYMD } from '@/utils/dateFormat';
import { averageNonNull, buildDailyRows, formatTickDate } from '@/utils/healthCharts';

type Props = {
  data: AdherenceEntry[];
  start?: Date | null;
  end?: Date | null;
  className?: string;
};

type AdherenceRow = { date: string; pct: number | null };

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

// Adherence should only be displayed for days that have already happened
const isFutureDate = (date: string): boolean => date > toLocalYMD(new Date());

export const filterAdherenceInRange = (
  data: AdherenceEntry[],
  start?: Date | null,
  end?: Date | null
): AdherenceRow[] => {
  const rows = buildDailyRows(data, start, end, 'pct', (r) =>
    Number.isFinite(r.pct) ? clampPct(r.pct as number) : null
  );
  return rows.map((row) => (isFutureDate(row.date) ? { ...row, pct: null } : row));
};

export const averageAdherencePct = (
  data: AdherenceEntry[],
  start?: Date | null,
  end?: Date | null
): number | null => averageNonNull(filterAdherenceInRange(data, start, end).map((r) => r.pct));

// The ref points at ChartContainer's wrapping <div>, not the inner <svg> — Recharts only
// mounts its <svg> once it has measured a size, so callers should query for it at read time
// (e.g. `ref.current?.querySelector('svg')`) rather than caching a possibly-stale node.
const AdherenceLine = forwardRef<HTMLDivElement, Props>(({ data, start, end, className }, ref) => {
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
      <div
        ref={ref}
        className={cn(
          'flex h-28 w-full items-center justify-center text-sm text-zinc-500',
          className
        )}
      >
        {t('No adherence data')}
      </div>
    );
  }

  return (
    <ChartContainer ref={ref} config={chartConfig} className={cn('w-full max-h-28', className)}>
      <AreaChart accessibilityLayer data={rows}>
        <CartesianGrid vertical={false} />
        <YAxis
          domain={[0, 100]}
          width={30}
          tickCount={3}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10 }}
        />
        <XAxis
          dataKey="date"
          tickFormatter={formatTickDate}
          interval="preserveStartEnd"
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          tick={{ fontSize: 10 }}
        />
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
