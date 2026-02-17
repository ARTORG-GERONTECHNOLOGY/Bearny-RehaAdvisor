import React, { useEffect, useRef, forwardRef } from 'react';
import * as d3 from 'd3';
import { useTranslation } from 'react-i18next';
import { QuestionnaireEntry } from '../../../types/health';
import { isInRange, renderLegend, getOrCreateTooltip } from '../../../utils/healthCharts';
import { smartBandAxisBottom } from '../../../utils/healthCharts';

type Props = {
  data: QuestionnaireEntry[];
  visibleKeys: Record<string, boolean>;
  start?: Date | null;
  end?: Date | null;
};

const toNum = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const dayIso = (d: Date) => d.toISOString().slice(0, 10);

const QuestionnaireLines = forwardRef<SVGSVGElement, Props>(
  ({ data, visibleKeys, start, end }, ref) => {
    const { i18n, t } = useTranslation();
    const local = useRef<SVGSVGElement>(null);
    const svgRef = (ref as React.RefObject<SVGSVGElement>) || local;

    useEffect(() => {
      if (!svgRef.current || !document.body.contains(svgRef.current)) return;
      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();

      const W = 900,
        H = 420,
        m = { top: 36, right: 40, bottom: 60, left: 60 };
      svg.attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid meet');

      const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
      const width = W - m.left - m.right;
      const height = H - m.top - m.bottom;

      const filtered = (data || []).filter((d) => isInRange(d.date, start, end));
      const byQ = d3.group(filtered, (d) => d.questionKey);
      const keys = Array.from(byQ.keys()).filter((k) => visibleKeys?.[k]);

      // full day domain for axis
      const s = start ? new Date(start) : filtered.length ? new Date(filtered[0].date) : new Date();
      const e = end ? new Date(end) : s;
      const days = d3.timeDay.range(
        new Date(s.getFullYear(), s.getMonth(), s.getDate()),
        d3.timeDay.offset(new Date(e.getFullYear(), e.getMonth(), e.getDate()), 1)
      );
      const xDomain = days.map((d) => new Date(dayIso(d)));

      const x = d3
        .scaleTime()
        .domain([xDomain[0] ?? s, xDomain[xDomain.length - 1] ?? e])
        .range([0, width]);

      const yMax = d3.max(filtered, (d) => toNum(d?.answers?.[0]?.key)) ?? 5;
      const y = d3
        .scaleLinear()
        .domain([0, Math.max(5, yMax)])
        .nice()
        .range([height, 0]);

      smartBandAxisBottom(g.append('g').attr('transform', `translate(0,${height})`), x, width);
      g.append('g').call(d3.axisLeft(y));

      svg
        .append('text')
        .attr('x', W / 2)
        .attr('y', 22)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 600)
        .text(t('Responses to Individual Questionnaire Questions'));

      const palette = d3.scaleOrdinal(d3.schemeTableau10).domain(keys);
      const tt = getOrCreateTooltip();

      keys.forEach((key) => {
        // map date -> value for this question
        const map = new Map(
          (byQ.get(key) || []).map((d) => [d.date.slice(0, 10), toNum(d.answers?.[0]?.key)])
        );

        // series with nulls for missing days ➜ line breaks on gaps
        const series = xDomain.map((d) => {
          const iso = dayIso(d);
          const v = map.get(iso);
          return { x: d, y: Number.isFinite(v!) ? (v as number) : null, iso };
        });

        const line = d3
          .line<{ x: Date; y: number | null }>()
          .defined((d) => d.y != null)
          .x((d) => x(d.x))
          .y((d) => y(d.y as number));

        g.append('path')
          .datum(series)
          .attr('fill', 'none')
          .attr('stroke', palette(key)!)
          .attr('stroke-width', 2)
          .attr('d', line as any);

        // dots only where there is a value
        g.selectAll(`circle.dot-${key}`)
          .data(series.filter((s) => s.y != null))
          .enter()
          .append('circle')
          .attr('class', `dot dot-${key}`)
          .attr('cx', (d) => x(d.x))
          .attr('cy', (d) => y(d.y as number))
          .attr('r', 3.5)
          .attr('fill', palette(key)!)
          .on('mouseover', (ev, d) => {
            const any = (byQ.get(key) || [])[0];
            const label =
              any?.questionTranslations?.find((tr) => tr.language === i18n.language)?.text ??
              any?.questionTranslations?.find((tr) => tr.language === 'en')?.text ??
              key;
            tt.style('opacity', 1).html(`<strong>${label}</strong><br/>${d.iso} — ${d.y}`);
          })
          .on('mousemove', (ev: any) =>
            tt.style('left', ev.pageX + 10 + 'px').style('top', ev.pageY - 24 + 'px')
          )
          .on('mouseout', () => tt.style('opacity', 0));
      });

      renderLegend(
        svg as any,
        keys.map((k) => ({
          label:
            (byQ.get(k) || [])[0]?.questionTranslations?.find((tr) => tr.language === i18n.language)
              ?.text ??
            (byQ.get(k) || [])[0]?.questionTranslations?.find((tr) => tr.language === 'en')?.text ??
            k,
          color: palette(k)!,
          symbol: 'line' as const,
        }))
      );
    }, [data, visibleKeys, start, end, i18n.language, t]);

    return <svg ref={svgRef} style={{ width: '100%', height: 'auto', maxHeight: 500 }} />;
  }
);

export default QuestionnaireLines;
