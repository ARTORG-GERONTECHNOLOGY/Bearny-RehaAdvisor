// components/charts/MetricBarOrBox.tsx
import React, { useEffect, useRef, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartRes, FitbitEntry } from '../../../types/health';
import {
  isInRange,
  drawBarTimeseries,
  drawBoxTimeseries,
  groupToBoxes,
  aggregateToPeriods,
  personalRangeFromWindow,
  drawRangeLineSeries,
} from '../../../utils/healthCharts';

type Props = {
  titleKey: string;                        // i18n key for the chart title
  data: FitbitEntry[];
  accessor: (d: FitbitEntry) => number | null | undefined;
  start?: Date | null;
  end?: Date | null;
  res: ChartRes;

  /** Weekly/Monthly: draw Fitbit-style band  line (default) */
  useFitbitRange?: boolean;
  /** Personal range window (days), lower/upper percentiles */
  rangeWindowDays?: number;                // default 30
  rangeLowerPct?: number;                  // default 3
  rangeUpperPct?: number;                  // default 97
};

const MetricBarOrBox = forwardRef<SVGSVGElement, Props>((props, ref) => {
  const {
    titleKey,
    data,
    accessor,
    start,
    end,
    res,
    useFitbitRange = true,
    rangeWindowDays = 30,
    rangeLowerPct = 3,
    rangeUpperPct = 97,
  } = props;

  const { t } = useTranslation();
  const localRef = useRef<SVGSVGElement>(null);
  const svgRef = (ref as React.RefObject<SVGSVGElement>) || localRef;

  useEffect(() => {
    if (!data?.length) return;

    if (res === 'daily') {
      const rows = data
        .filter(d => isInRange(d.date, start, end))
        .map(d => ({ x: d.date, y: accessor(d) }))
        .filter((r): r is { x: string; y: number } => r.y != null);

      drawBarTimeseries(svgRef, rows, t(titleKey), { legendLabel: t('Daily value') });
      return;
    }

    // Weekly / Monthly
    if (useFitbitRange) {
      // Full period domain (so empty periods still show on the axis)
      const s = start ?? new Date(data[0].date);
      const e = end   ?? new Date(data[data.length - 1].date);

      const { rows } = aggregateToPeriods(
        data,
        d => d.date,
        accessor,
        res as 'weekly' | 'monthly',
        s,
        e
      );

      // Personal range band (P3–P97 over trailing N days)
      const band = personalRangeFromWindow(
        data,
        d => d.date,
        accessor,
        { windowDays: rangeWindowDays, lowerPct: rangeLowerPct, upperPct: rangeUpperPct, end: e }
      );

      drawRangeLineSeries(
svgRef,
   rows,
   res as 'weekly' | 'monthly',
   t(titleKey),
   band,
   {
     legend: {
       personalRange: t('Personal range'),
       inRange: t('In range'),
       outOfRange: t('Out of range'),
       note: t('In range = value within the personal band (P3–P97 over the last 30 days).'),
     },
     // optional theming:
     // colors: { band: '#1f77b4', inDot: '#2b83ba', outDot: '#d88997', line: '#2b83ba' }
   }
      );
    } else {
      // Optional fallback to distribution box-plots
      const rows = groupToBoxes(
        data,
        d => d.date,
        accessor,
        res as 'weekly' | 'monthly',
        start,
        end
      );
      drawBoxTimeseries(
        svgRef,
        rows,
        res as 'weekly' | 'monthly',
        t(`${titleKey} (distribution)`)
      );
    }
  }, [
    data,
    accessor,
    start,
    end,
    res,
    useFitbitRange,
    rangeWindowDays,
    rangeLowerPct,
    rangeUpperPct,
    t,
  ]);

  return <svg ref={svgRef} style={{ width: '100%', height: 'auto' }} />;
});

export default MetricBarOrBox;
