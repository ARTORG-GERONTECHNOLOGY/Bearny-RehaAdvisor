import { forwardRef, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { FitbitEntry } from '@/types/health';
import { colors } from '@/lib/colors';
import { averageNonNull, isInRange, thresholdTier, worstTier } from '@/utils/healthCharts';
import type { ThresholdTier } from '@/utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start?: Date | null;
  end?: Date | null;
  /** Upper bound of the healthy ("green") systolic/diastolic range, drawn as reference lines. */
  sysGreenMax?: number | null;
  diaGreenMax?: number | null;
  /** Softer "caution" upper bound above green; readings above green but within yellow are yellow-colored. */
  sysYellowMax?: number | null;
  diaYellowMax?: number | null;
};

const TIER_COLOR: Record<ThresholdTier, string> = {
  green: colors.brand,
  yellow: colors.yellow,
  red: colors.pink,
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

  return {
    sys: averageNonNull(rows.map((r) => r.sys)),
    dia: averageNonNull(rows.map((r) => r.dia)),
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

// The ref points at ChartContainer's wrapping <div>, not the inner <svg> — Recharts only
// mounts its <svg> once it has measured a size, so callers should query for it at read time
// (e.g. `ref.current?.querySelector('svg')`) rather than caching a possibly-stale node.
const BloodPressureChart = forwardRef<HTMLDivElement, Props>(
  ({ data, start, end, sysGreenMax, diaGreenMax, sysYellowMax, diaYellowMax }, ref) => {
    const { t } = useTranslation();

    const rows = useMemo(
      () => toBandRows(filterBloodPressureInRange(data, start, end)),
      [data, start, end]
    );

    // Worse of the systolic/diastolic tier for that day — a single reading out of range is
    // enough to flag the day, so the dot color reflects whichever metric is doing worse.
    const dotColor = (row: BandRow): string => {
      const sysTier = thresholdTier(row.sys, sysGreenMax, sysYellowMax, false);
      const diaTier = thresholdTier(row.dia, diaGreenMax, diaYellowMax, false);
      const tier = worstTier(sysTier, diaTier);
      return tier ? TIER_COLOR[tier] : colors.brand;
    };

    const renderDot =
      (radius: number) =>
      (props: { cx?: number; cy?: number; index?: number; payload?: BandRow }) => {
        const { cx, cy, index, payload } = props;
        if (cx == null || cy == null || !payload || payload.range == null) {
          return <g key={`dot-${index}`} />;
        }
        return <circle key={`dot-${index}`} cx={cx} cy={cy} r={radius} fill={dotColor(payload)} />;
      };

    if (!rows.length) {
      return (
        <div
          ref={ref}
          className="flex h-24 w-full items-center justify-center text-sm text-zinc-500"
        >
          {t('No blood pressure data')}
        </div>
      );
    }

    return (
      <ChartContainer ref={ref} config={chartConfig} className="w-full max-h-24">
        <AreaChart accessibilityLayer data={rows}>
          <CartesianGrid vertical={false} />
          <YAxis
            hide
            domain={[
              0,
              (dataMax: number) =>
                Math.max(
                  dataMax + 5,
                  (sysGreenMax ?? 0) + 5,
                  (diaGreenMax ?? 0) + 5,
                  (sysYellowMax ?? 0) + 5,
                  (diaYellowMax ?? 0) + 5
                ),
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
            dot={renderDot(3)}
            activeDot={renderDot(4)}
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
          {sysYellowMax != null && (
            <ReferenceLine
              y={sysYellowMax}
              stroke={colors.chartMuted}
              strokeWidth={2}
              strokeDasharray="4 4"
            />
          )}
          {diaYellowMax != null && (
            <ReferenceLine
              y={diaYellowMax}
              stroke={colors.chartMuted}
              strokeWidth={2}
              strokeDasharray="4 4"
            />
          )}
        </AreaChart>
      </ChartContainer>
    );
  }
);

BloodPressureChart.displayName = 'BloodPressureChart';

export default BloodPressureChart;
