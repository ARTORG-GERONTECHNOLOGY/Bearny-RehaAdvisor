/* eslint-disable */
import React, { useEffect } from 'react';
import * as d3 from 'd3';
import { isInRange } from '../../../utils/healthCharts';

const WeightChart = React.forwardRef<
  SVGSVGElement,
  {
    data: any[];
    start: Date;
    end: Date;
  }
>(({ data, start, end }, ref) => {
  useEffect(() => {
    if (!ref || !(ref as any).current) return;

    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    const width = 800;
    const height = 300;
    const margin = { top: 20, right: 30, bottom: 40, left: 60 };

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    // ------- Filter data -------
    const filtered = data
      .filter((d) => d.weight_kg != null && isInRange(d.date, start, end))
      .map((d) => ({
        date: new Date(d.date),
        weight: d.weight_kg,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (filtered.length === 0) {
      svg
        .append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#888')
        .text('No weight data');
      return;
    }

    // ------- Scales -------
    const x = d3
      .scaleTime()
      .domain(d3.extent(filtered, (d) => d.date) as [Date, Date])
      .range([margin.left, width - margin.right]);

    const y = d3
      .scaleLinear()
      .domain([d3.min(filtered, (d) => d.weight)! - 1, d3.max(filtered, (d) => d.weight)! + 1])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // ------- Axis -------
    svg
      .append('g')
      .attr('transform', `translate(0, ${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(6));

    svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y));

    // ------- Line -------
    const line = d3
      .line<{ date: Date; weight: number }>()
      .x((d) => x(d.date))
      .y((d) => y(d.weight))
      .curve(d3.curveMonotoneX);

    svg
      .append('path')
      .datum(filtered)
      .attr('fill', 'none')
      .attr('stroke', '#007bff')
      .attr('stroke-width', 2)
      .attr('d', line);

    // ------- Points -------
    svg
      .selectAll('circle')
      .data(filtered)
      .enter()
      .append('circle')
      .attr('cx', (d) => x(d.date))
      .attr('cy', (d) => y(d.weight))
      .attr('r', 4)
      .attr('fill', '#007bff');
  }, [data, start, end, ref]);

  return <svg ref={ref} />;
});

export default WeightChart;
