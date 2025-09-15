// src/components/Health/charts/HRZonesStacked.tsx
import React, { useEffect, useRef, forwardRef } from 'react';
import * as d3 from 'd3';
import { useTranslation } from 'react-i18next';
import { FitbitEntry } from '../../../types/health';
import { isInRange, renderLegend, getOrCreateTooltip } from '../../../utils/healthCharts';

type Props = { data: FitbitEntry[]; start?: Date | null; end?: Date | null };

const HRZonesStacked = (
  { data, start, end }: Props,
  ref: React.Ref<SVGSVGElement>
) => {
  const { t } = useTranslation();
  const local = useRef<SVGSVGElement>(null);
  const svgRef = (ref as React.RefObject<SVGSVGElement>) ?? local;

  useEffect(() => {
    if (!svgRef || !('current' in svgRef) || !svgRef.current || !document.body.contains(svgRef.current)) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const W = 900, H = 320, m = { top: 86, right: 30, bottom: 60, left: 60 };
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid meet').classed('w-100', true);
    const width = W - m.left - m.right;
    const height = H - m.top - m.bottom;

    const keys = ['Out of Range', 'Fat Burn', 'Cardio', 'Peak'] as const;
    const colors = d3.scaleOrdinal<string>().domain(keys as unknown as string[]).range(d3.schemeCategory10);

    // title
    svg.append('text')
      .attr('x', W / 2).attr('y', 24).attr('text-anchor', 'middle')
      .style('font-size', '16px').style('font-weight', 600)
      .text(t('Heart Rate Zones per Day'));

    // legend under the title
    renderLegend(
      svg as any,
      keys.map(k => ({ label: t(k), color: colors(k)! })),
      40
    );

    const filtered = data
      .filter(d => isInRange(d.date, start, end))
      .filter(d => (d.heart_rate_zones || []).length > 0)
      .map(d => {
        const zoneMap = Object.fromEntries((d.heart_rate_zones || []).map(z => [z.name, z.minutes]));
        const base: Record<string, number | string> = { date: d.date };
        keys.forEach(k => (base[k] = (zoneMap[k] as number) || 0));
        return base;
      });

    const x = d3.scaleBand().domain(filtered.map(d => d.date as string)).range([0, width]).padding(0.2);
    const y = d3.scaleLinear()
      .domain([
        0,
        d3.max(filtered, (d: any) =>
          (keys as unknown as string[]).reduce((s, k) => s + (d[k] as number), 0)
        ) || 0
      ])
      .nice()
      .range([height, 0]);

    const stackGen = d3.stack<any>().keys(keys as unknown as string[]);
    const series = stackGen(filtered);

    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat((d: any) => (d as string).slice(5)) as any)
      .selectAll('text')
      .attr('transform', 'rotate(-35)')
      .style('text-anchor', 'end');

    g.append('g').call(d3.axisLeft(y));

    const tt = getOrCreateTooltip();

    g.selectAll('g.layer')
      .data(series)
      .enter()
      .append('g')
      .attr('fill', d => colors(d.key)!)
      .selectAll('rect')
      .data(d => d.map(p => ({ ...p, key: d.key })))
      .enter()
      .append('rect')
      .attr('x', (d: any) => x(d.data.date as string)!)
      .attr('y', d => y(d[1]))
      .attr('height', d => y(d[0]) - y(d[1]))
      .attr('width', x.bandwidth())
      .on('mouseover', (ev, d: any) => {
        const minutes = Math.round((d.data[d.key] as number) ?? 0);
        tt.style('opacity', 1).html(`<strong>${d.key}</strong><br/>${d.data.date}: ${minutes} min`);
      })
      .on('mousemove', ev => tt.style('left', ev.pageX + 10 + 'px').style('top', ev.pageY - 24 + 'px'))
      .on('mouseout', () => tt.style('opacity', 0));
  }, [data, start, end, t]);

  return <svg ref={svgRef as any} style={{ width: '100%', height: 'auto' }} />;
};

// Cast instead of generics on forwardRef to avoid the Babel parsing issue
export default forwardRef(HRZonesStacked) as React.ForwardRefExoticComponent<
  React.PropsWithoutRef<Props> & React.RefAttributes<SVGSVGElement>
>;
