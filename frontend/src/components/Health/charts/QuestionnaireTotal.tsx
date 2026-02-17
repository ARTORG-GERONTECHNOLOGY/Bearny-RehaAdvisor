import React, { useEffect, useRef, forwardRef } from 'react';
import * as d3 from 'd3';
import { useTranslation } from 'react-i18next';
import { ChartRes, QuestionnaireEntry } from '../../../types/health';
import {
  drawBarTimeseries,
  drawBoxTimeseries,
  groupToBoxes,
  isInRange,
} from '../../../utils/healthCharts';

type Props = {
  data: QuestionnaireEntry[];
  start?: Date | null;
  end?: Date | null;
  res: ChartRes; // 'daily' | 'weekly' | 'monthly'
};

const toNum = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const dayIso = (d: Date) => d.toISOString().slice(0, 10);

const QuestionnaireTotal = forwardRef<SVGSVGElement, Props>(({ data, start, end, res }, ref) => {
  const { t } = useTranslation();
  const local = useRef<SVGSVGElement>(null);
  const svgRef = (ref as React.RefObject<SVGSVGElement>) || local;

  useEffect(() => {
    if (!svgRef.current || !document.body.contains(svgRef.current)) return;

    if (res === 'daily') {
      // group answers per day
      const grouped = d3.rollup(
        (data || []).filter((d) => isInRange(d.date, start, end)),
        (entries) => d3.sum(entries, (e) => toNum(e?.answers?.[0]?.key)),
        (d) => d.date.slice(0, 10)
      );

      // build full day domain
      const s = start
        ? new Date(start)
        : grouped.size
          ? new Date([...grouped.keys()].sort()[0])
          : new Date();
      const e = end ? new Date(end) : s;
      const days = d3.timeDay.range(
        new Date(s.getFullYear(), s.getMonth(), s.getDate()),
        d3.timeDay.offset(new Date(e.getFullYear(), e.getMonth(), e.getDate()), 1)
      );
      const xDomain = days.map(dayIso);

      // rows have y=null for missing days ➜ axis shows them, but no bar is drawn
      const rows = xDomain.map((k) => ({ x: k, y: grouped.get(k) ?? null }));

      drawBarTimeseries(svgRef, rows, t('Total Questionnaire Score Per Day'), {
        xDomain,
        barColor: '#69b3a2',
        legendLabel: t('Total Score'),
      });
    } else {
      const rows = groupToBoxes(
        data,
        (d) => d.date.slice(0, 10),
        (d) => {
          const n = Number(d?.answers?.[0]?.key);
          return Number.isFinite(n) ? n : undefined;
        },
        res,
        start,
        end
      );

      drawBoxTimeseries(
        svgRef,
        rows,
        res,
        res === 'weekly'
          ? t('Total Score per Week (distribution)')
          : t('Total Score per Month (distribution)')
      );
    }
  }, [data, start, end, res, t]);

  return <svg ref={svgRef} style={{ width: '1000', height: 'auto' }} />;
});

export default QuestionnaireTotal;
