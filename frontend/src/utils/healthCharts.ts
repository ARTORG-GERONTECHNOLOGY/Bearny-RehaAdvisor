// src/utils/healthCharts.ts
import * as d3 from 'd3';

export const parseYMD = d3.timeParse('%Y-%m-%d');

export const isInRange = (iso: string, start?: Date | null, end?: Date | null) => {
  const d = new Date(iso);
  return (!start || d >= start) && (!end || d <= end);
};

// ---------- svg & shared UI ----------
export const initSvg = (
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  w: number,
  h: number
) =>
  svg
    .attr('viewBox', `0 0 ${w} ${h}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .classed('w-100', true);

// One tooltip reused by all charts
export const getOrCreateTooltip = () => {
  let tt = d3.select<HTMLDivElement, unknown>('body').select('.chart-tooltip');
  if (tt.empty()) {
    tt = d3
      .select('body')
      .append('div')
      .attr('class', 'chart-tooltip bg-light border p-2 rounded shadow-sm position-absolute')
      .style('opacity', 0)
      .style('pointer-events', 'none')
      .style('z-index', '9999');
  }
  return tt;
};

// Simple legend (placed below title, right-aligned)
type LegendItem = { label: string; color: string; symbol?: 'rect' | 'line' | 'dot' | 'area' };
export function renderLegend(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  items: LegendItem[],
  y: number = 40,
  note?: string
) {
  if (!items.length) return;

  const g = svg.append('g').attr('class', 'chart-legend');
  let dx = 0;

  items.forEach((it) => {
    const item = g.append('g').attr('transform', `translate(${dx},${y})`);

    if (it.symbol === 'line') {
      item
        .append('line')
        .attr('x1', 0)
        .attr('x2', 18)
        .attr('y1', 8)
        .attr('y2', 8)
        .attr('stroke', it.color)
        .attr('stroke-width', 2);
    } else if (it.symbol === 'dot') {
      item.append('circle').attr('cx', 9).attr('cy', 8).attr('r', 4).attr('fill', it.color);
    } else {
      item.append('rect').attr('width', 18).attr('height', 12).attr('fill', it.color);
    }

    const text = item.append('text').attr('x', 24).attr('y', 11).text(it.label);
    const w = 24 + (text.node()?.getBBox().width || 60);
    dx += w + 14;
  });

  if (note) {
    const noteText = svg
      .append('text')
      .attr('x', 60)
      .attr('y', y + 26)
      .style('font-size', '11px')
      .style('opacity', 0.8)
      .text(note);
    // keep note from affecting legend alignment
    noteText.attr('text-anchor', 'start');
  }

  const vb = (svg.node() as SVGSVGElement).viewBox.baseVal;
  if (vb?.width) {
    const bbox = (g.node() as SVGGElement).getBBox();
    const pad = 10;
    g.attr('transform', `translate(${vb.width - bbox.width - pad},0)`);
  }
}

// Export → data URL (for PDF export)
export const svgToImageDataUrl = (el: SVGSVGElement): Promise<string> =>
  new Promise((resolve) => {
    const vb = el.viewBox.baseVal;
    const w = vb?.width || 800;
    const h = vb?.height || 300;

    const clone = el.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));

    const s = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([s], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = url;
  });

// ---------- band-axis helper ----------
export function smartBandAxisBottom(
  x: d3.ScaleBand<string>,
  opts: { maxTicks?: number; rotate?: number; format?: (d: string) => string } = {}
) {
  const { maxTicks = 12, rotate = -35, format = (d: string) => d } = opts;

  return (g: d3.Selection<SVGGElement, unknown, null, undefined>) => {
    const domain = x.domain();
    let ticks = domain;

    if (domain.length > maxTicks) {
      const step = Math.ceil(domain.length / maxTicks);
      ticks = domain.filter((_, i) => i % step === 0);
    }

    const axis = d3
      .axisBottom(x)
      .tickValues(ticks)
      .tickFormat((d: string) => format(d));

    g.call(axis);

    if (rotate !== 0) {
      g.selectAll<SVGTextElement, string>('text')
        .attr('text-anchor', rotate < 0 ? 'end' : 'start')
        .attr('transform', `rotate(${rotate})`)
        .attr('dx', rotate < 0 ? '-0.4em' : '0.4em')
        .attr('dy', '0.6em');
    }
  };
}

// ---------- compact charts ----------
/** Daily bars */
export function drawBarTimeseries(
  svgRef: React.RefObject<SVGSVGElement>,
  rows: { x: string; y: number }[],
  title: string
) {
  if (!svgRef.current || !document.body.contains(svgRef.current)) return;
  const svg = d3.select(svgRef.current);
  svg.selectAll('*').remove();

  const w = 720,
    h = 260,
    m = { top: 28, right: 24, bottom: 64, left: 52 };
  initSvg(svg, w, h);

  const width = w - m.left - m.right;
  const height = h - m.top - m.bottom;
  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

  if (!rows.length) {
    g.append('text')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .text('—');
  } else {
    const x = d3
      .scaleBand<string>()
      .domain(rows.map((d) => d.x))
      .range([0, width])
      .padding(0.2);

    const y = d3
      .scaleLinear()
      .domain([0, (d3.max(rows, (d) => d.y) || 0) * 1.1])
      .nice()
      .range([height, 0]);

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(smartBandAxisBottom(x, { maxTicks: 10, rotate: -35, format: (d) => d.slice(5) }));

    g.append('g').call(d3.axisLeft(y).ticks(5));

    const tt = getOrCreateTooltip();

    g.selectAll('rect')
      .data(rows)
      .enter()
      .append('rect')
      .attr('x', (d) => x(d.x)!)
      .attr('y', (d) => y(d.y))
      .attr('width', x.bandwidth())
      .attr('height', (d) => height - y(d.y))
      .attr('fill', '#69b3a2')
      .on('mouseover', (ev, d) => {
        tt.style('opacity', 1).html(`<strong>${d.x}</strong><br/>${d.y}`);
      })
      .on('mousemove', (ev) =>
        tt.style('left', ev.pageX + 10 + 'px').style('top', ev.pageY - 24 + 'px')
      )
      .on('mouseout', () => tt.style('opacity', 0));
  }

  svg
    .append('text')
    .attr('x', w / 2)
    .attr('y', 22)
    .attr('text-anchor', 'middle')
    .style('font-size', '14px')
    .style('font-weight', 600)
    .text(title);
}
