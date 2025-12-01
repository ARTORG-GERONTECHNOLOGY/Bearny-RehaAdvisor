/* eslint-disable */
import React, { useEffect } from 'react';
import * as d3 from 'd3';
import { isInRange } from '../../../utils/healthCharts';

const BloodPressureChart = React.forwardRef<SVGSVGElement, {
  data: any[];
  start: Date;
  end: Date;
}>(({ data, start, end }, ref) => {

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
      .filter(
        (d) =>
          (d.bp_sys != null || d.bp_dia != null) &&
          isInRange(d.date, start, end)
      )
      .map((d) => ({
        date: new Date(d.date),
        sys: d.bp_sys,
        dia: d.bp_dia,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (filtered.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#888')
        .text('No blood pressure data');
      return;
    }

    // ------- Scales -------
    const x = d3
      .scaleTime()
      .domain(d3.extent(filtered, (d) => d.date) as [Date, Date])
      .range([margin.left, width - margin.right]);

    const y = d3
      .scaleLinear()
      .domain([
        d3.min(filtered, (d) => Math.min(d.sys ?? Infinity, d.dia ?? Infinity))! - 5,
        d3.max(filtered, (d) => Math.max(d.sys ?? -Infinity, d.dia ?? -Infinity))! + 5,
      ])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // ------- Axes -------
    svg.append('g')
      .attr('transform', `translate(0, ${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(6));

    svg.append('g')
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(d3.axisLeft(y));

    // ------- Line generators -------
    const lineSys = d3
      .line<{ date: Date; sys: number | null }>()
      .defined((d) => d.sys != null)
      .x((d) => x(d.date))
      .y((d) => y(d.sys!))
      .curve(d3.curveMonotoneX);

    const lineDia = d3
      .line<{ date: Date; dia: number | null }>()
      .defined((d) => d.dia != null)
      .x((d) => x(d.date))
      .y((d) => y(d.dia!))
      .curve(d3.curveMonotoneX);

    // ------- Draw lines -------
    svg.append('path')
      .datum(filtered)
      .attr('fill', 'none')
      .attr('stroke', '#d9534f')
      .attr('stroke-width', 2)
      .attr('d', lineSys);

    svg.append('path')
      .datum(filtered)
      .attr('fill', 'none')
      .attr('stroke', '#0275d8')
      .attr('stroke-width', 2)
      .attr('d', lineDia);

    // ------- Points -------
    svg.selectAll('circle.sys')
      .data(filtered.filter((d) => d.sys != null))
      .enter()
      .append('circle')
      .attr('class', 'sys')
      .attr('cx', (d) => x(d.date))
      .attr('cy', (d) => y(d.sys!))
      .attr('r', 4)
      .attr('fill', '#d9534f');

    svg.selectAll('circle.dia')
      .data(filtered.filter((d) => d.dia != null))
      .enter()
      .append('circle')
      .attr('class', 'dia')
      .attr('cx', (d) => x(d.date))
      .attr('cy', (d) => y(d.dia!))
      .attr('r', 4)
      .attr('fill', '#0275d8');

    // ------- Legend -------
    const legend = svg.append('g').attr('transform', 'translate(60,10)');

    legend.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', 12)
      .attr('height', 12)
      .attr('fill', '#d9534f');

    legend.append('text')
      .attr('x', 20)
      .attr('y', 10)
      .attr('dy', '0.3em')
      .text('Systolic (SYS)');

    legend.append('rect')
      .attr('x', 150)
      .attr('y', 0)
      .attr('width', 12)
      .attr('height', 12)
      .attr('fill', '#0275d8');

    legend.append('text')
      .attr('x', 170)
      .attr('y', 10)
      .attr('dy', '0.3em')
      .text('Diastolic (DIA)');

  }, [data, start, end, ref]);

  return <svg ref={ref} />;
});

export default BloodPressureChart;
