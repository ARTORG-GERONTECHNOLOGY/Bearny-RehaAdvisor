import React, { useEffect, useRef, forwardRef } from 'react';
import * as d3 from 'd3';
import { useTranslation } from 'react-i18next';
import { ChartRes } from '../../../types/health';
import type { AdherenceEntry } from '../../../types/health';

type Props = {
  data: AdherenceEntry[];
  res: ChartRes; // 'daily' | 'weekly' | 'monthly'
  start?: Date | null;
  end?: Date | null;
};

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0..6, Sun..Sat
  const diff = x.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  return new Date(x.getFullYear(), x.getMonth(), diff);
}

function ymKey(d: Date) {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

// Clamp helper (ensures adherence never exceeds 0..100)
const clampPct = (v: number) => Math.max(0, Math.min(100, v));

const AdherenceLine = forwardRef<SVGSVGElement, Props>(({ data, res, start, end }, ref) => {
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

    // Aggregate by resolution
    type Row = { d: Date; y: number | null };
    let rows: Row[] = [];

    if (res === 'daily') {
      rows = inRange.map((r) => ({
        d: new Date(r.date),
        // ✅ clamp daily pct too
        y: Number.isFinite(r.pct) ? clampPct(r.pct) : null,
      }));
    } else if (res === 'weekly') {
      const map = new Map<string, { sched: number; comp: number; d: Date }>();

      inRange.forEach((r) => {
        const d = startOfWeek(new Date(r.date));
        const key = d.toISOString().slice(0, 10);
        if (!map.has(key)) map.set(key, { sched: 0, comp: 0, d });

        const v = map.get(key)!;
        v.sched += Number(r.scheduled || 0);
        v.comp += Number(r.completed || 0);
      });

      rows = Array.from(map.values())
        .sort((a, b) => a.d.getTime() - b.d.getTime())
        .map((v) => {
          if (v.sched <= 0) return { d: v.d, y: null };
          const pct = (100 * v.comp) / v.sched;
          // ✅ clamp computed pct
          return { d: v.d, y: clampPct(Math.round(pct)) };
        });
    } else {
      // monthly
      const map = new Map<string, { sched: number; comp: number; d: Date }>();

      inRange.forEach((r) => {
        const d = new Date(r.date);
        const key = ymKey(d);
        if (!map.has(key)) {
          map.set(key, { sched: 0, comp: 0, d: new Date(d.getFullYear(), d.getMonth(), 1) });
        }
        const v = map.get(key)!;
        v.sched += Number(r.scheduled || 0);
        v.comp += Number(r.completed || 0);
      });

      rows = Array.from(map.values())
        .sort((a, b) => a.d.getTime() - b.d.getTime())
        .map((v) => {
          if (v.sched <= 0) return { d: v.d, y: null };
          const pct = (100 * v.comp) / v.sched;
          // ✅ clamp computed pct
          return { d: v.d, y: clampPct(Math.round(pct)) };
        });
    }

    // Need a valid x-domain
    const xExtent = d3.extent(rows, (r) => r.d) as [Date | undefined, Date | undefined];
    if (!xExtent[0] || !xExtent[1]) return;

    // Dimensions / scales
    const W = 800,
      H = 300,
      M = { top: 30, right: 20, bottom: 40, left: 48 };
    svg.attr('viewBox', `0 0 ${W} ${H}`);

    const x = d3.scaleTime().domain([xExtent[0], xExtent[1]]).range([M.left, W - M.right]);

    const y = d3
      .scaleLinear()
      .domain([0, 100])
      .range([H - M.bottom, M.top])
      // ✅ prevents drawing above/below the chart area
      .clamp(true);

    // Axes
    const xAxis = d3.axisBottom<Date>(x);
    const yAxis = d3.axisLeft(y).ticks(5).tickFormat((d) => `${d}%`);

    svg.append('g').attr('transform', `translate(0,${H - M.bottom})`).call(xAxis);

    svg.append('g').attr('transform', `translate(${M.left},0)`).call(yAxis);

    // Gridlines
    svg.append('g')
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

    svg.append('path')
      .datum(rows)
      .attr('fill', 'none')
      .attr('stroke', '#69b3a2')
      .attr('stroke-width', 2)
      .attr('d', line as any);

    // Points
    svg.append('g')
      .selectAll('circle')
      .data(rows.filter((r) => r.y != null))
      .enter()
      .append('circle')
      .attr('cx', (r) => x(r.d))
      .attr('cy', (r) => y(r.y as number))
      .attr('r', 2.5)
      .attr('fill', '#69b3a2');

    // Title
    svg.append('text')
      .attr('x', W / 2)
      .attr('y', 18)
      .attr('text-anchor', 'middle')
      .attr('font-weight', 600)
      .text(t('Adherence (%)'));
  }, [data, res, start, end, t]);

  return <svg ref={svgRef} style={{ width: '100%', height: 'auto' }} />;
});

export default AdherenceLine;
