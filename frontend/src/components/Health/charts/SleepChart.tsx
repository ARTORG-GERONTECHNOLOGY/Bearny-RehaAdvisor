// components/.../SleepChart.tsx
import React, { useEffect, useRef, forwardRef } from 'react';
import * as d3 from 'd3';
import { useTranslation } from 'react-i18next';
import { FitbitEntry } from '../../../types/health';
import { isInRange, smartBandAxisBottom, parseYMD, getOrCreateTooltip, renderLegend } from '../../../utils/healthCharts';

type Props = { data: FitbitEntry[]; start?: Date | null; end?: Date | null };

const SleepChart = forwardRef<SVGSVGElement, Props>(({ data, start, end }, ref) => {
  const { t } = useTranslation();
  const local = useRef<SVGSVGElement>(null);
  const svgRef = (ref as React.RefObject<SVGSVGElement>) || local;

  useEffect(() => {
    if (!svgRef.current || !document.body.contains(svgRef.current)) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const W = 900, H = 380, m = { top: 36, right: 60, bottom: 70, left: 60 };
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid meet').classed('w-100', true);

    const width = W - m.left - m.right;
    const height = H - m.top - m.bottom;
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

    const parseDT = d3.utcParse('%Y-%m-%dT%H:%M:%S.%L');
    const filtered = data.filter((d) => isInRange(d.date, start, end));

    const x = d3.scaleBand().domain(filtered.map((d) => d.date)).range([0, width]).padding(0.2);
    const yTime = d3.scaleTime()
      .domain([new Date('2000-01-01T18:00:00'), new Date('2000-01-02T12:00:00')])
      .range([0, height]);
    const yDur = d3.scaleLinear()
      .domain([0, d3.max(filtered, (d) => d.sleep?.sleep_duration ? d.sleep.sleep_duration / 3600000 : 0) || 8])
      .nice()
      .range([height, 0]);

    // smart x-axis
    smartBandAxisBottom(g.append('g').attr('transform', `translate(0,${height})`), x, width, (iso) => {
      const d = parseYMD(String(iso));
      return d ? d3.timeFormat('%b %d')(d) : String(iso);
    });
    g.append('g').call(d3.axisLeft(yTime).tickFormat(d3.timeFormat('%I:%M %p') as any));
    g.append('g').attr('transform', `translate(${width},0)`).call(d3.axisRight(yDur));

    const tt = getOrCreateTooltip();

    // sleep bars
    g.selectAll('rect.sleep')
      .data(filtered)
      .enter()
      .append('rect')
      .attr('x', (d) => x(d.date)!)
      .attr('y', (d) => {
        const s = d.sleep?.sleep_start ? parseDT(d.sleep.sleep_start) : null;
        return s ? yTime(new Date('2000-01-01T' + s.toISOString().slice(11, 19))) : 0;
      })
      .attr('height', (d) => {
        const s = d.sleep?.sleep_start ? parseDT(d.sleep.sleep_start) : null;
        const e = d.sleep?.sleep_end ? parseDT(d.sleep.sleep_end) : null;
        if (!s || !e) return 0;
        const fs = new Date('2000-01-01T' + s.toISOString().slice(11, 19));
        const fe = new Date('2000-01-01T' + e.toISOString().slice(11, 19));
        if (fe < fs) fe.setDate(fe.getDate() + 1);
        return yTime(fe) - yTime(fs);
      })
      .attr('width', x.bandwidth())
      .attr('fill', '#9370DB')
      .attr('opacity', 0.7)
      .on('mouseover', (ev, d) => {
        tt.style('opacity', 1).html(
          `${d.date}<br/>${d.sleep?.sleep_start?.slice(11,16)}–${d.sleep?.sleep_end?.slice(11,16)}`
        );
      })
      .on('mousemove', (ev: any) => tt.style('left', ev.pageX + 10 + 'px').style('top', ev.pageY - 24 + 'px'))
      .on('mouseout', () => tt.style('opacity', 0));

    // duration line
    const dd = filtered.filter((d) => d.sleep?.sleep_duration);
    const line = d3.line<FitbitEntry>()
      .x((d) => x(d.date)! + x.bandwidth() / 2)
      .y((d) => yDur(d.sleep!.sleep_duration! / 3600000));

    g.append('path').datum(dd).attr('fill', 'none').attr('stroke', '#ff7f0e').attr('stroke-width', 2).attr('d', line as any);
    g.selectAll('circle.d').data(dd).enter().append('circle')
      .attr('cx', (d) => x(d.date)! + x.bandwidth() / 2)
      .attr('cy', (d) => yDur(d.sleep!.sleep_duration! / 3600000))
      .attr('r', 4).attr('fill', '#ff7f0e');

    svg.append('text').attr('x', W/2).attr('y', 24).attr('text-anchor', 'middle')
      .style('font-size', '14px').style('font-weight', 600).text(t('Sleep Schedule and Duration'));

    renderLegend(svg as any, [
      { label: t('Sleep window'), color: '#9370DB', symbol: 'rect' },
      { label: t('Duration (h)'), color: '#ff7f0e', symbol: 'line' },
    ]);
  }, [data, start, end, t]);

  return <svg ref={svgRef} style={{ width: '100%', height: 'auto' }} />;
});

export default SleepChart;
