import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { FitbitEntry } from '@/types/health';
import { colors } from '@/lib/colors';
import { isInRange } from '@/utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start?: Date | null;
  end?: Date | null;
  /** Upper bound of the healthy ("green") systolic/diastolic range, drawn as reference lines. */
  sysGreenMax?: number | null;
  diaGreenMax?: number | null;
};

type BloodPressureRow = { date: string; sys: number | null; dia: number | null };

// Filters fitbit entries with a systolic or diastolic reading to the visible date range.
export const filterBloodPressureInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): BloodPressureRow[] => {
  const raw = Array.isArray(data) ? data : [];

  return raw
    .filter((d) => (d.bp_sys != null || d.bp_dia != null) && isInRange(d.date, start, end))
    .map((d) => ({ date: d.date, sys: d.bp_sys ?? null, dia: d.bp_dia ?? null }));
};

// Mean systolic/diastolic across the visible date range; either can be null if no readings.
export const averageBloodPressure = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): { sys: number | null; dia: number | null } => {
  const rows = filterBloodPressureInRange(data, start, end);

  const mean = (values: number[]) =>
    values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

  return {
    sys: mean(rows.map((r) => r.sys).filter((v): v is number => v != null)),
    dia: mean(rows.map((r) => r.dia).filter((v): v is number => v != null)),
  };
};

// ChartContainer's required `config` prop and its per-series CSS vars.
const chartConfig: ChartConfig = {
  range: { color: colors.brand },
};

type BandRow = BloodPressureRow & { range: [number, number] | null };

// Recharts treats an array-valued dataKey as an explicit [base, top] range,
// so a single Area draws the band from diastolic straight to systolic.
const toBandRows = (rows: BloodPressureRow[]): BandRow[] =>
  rows.map((r) => ({
    ...r,
    range: r.sys != null && r.dia != null ? [r.dia, r.sys] : null,
  }));

const BloodPressureChart = forwardRef<SVGSVGElement, Props>(
  ({ data, start, end, sysGreenMax, diaGreenMax }, ref) => {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);

    const rows = useMemo(
      () => toBandRows(filterBloodPressureInRange(data, start, end)),
      [data, start, end]
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
        <div className="flex h-24 w-full items-center justify-center text-sm text-zinc-500">
          {t('No blood pressure data')}
        </div>
      );
    }

    return (
      <ChartContainer ref={containerRef} config={chartConfig} className="w-full max-h-24">
        <AreaChart accessibilityLayer data={rows}>
          <CartesianGrid vertical={false} />
          <YAxis
            hide
            domain={[
              0,
              (dataMax: number) =>
                Math.max(dataMax + 5, (sysGreenMax ?? 0) + 5, (diaGreenMax ?? 0) + 5),
            ]}
          />
          <XAxis hide dataKey="date" />
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideIndicator
                formatter={(_value, _name, item) => (
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex justify-between leading-none">
                      <span className="text-muted-foreground">{t('Blood pressure systolic')}</span>
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {item.payload.sys}
                      </span>
                    </div>
                    <div className="flex justify-between leading-none">
                      <span className="text-muted-foreground">{t('Blood pressure diastolic')}</span>
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {item.payload.dia}
                      </span>
                    </div>
                  </div>
                )}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="range"
            stroke={colors.brand}
            strokeWidth={2}
            fill={colors.brand}
            fillOpacity={0.5}
            dot={{ r: 3, fill: colors.brand, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            connectNulls
          />
          {sysGreenMax != null && (
            <ReferenceLine
              y={sysGreenMax}
              stroke={colors.chartMuted}
              strokeWidth={2}
              strokeDasharray="8 8"
            />
          )}
          {diaGreenMax != null && (
            <ReferenceLine
              y={diaGreenMax}
              stroke={colors.chartMuted}
              strokeWidth={2}
              strokeDasharray="8 8"
            />
          )}
        </AreaChart>
      </ChartContainer>
    );
  }
);

BloodPressureChart.displayName = 'BloodPressureChart';

export default BloodPressureChart;
