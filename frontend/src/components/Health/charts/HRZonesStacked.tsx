// src/components/Health/charts/HRZonesStacked.tsx
import React, { useEffect, useRef, forwardRef } from 'react';
import * as d3 from 'd3';
import { useTranslation } from 'react-i18next';
import { FitbitEntry } from '../../../types/health';
import {
  isInRange,
  renderLegend,
  getOrCreateTooltip,
} from '../../../utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start?: Date | null;
  end?: Date | null;
};

const formatHM = (min?: number) => {
  if (!min || min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const HRZonesStacked = (
  { data, start, end }: Props,
  ref: React.Ref<SVGSVGElement>
) => {
  const { t } = useTranslation();
  const local = useRef<SVGSVGElement>(null);
  const svgRef = (ref as React.RefObject<SVGSVGElement>) ?? local;

  useEffect(() => {
    if (!svgRef.current || !document.body.contains(svgRef.current)) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const W = 900;
    const H = 360;
    const m = { top: 90, right: 220, bottom: 60, left: 60 };

    svg
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .classed('w-100', true);

    const width = W - m.left - m.right;
    const height = H - m.top - m.bottom;

    const keys = ['Out of Range', 'Fat Burn', 'Cardio', 'Peak'] as const;

    const colors = d3
      .scaleOrdinal<string>()
      .domain(keys as unknown as string[])
      .range(d3.schemeCategory10);

    // ─────────────────────────────────────────────────────────────
    // Extract bpm ranges once
    // ─────────────────────────────────────────────────────────────
    const zoneRanges: Record<string, string> = {};
    data.forEach(d =>
      (d.heart_rate_zones || []).forEach((z: any) => {
        if (!zoneRanges[z.name] && z.min != null && z.max != null) {
          zoneRanges[z.name] = `${z.min}–${z.max} bpm`;
        }
      })
    );

    // ─────────────────────────────────────────────────────────────
    // Title
    // ─────────────────────────────────────────────────────────────
    svg
      .append('text')
      .attr('x', W / 2)
      .attr('y', 26)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .style('font-weight', 600)
      .text(t('Heart Rate Zones per Day'));

    // ─────────────────────────────────────────────────────────────
    // Legend on the right with bpm ranges
    // ─────────────────────────────────────────────────────────────
    renderLegend(
      svg as any,
      keys.map(k => ({
        label: `${t(k)} (${zoneRanges[k] ?? '—'})`,
        color: colors(k)!,
      })),
      46,
      width + m.left + 20 // move legend right
    );

    // ─────────────────────────────────────────────────────────────
    // Prepare data
    // ─────────────────────────────────────────────────────────────
    const filtered = data
      .filter(d => isInRange(d.date, start, end))
      .filter(d => (d.heart_rate_zones || []).length > 0)
      .map(d => {
        const zoneMap = Object.fromEntries(
          (d.heart_rate_zones || []).map(z => [z.name, z.minutes])
        );
        const base: Record<string, number | string> = { date: d.date };
        keys.forEach(k => (base[k] = (zoneMap[k] as number) || 0));
        return base;
      });

    const x = d3
      .scaleBand()
      .domain(filtered.map(d => d.date as string))
      .range([0, width])
      .padding(0.2);

    const y = d3
      .scaleLinear()
      .domain([
        0,
        d3.max(filtered, (d: any) =>
          keys.reduce((s, k) => s + (d[k] as number), 0)
        ) || 0,
      ])
      .nice()
      .range([height, 0]);

    const stackGen = d3.stack<any>().keys(keys as unknown as string[]);
    const series = stackGen(filtered);

    const g = svg
      .append('g')
      .attr('transform', `translate(${m.left},${m.top})`);

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(
        d3.axisBottom(x).tickFormat((d: any) => (d as string).slice(5)) as any
      )
      .selectAll('text')
      .attr('transform', 'rotate(-35)')
      .style('text-anchor', 'end');

    g.append('g').call(d3.axisLeft(y).ticks(5));

    const tt = getOrCreateTooltip();

    // ─────────────────────────────────────────────────────────────
    // Draw stacked bars
    // ─────────────────────────────────────────────────────────────
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
      .attr('width', x.bandwidth());

    // ─────────────────────────────────────────────────────────────
    // ONE hover target per day → shows ALL zones
    // ─────────────────────────────────────────────────────────────
    g.selectAll('rect.hover-target')
      .data(filtered)
      .enter()
      .append('rect')
      .attr('class', 'hover-target')
      .attr('x', d => x(d.date as string)!)
      .attr('y', 0)
      .attr('width', x.bandwidth())
      .attr('height', height)
      .attr('fill', 'transparent')
      .on('mouseover', (ev, d: any) => {
        const rows = keys
          .map(k => {
            const min = d[k] as number;
            if (!min) return null;
            return `
              <div>
                <span style="color:${colors(k)}">■</span>
                ${t(k)} (${zoneRanges[k] ?? '—'}): ${formatHM(min)}
              </div>`;
          })
          .filter(Boolean)
          .join('');

        tt
          .style('opacity', 1)
          .html(
            `<strong>${d.date}</strong><hr style="margin:4px 0"/>${rows}`
          );
      })
      .on('mousemove', ev =>
        tt.style('left', ev.pageX + 10 + 'px').style('top', ev.pageY - 24 + 'px')
      )
      .on('mouseout', () => tt.style('opacity', 0));
  }, [data, start, end, t]);

  return <svg ref={svgRef as any} style={{ width: '100%', height: 'auto' }} />;
};

export default forwardRef(HRZonesStacked) as React.ForwardRefExoticComponent<
  React.PropsWithoutRef<Props> & React.RefAttributes<SVGSVGElement>
>;
