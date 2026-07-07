import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { AdherenceEntry } from '@/types/health';
import { colors } from '@/lib/colors';
import { isInRange } from '@/utils/healthCharts';

type Props = {
  data: AdherenceEntry[];
  start?: Date | null;
  end?: Date | null;
};

type AdherenceRow = { date: string; pct: number | null };

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

// Filters raw adherence entries to the visible date range and clamps pct to 0..100.
export const filterAdherenceInRange = (
  data: AdherenceEntry[],
  start?: Date | null,
  end?: Date | null
): AdherenceRow[] => {
  const raw = Array.isArray(data) ? data : [];

  return raw
    .filter((r) => isInRange(r.date, start, end))
    .map((r) => ({
      date: r.date,
      pct: Number.isFinite(r.pct) ? clampPct(r.pct as number) : null,
    }));
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

const AdherenceLine = forwardRef<SVGSVGElement, Props>(({ data, start, end }, ref) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => filterAdherenceInRange(data, start, end), [data, start, end]);

  const chartConfig: ChartConfig = useMemo(
    () => ({
      pct: { label: t('Adherence (%)') },
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

  if (!rows.length) {
    return (
      <div className="flex h-32 w-full items-center justify-center text-sm text-zinc-500">
        {t('No adherence data')}
      </div>
    );
  }

  return (
    <ChartContainer ref={containerRef} config={chartConfig} className="w-full max-h-32">
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
