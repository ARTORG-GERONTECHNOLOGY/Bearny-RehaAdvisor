// src/utils/healthCharts.ts
import * as d3 from 'd3';
import { colors } from '@/lib/colors';

export const parseYMD = d3.timeParse('%Y-%m-%d');

export const isInRange = (iso: string, start?: Date | null, end?: Date | null) => {
  const d = new Date(iso);
  return (!start || d >= start) && (!end || d <= end);
};

// Every calendar date (YYYY-MM-DD, UTC) from `start` to `end` inclusive
export const eachDateInRange = (start: Date, end: Date): string[] => {
  const dates: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

  while (cur.getTime() <= last.getTime()) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return dates;
};

// Personal range band: P{lowerPct}–P{upperPct} over the trailing `windowDays`
// ending at `end`. Used to flag individual points as "in range" / "out of range".
export function personalRangeFromWindow<T>(
  data: T[],
  getDate: (d: T) => string,
  getVal: (d: T) => number | null | undefined,
  opts: { windowDays: number; lowerPct: number; upperPct: number; end: Date }
) {
  const end = opts.end;
  const start = d3.utcDay.offset(end, -opts.windowDays + 1);
  const values: number[] = [];
  for (const d of data) {
    const iso = getDate(d);
    const dt = new Date(iso);
    const v = getVal(d);
    if (v == null) continue;
    if (dt >= start && dt <= end) values.push(v);
  }

  const lo = d3.quantile(values, opts.lowerPct / 100) ?? null;
  const hi = d3.quantile(values, opts.upperPct / 100) ?? null;
  const mean = values.length ? d3.mean(values)! : null;
  return { lo, hi, mean };
}

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
type BarBand = { lo: number | null; hi: number | null };

const IN_RANGE_COLOR = colors.brand;
const OUT_OF_RANGE_COLOR = colors.nok;
const DEFAULT_BAR_COLOR = colors.chartMuted;
const GOAL_LINE_COLOR = colors.yellow;

/** Daily bars, optionally colored by a personal-range band (in range / out of range)
 *  and/or annotated with a fixed goal reference line. */
export function drawBarTimeseries(
  svgRef: React.RefObject<SVGSVGElement>,
  rows: { x: string; y: number }[],
  title: string,
  opts: {
    band?: BarBand;
    legend?: { inRange?: string; outOfRange?: string };
    goal?: number | null;
    goalLabel?: string;
  } = {}
) {
  if (!svgRef.current || !document.body.contains(svgRef.current)) return;
  const svg = d3.select(svgRef.current);
  svg.selectAll('*').remove();

  const band = opts.band;
  const hasBand = band != null && band.lo != null && band.hi != null;
  const goal = opts.goal;
  const hasGoal = goal != null;

  const w = 720,
    h = 260,
    m = { top: hasBand || hasGoal ? 46 : 28, right: 24, bottom: 64, left: 52 };
  initSvg(svg, w, h);

  if (hasBand || hasGoal) {
    const legendItems: LegendItem[] = [];
    if (hasBand) {
      legendItems.push(
        { label: opts.legend?.inRange ?? 'In range', color: IN_RANGE_COLOR, symbol: 'dot' },
        {
          label: opts.legend?.outOfRange ?? 'Out of range',
          color: OUT_OF_RANGE_COLOR,
          symbol: 'dot',
        }
      );
    }
    if (hasGoal) {
      legendItems.push({ label: opts.goalLabel ?? 'Goal', color: GOAL_LINE_COLOR, symbol: 'line' });
    }
    renderLegend(svg, legendItems, 36);
  }

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

    const yMax = Math.max(
      d3.max(rows, (d) => d.y) || 0,
      hasBand ? band!.hi! : 0,
      hasGoal ? goal! : 0
    );
    const y = d3
      .scaleLinear()
      .domain([0, yMax * 1.1])
      .nice()
      .range([height, 0]);

    if (hasBand) {
      g.append('rect')
        .attr('class', 'personal-range-band')
        .attr('x', 0)
        .attr('y', y(band!.hi!))
        .attr('width', width)
        .attr('height', Math.max(0, y(band!.lo!) - y(band!.hi!)))
        .attr('fill', IN_RANGE_COLOR)
        .attr('opacity', 0.12);
    }

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(smartBandAxisBottom(x, { maxTicks: 10, rotate: -35, format: (d) => d.slice(5) }));

    g.append('g').call(d3.axisLeft(y).ticks(5));

    if (hasGoal) {
      g.append('line')
        .attr('class', 'goal-line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', y(goal!))
        .attr('y2', y(goal!))
        .attr('stroke', GOAL_LINE_COLOR)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6,3');
    }

    const tt = getOrCreateTooltip();

    g.selectAll('rect.bar')
      .data(rows)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(d.x)!)
      .attr('y', (d) => y(d.y))
      .attr('width', x.bandwidth())
      .attr('height', (d) => height - y(d.y))
      .attr('fill', (d) =>
        hasBand
          ? d.y >= band!.lo! && d.y <= band!.hi!
            ? IN_RANGE_COLOR
            : OUT_OF_RANGE_COLOR
          : DEFAULT_BAR_COLOR
      )
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
