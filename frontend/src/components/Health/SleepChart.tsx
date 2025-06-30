import * as d3 from 'd3';
import React, { useEffect, useRef } from 'react';

interface SleepEntry {
  date: string;
  start: string;
  end: string;
  duration: number;
}

interface Props {
  data: SleepEntry[];
}

const SleepChart: React.FC<Props> = ({ data }) => {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!data.length) return;

    const margin = { top: 30, right: 60, bottom: 40, left: 60 };
    const width = 960 - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // clear

    const chart = svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const parseTime = d3.timeParse('%Y-%m-%dT%H:%M:%S.%L');

    const dayParser = d3.timeParse('%Y-%m-%d');
    const startTime = d3.timeParse('%H:%M')('18:00')!;
    const endTime = d3.timeParse('%H:%M')('12:00')!;
    const baseDate = new Date(2000, 0, 1); // arbitrary fixed date for time-only axis

    // Convert times
    const processed = data.map((d) => {
      const start = new Date(d.start);
      const end = new Date(d.end);
      if (end < start) end.setDate(end.getDate() + 1);
      return {
        date: dayParser(d.date),
        start: new Date(baseDate.getTime() + (start.getHours() * 60 + start.getMinutes()) * 60000),
        end: new Date(baseDate.getTime() + (end.getHours() * 60 + end.getMinutes()) * 60000),
        duration: d.duration,
      };
    });

    const x = d3
      .scaleTime()
      .domain(d3.extent(processed, (d) => d.date) as [Date, Date])
      .range([0, width]);

    const y = d3
      .scaleTime()
      .domain([new Date(baseDate.setHours(18)), new Date(baseDate.setHours(36))]) // 6PM to 12PM next day
      .range([0, height]);

    const y2 = d3
      .scaleLinear()
      .domain([0, d3.max(processed, (d) => d.duration)! + 1])
      .range([height, 0]);

    // X-axis
    chart
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(7).tickFormat(d3.timeFormat('%b %d')));

    // Left Y-axis (time)
    chart.append('g').call(d3.axisLeft(y).tickFormat(d3.timeFormat('%I:%M %p')));

    // Right Y-axis (duration)
    chart.append('g').attr('transform', `translate(${width},0)`).call(d3.axisRight(y2).ticks(5));

    // Sleep bars
    chart
      .selectAll('.sleep-bar')
      .data(processed)
      .enter()
      .append('line')
      .attr('x1', (d) => x(d.date!))
      .attr('x2', (d) => x(d.date!))
      .attr('y1', (d) => y(d.start))
      .attr('y2', (d) => y(d.end))
      .attr('stroke', 'purple')
      .attr('stroke-width', 4)
      .attr('opacity', 0.8);

    // Duration line
    const line = d3
      .line<any>()
      .x((d) => x(d.date))
      .y((d) => y2(d.duration))
      .curve(d3.curveMonotoneX);

    chart
      .append('path')
      .datum(processed)
      .attr('fill', 'none')
      .attr('stroke', 'orange')
      .attr('stroke-width', 2)
      .attr('d', line);

    // Dots
    chart
      .selectAll('.dot')
      .data(processed)
      .enter()
      .append('circle')
      .attr('cx', (d) => x(d.date!))
      .attr('cy', (d) => y2(d.duration))
      .attr('r', 4)
      .attr('fill', 'orange');
  }, [data]);

  return <svg ref={svgRef} />;
};

export default SleepChart;
