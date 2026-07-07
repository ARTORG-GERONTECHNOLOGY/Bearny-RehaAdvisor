// components/charts/MetricBarOrBox.tsx
import React, { useEffect, useRef, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FitbitEntry } from '@/types/health';
import { isInRange, drawBarTimeseries, personalRangeFromWindow } from '@/utils/healthCharts';

type Props = {
  titleKey: string; // i18n key for the chart title
  data: FitbitEntry[];
  accessor: (d: FitbitEntry) => number | null | undefined;
  start?: Date | null;
  end?: Date | null;

  /** Color each bar by whether it falls in the patient's personal range (default true) */
  showPersonalRange?: boolean;
  /** Personal range window (days), lower/upper percentiles */
  rangeWindowDays?: number; // default 30
  rangeLowerPct?: number; // default 3
  rangeUpperPct?: number; // default 97

  /** Optional fixed goal value, drawn as a reference line (e.g. a patient's daily steps goal) */
  goal?: number | null;
};

const MetricBarOrBox = forwardRef<SVGSVGElement, Props>((props, ref) => {
  const {
    titleKey,
    data,
    accessor,
    start,
    end,
    showPersonalRange = true,
    rangeWindowDays = 30,
    rangeLowerPct = 3,
    rangeUpperPct = 97,
    goal,
  } = props;

  const { t } = useTranslation();
  const localRef = useRef<SVGSVGElement>(null);
  const svgRef = (ref as React.RefObject<SVGSVGElement>) || localRef;

  useEffect(() => {
    if (!data?.length) return;

    const rows = data
      .filter((d) => isInRange(d.date, start, end))
      .map((d) => ({ x: d.date, y: accessor(d) }))
      .filter((r): r is { x: string; y: number } => r.y != null);

    const band = showPersonalRange
      ? personalRangeFromWindow(data, (d) => d.date, accessor, {
          windowDays: rangeWindowDays,
          lowerPct: rangeLowerPct,
          upperPct: rangeUpperPct,
          end: end ?? new Date(data[data.length - 1].date),
        })
      : null;

    drawBarTimeseries(svgRef, rows, t(titleKey), {
      band: band ?? undefined,
      legend: { inRange: t('In range'), outOfRange: t('Out of range') },
      goal,
      goalLabel: t('Goal'),
    });
  }, [
    data,
    accessor,
    start,
    end,
    t,
    titleKey,
    showPersonalRange,
    rangeWindowDays,
    rangeLowerPct,
    rangeUpperPct,
    goal,
  ]);

  return <svg ref={svgRef} style={{ width: '100%', height: 'auto' }} />;
});

MetricBarOrBox.displayName = 'MetricBarOrBox';

export default MetricBarOrBox;
