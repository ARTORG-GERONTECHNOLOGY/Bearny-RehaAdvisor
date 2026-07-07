import React, { useEffect, useRef, forwardRef } from 'react';
import * as d3 from 'd3';
import { useTranslation } from 'react-i18next';
import type { AdherenceEntry } from '../../../types/health';

type Props = {
  data: AdherenceEntry[];
  start?: Date | null;
  end?: Date | null;
};

// Clamp helper (ensures adherence never exceeds 0..100)
const clampPct = (v: number) => Math.max(0, Math.min(100, v));

const AdherenceLine = forwardRef<SVGSVGElement, Props>(({ data, start, end }, ref) => {
  const { t } = useTranslation();
  const local = useRef<SVGSVGElement>(null);
  const svgRef = (ref as React.RefObject<SVGSVGElement>) || local;

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    // Clear
    svg.selectAll('*').remove();

    // Guard
    const raw = Array.isArray(data) ? data : [];
    if (!raw.length) return;

    // Filter by range
    const s = start || new Date(raw[0].date);
    const e = end || new Date(raw[raw.length - 1].date);

    const inRange = raw.filter((r) => {
      const d = new Date(r.date);
      return d >= s && d <= e;
    });

    if (!inRange.length) return;

    type Row = { d: Date; y: number | null };
    const rows: Row[] = inRange.map((r) => ({
      d: new Date(r.date),
      y: Number.isFinite(r.pct) ? clampPct(r.pct) : null,
    }));

    // Need a valid x-domain
    const xExtent = d3.extent(rows, (r) => r.d) as [Date | undefined, Date | undefined];
    if (!xExtent[0] || !xExtent[1]) return;

    // Dimensions / scales
    const W = 800,
      H = 300,
      M = { top: 30, right: 20, bottom: 40, left: 48 };
    svg.attr('viewBox', `0 0 ${W} ${H}`);

    const x = d3
      .scaleTime()
      .domain([xExtent[0], xExtent[1]])
      .range([M.left, W - M.right]);

    const y = d3
      .scaleLinear()
      .domain([0, 100])
      .range([H - M.bottom, M.top])
      // ✅ prevents drawing above/below the chart area
      .clamp(true);

    // Axes
    const xAxis = d3.axisBottom<Date>(x);
    const yAxis = d3
      .axisLeft(y)
      .ticks(5)
      .tickFormat((d) => `${d}%`);

    svg
      .append('g')
      .attr('transform', `translate(0,${H - M.bottom})`)
      .call(xAxis);

    svg.append('g').attr('transform', `translate(${M.left},0)`).call(yAxis);

    // Gridlines
    svg
      .append('g')
      .attr('stroke-opacity', 0.1)
      .selectAll('line.h')
      .data(y.ticks(5))
      .enter()
      .append('line')
      .attr('x1', M.left)
      .attr('x2', W - M.right)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d));

    // Line (skip nulls)
    const line = d3
      .line<Row>()
      .defined((r) => r.y != null)
      .x((r) => x(r.d))
      .y((r) => y(r.y as number));

    svg
      .append('path')
      .datum(rows)
      .attr('fill', 'none')
      .attr('stroke', '#69b3a2')
      .attr('stroke-width', 2)
      .attr('d', line as any);

    // Points
    svg
      .append('g')
      .selectAll('circle')
      .data(rows.filter((r) => r.y != null))
      .enter()
      .append('circle')
      .attr('cx', (r) => x(r.d))
      .attr('cy', (r) => y(r.y as number))
      .attr('r', 2.5)
      .attr('fill', '#69b3a2');

    // Title
    svg
      .append('text')
      .attr('x', W / 2)
      .attr('y', 18)
      .attr('text-anchor', 'middle')
      .attr('font-weight', 600)
      .text(t('Adherence (%)'));
  }, [data, start, end, t]);

  return <svg ref={svgRef} style={{ width: '100%', height: 'auto' }} />;
});

AdherenceLine.displayName = 'AdherenceLine';

export default AdherenceLine;
