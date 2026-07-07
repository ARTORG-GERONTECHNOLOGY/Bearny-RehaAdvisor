// components/charts/MetricBarOrBox.tsx
import React, { useEffect, useRef, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FitbitEntry } from '@/types/health';
import { isInRange, drawBarTimeseries } from '@/utils/healthCharts';

type Props = {
  titleKey: string; // i18n key for the chart title
  data: FitbitEntry[];
  accessor: (d: FitbitEntry) => number | null | undefined;
  start?: Date | null;
  end?: Date | null;
};

const MetricBarOrBox = forwardRef<SVGSVGElement, Props>((props, ref) => {
  const { titleKey, data, accessor, start, end } = props;

  const { t } = useTranslation();
  const localRef = useRef<SVGSVGElement>(null);
  const svgRef = (ref as React.RefObject<SVGSVGElement>) || localRef;

  useEffect(() => {
    if (!data?.length) return;

    const rows = data
      .filter((d) => isInRange(d.date, start, end))
      .map((d) => ({ x: d.date, y: accessor(d) }))
      .filter((r): r is { x: string; y: number } => r.y != null);

    drawBarTimeseries(svgRef, rows, t(titleKey));
  }, [data, accessor, start, end, t]);

  return <svg ref={svgRef} style={{ width: '100%', height: 'auto' }} />;
});

MetricBarOrBox.displayName = 'MetricBarOrBox';

export default MetricBarOrBox;
