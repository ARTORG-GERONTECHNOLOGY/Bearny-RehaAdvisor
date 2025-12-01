/* eslint-disable */
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { forwardRef } from 'react';
import { FitbitEntry } from '../../../types/health';
import { isInRange } from '../../../utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start: Date;
  end: Date;
};

/**
 * Stacked bar chart:
 * - X-axis: day
 * - Y-axis: total exercise duration (minutes)
 * - Each day's bar is stacked by individual sessions (Option 2 + 3)
 */
const ExerciseSessionsChart = forwardRef<SVGSVGElement, Props>(
  ({ data, start, end }, ref) => {
    const localRef = useRef<SVGSVGElement | null>(null);

    useEffect(() => {
      const svgEl = (ref as React.RefObject<SVGSVGElement>)?.current || localRef.current;
      if (!svgEl) return;

      const svg = d3.select(svgEl);
      svg.selectAll('*').remove();

      const margin = { top: 30, right: 20, bottom: 60, left: 60 };
      const width = 800;
      const height = 300;
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      svg.attr('viewBox', `0 0 ${width} ${height}`);

      const g = svg
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

      // Filter data by date range and extract exercise sessions
      const filtered = data.filter((d) => isInRange(d.date, start, end));

      // Build a map: dateStr -> array of segments {name, durationMin}
      type Seg = { name: string; duration: number };
      const byDate = new Map<string, Seg[]>();

      filtered.forEach((d) => {
        const dateStr = d.date.slice(0, 10);
        const sessions = d.exercise?.sessions || [];
        sessions.forEach((s: any) => {
          const durMin = s.duration ? s.duration / 60000 : 0;
          if (durMin <= 0) return;
          if (!byDate.has(dateStr)) byDate.set(dateStr, []);
          byDate.get(dateStr)!.push({
            name: s.name || '',
            duration: durMin,
          });
        });
      });

      const dates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));

      if (!dates.length) {
        g.append('text')
          .attr('x', innerWidth / 2)
          .attr('y', innerHeight / 2)
          .attr('text-anchor', 'middle')
          .attr('fill', '#666')
          .text('No exercise sessions in selected range');
        return;
      }

      // X scale
      const x = d3
        .scaleBand<string>()
        .domain(dates)
        .range([0, innerWidth])
        .padding(0.2);

      // Y scale – total duration per day
      const maxTotal = d3.max(dates, (d) =>
        d3.sum(byDate.get(d) || [], (s) => s.duration)
      ) || 0;

      const y = d3
        .scaleLinear()
        .domain([0, maxTotal || 1])
        .nice()
        .range([innerHeight, 0]);

      // Color scale by session index
      const color = d3.scaleOrdinal<string, string>()
        .domain(d3.range(0, 10).map(String))
        .range(d3.schemeTableau10);

      // Axes
      const xAxis = d3.axisBottom<string>(x).tickFormat((d) => d);
      const yAxis = d3.axisLeft(y).ticks(5);

      g.append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(xAxis)
        .selectAll('text')
        .attr('transform', 'rotate(-40)')
        .style('text-anchor', 'end');

      g.append('g').call(yAxis);

      g.append('text')
        .attr('x', innerWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .attr('font-weight', 'bold')
        .text('Exercise Duration per Day (stacked sessions, minutes)');

      g.append('text')
        .attr('x', -innerHeight / 2)
        .attr('y', -45)
        .attr('transform', 'rotate(-90)')
        .attr('text-anchor', 'middle')
        .text('Minutes');

      // Draw stacked bars
      dates.forEach((dateStr) => {
        const segs = byDate.get(dateStr) || [];
        const x0 = x(dateStr);
        if (x0 == null) return;

        let cum = 0;
        segs.forEach((seg, idx) => {
          const h = innerHeight - y(seg.duration);
          const yTop = y(cum + seg.duration);

          g.append('rect')
            .attr('x', x0)
            .attr('y', yTop)
            .attr('width', x.bandwidth())
            .attr('height', h)
            .attr('fill', color(String(idx)))
            .append('title')
            .text(
              `${dateStr}
${seg.name || 'Exercise'}: ${seg.duration.toFixed(1)} min`
            );

          cum += seg.duration;
        });
      });
    }, [data, start, end, ref]);

    return <svg ref={ref || localRef} />;
  }
);

export default ExerciseSessionsChart;
