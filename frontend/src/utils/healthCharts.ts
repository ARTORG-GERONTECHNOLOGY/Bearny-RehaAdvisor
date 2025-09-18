// utils/healthCharts.ts
import * as d3 from 'd3';

export const parseYMD = d3.timeParse('%Y-%m-%d');
export const fmtYMD  = d3.timeFormat('%Y-%m-%d');
export const fmtYM   = d3.timeFormat('%Y-%m');
export const fmtNice = d3.timeFormat('%b %d');

export type ChartRes = 'daily' | 'weekly' | 'monthly';
type RangeLineOptions = {
  legend?: {
    personalRange?: string;
    inRange?: string;
    outOfRange?: string;
    note?: string;
  };
  colors?: {
    band?: string;     // band/rect color
    inDot?: string;    // in-range dot/line color
    outDot?: string;   // out-of-range dot color
    line?: string;     // line color
  };
};

export function aggregateToPeriods<T>(
  data: T[],
  getDate: (d: T) => string,
  getVal: (d: T) => number | null | undefined,
  res: 'weekly' | 'monthly',
  start: Date,
  end: Date
) {
  // Build a complete period domain (so empty periods still show on the axis)
  const domain: string[] = [];
  if (res === 'weekly') {
    const s = d3.utcWeek.floor(start);
    const e = d3.utcWeek.ceil(end);
    for (let d = new Date(s); d < e; d = d3.utcWeek.offset(d, 1)) domain.push(fmtYMD(d));
  } else {
    const s = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const e = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1));
    for (let d = new Date(s); d < e; d = d3.utcMonth.offset(d, 1)) domain.push(fmtYM(d));
  }

  const acc = new Map<string, number[]>();
  for (const p of domain) acc.set(p, []);
  for (const d of data) {
    const v = getVal(d);
    if (v == null) continue;
    const key = periodKey(getDate(d), res);
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key)!.push(v);
  }

  const rows = domain.map((key) => {
    const arr = acc.get(key) || [];
    const mean = arr.length ? d3.mean(arr)! : null;
    return { key, mean };
  });

  return { domain, rows };
}

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
    const dt  = new Date(iso);
    const v   = getVal(d);
    if (v == null) continue;
    if (dt >= start && dt <= end) values.push(v);
  }

  const lo = d3.quantile(values, opts.lowerPct / 100) ?? null;
  const hi = d3.quantile(values, opts.upperPct / 100) ?? null;
  const mean = values.length ? d3.mean(values)! : null;
  return { lo, hi, mean };
}

export function drawRangeLineSeries(
  svgRef: React.RefObject<SVGSVGElement>,
  rows: { key: string; mean: number | null }[],
  res: 'weekly' | 'monthly',
  title: string,
  band: { lo: number | null; hi: number | null; mean: number | null },
  opts: RangeLineOptions = {}
) {
  if (!svgRef.current || !document.body.contains(svgRef.current)) return;

  const legendLabels = {
    personalRange: opts.legend?.personalRange ?? 'Personal range',
    inRange:       opts.legend?.inRange ?? 'In range',
    outOfRange:    opts.legend?.outOfRange ?? 'Out of range',
    note:          opts.legend?.note ?? 'In range = value within the personal band (P3–P97 over the last 30 days).',
  };

  const colors = {
    band:  opts.colors?.band ?? '#1f77b4',
    inDot: opts.colors?.inDot ?? '#2b83ba',
    outDot:opts.colors?.outDot ?? '#d88997',
    line:  opts.colors?.line ?? '#2b83ba',
  };

  const svg = d3.select(svgRef.current);
  svg.selectAll('*').remove();

  const w = 900, h = 300;
  const m = { top: 86, right: 24, bottom: 60, left: 60 };
  initSvg(svg, w, h);

  svg.append('text')
    .attr('x', w / 2).attr('y', 24).attr('text-anchor', 'middle')
    .style('font-size', '16px').style('font-weight', 600).text(title);

  renderLegend(
    svg,
    [
      { label: legendLabels.personalRange, color: colors.band,  symbol: 'area' },
      { label: legendLabels.inRange,       color: colors.inDot, symbol: 'dot' },
      { label: legendLabels.outOfRange,    color: colors.outDot, symbol: 'dot' },
    ],
    40,
    legendLabels.note
  );

  const width  = w - m.left - m.right;
  const height = h - m.top - m.bottom;
  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

  const x = d3.scaleBand().domain(rows.map((r) => r.key)).range([0, width]).padding(0.4);

  const vals = rows.map((r) => r.mean).filter((v): v is number => v != null);
  const yMin = Math.min(band.lo ?? d3.min(vals) ?? 0, ...vals);
  const yMax = Math.max(band.hi ?? d3.max(vals) ?? 1, ...vals);
  const y = d3.scaleLinear().domain([yMin * 0.98, yMax * 1.02]).nice().range([height, 0]);

  // axes
  const xAxis = d3.axisBottom(x).tickFormat((k: any) => (res === 'weekly' ? fmtNice(parseYMD(k)!) : k)) as any;
  g.append('g').attr('transform', `translate(0,${height})`).call(xAxis)
   .selectAll('text').attr('transform', 'rotate(-35)').style('text-anchor', 'end');
  g.append('g').call(d3.axisLeft(y).ticks(6));

  // personal band (full width)
  if (band.lo != null && band.hi != null) {
    g.append('rect')
      .attr('x', 0)
      .attr('y', y(band.hi))
      .attr('width', width)
      .attr('height', Math.max(0, y(band.lo) - y(band.hi)))
      .attr('fill', colors.band)
      .attr('opacity', 0.12)
      .attr('stroke', colors.band)
      .attr('stroke-width', 0.5);
  }

  const tt = getOrCreateTooltip();

  // dots + connecting line
  const pts = rows
    .map((r) => ({ x: r.key, y: r.mean }))
    .filter((p): p is { x: string; y: number } => p.y != null);

  const line = d3.line<{ x: string; y: number }>()
    .x((d) => x(d.x)! + x.bandwidth() / 2)
    .y((d) => y(d.y));

  g.append('path')
    .datum(pts)
    .attr('fill', 'none')
    .attr('stroke', colors.line)
    .attr('stroke-width', 2)
    .attr('d', line as any);

  g.selectAll('circle.dot')
    .data(pts).enter().append('circle')
    .attr('cx', (d) => x(d.x)! + x.bandwidth() / 2)
    .attr('cy', (d) => y(d.y))
    .attr('r', 4)
    .attr('fill', (d) =>
      band.lo != null && band.hi != null && d.y >= band.lo && d.y <= band.hi
        ? colors.inDot
        : colors.outDot
    )
    .on('mouseover', (ev, d) =>
      tt.style('opacity', 1).html(`<strong>${d.x}</strong><br/>${Math.round(d.y * 100) / 100}`)
    )
    .on('mousemove', (ev) =>
      tt.style('left', ev.pageX + 10 + 'px').style('top', ev.pageY - 24 + 'px')
    )
    .on('mouseout', () => tt.style('opacity', 0));
}

export const isInRange = (iso: string, start?: Date | null, end?: Date | null) => {
  const d = new Date(iso);
  return (!start || d >= start) && (!end || d <= end);
};

const periodKey = (iso: string, res: 'weekly' | 'monthly') => {
  const d = parseYMD(iso)!;
  if (res === 'weekly') {
    const wk = d3.utcWeek.floor(d);  // week start
    return fmtYMD(wk);
  }
  return fmtYM(d);
};

// ---------- stats & grouping ----------
export const boxStats = (vals: number[]) => {
  const v = vals.slice().sort((a, b) => a - b);
  const q = (p: number) => d3.quantile(v, p)!;
  return {
    n: v.length,
    min: v[0],
    q1: q(0.25),
    med: q(0.5),
    q3: q(0.75),
    max: v[v.length - 1],
    mean: d3.mean(v)!,
  };
};

export function groupToBoxes<T>(
  data: T[],
  getDate: (d: T) => string,
  getVal: (d: T) => number | undefined,
  res: 'weekly' | 'monthly',
  start?: Date | null,
  end?: Date | null
) {
  const buckets = new Map<string, number[]>();
  for (const d of data) {
    const iso = getDate(d);
    if (!isInRange(iso, start, end)) continue;
    const v = getVal(d);
    if (v == null) continue;
    const key = periodKey(iso, res);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(v);
  }
  return Array.from(buckets.entries())
    .map(([key, arr]) => ({ key, stats: boxStats(arr) }))
    .sort((a, b) => a.key.localeCompare(b.key));
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
type LegendItem = { label: string; color: string; symbol?: 'rect' | 'line' | 'dot' };
export function renderLegend(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  items: LegendItem[],
  y: number = 40
) {
  if (!items.length) return;
  const g = svg.append('g').attr('class', 'chart-legend');
  let dx = 0;

  items.forEach((it) => {
    const item = g.append('g').attr('transform', `translate(${dx},${y})`);
    // swatch
    if (it.symbol === 'line') {
      item.append('line').attr('x1', 0).attr('x2', 18).attr('y1', 8).attr('y2', 8).attr('stroke', it.color).attr('stroke-width', 2);
    } else if (it.symbol === 'dot') {
      item.append('circle').attr('cx', 9).attr('cy', 8).attr('r', 4).attr('fill', it.color);
    } else {
      item.append('rect').attr('width', 18).attr('height', 12).attr('fill', it.color);
    }
    const text = item.append('text').attr('x', 24).attr('y', 11).text(it.label);
    const w = 24 + (text.node()?.getBBox().width || 60);
    dx += w + 14;
  });

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

// ---------- band-axis helper (the missing export) ----------
/**
 * A smarter bottom axis for scaleBand:
 * - Reduces the number of ticks to <= maxTicks
 * - Applies rotation & anchor so labels don’t overlap
 * - Optional formatter (e.g. d => d.slice(5))
 *
 * Usage:
 *   g.append('g')
 *    .attr('transform', `translate(0,${height})`)
 *    .call(smartBandAxisBottom(xBand, { maxTicks: 10, rotate: -35, format: d => d.slice(5) }));
 */
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

    const axis = d3.axisBottom(x).tickValues(ticks).tickFormat((d: any) => format(String(d)) as any);
    (g as any).call(axis);

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

  const w = 720, h = 260, m = { top: 28, right: 24, bottom: 64, left: 52 };
  initSvg(svg, w, h);

  const width = w - m.left - m.right;
  const height = h - m.top - m.bottom;
  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

  if (!rows.length) {
    g.append('text').attr('x', width / 2).attr('y', height / 2).attr('text-anchor', 'middle').text('—');
  } else {
    const x = d3.scaleBand().domain(rows.map((d) => d.x)).range([0, width]).padding(0.2);
    const y = d3.scaleLinear().domain([0, (d3.max(rows, (d) => d.y) || 0) * 1.1]).nice().range([height, 0]);

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(smartBandAxisBottom(x, { maxTicks: 10, rotate: -35, format: (d) => d.slice(5) }) as any);

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
      .on('mousemove', (ev) => tt.style('left', ev.pageX + 10 + 'px').style('top', ev.pageY - 24 + 'px'))
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

/** Weekly/Monthly box plots */
export function drawBoxTimeseries(
  svgRef: React.RefObject<SVGSVGElement>,
  rows: { key: string; stats: ReturnType<typeof boxStats> }[],
  res: 'weekly' | 'monthly',
  title: string
) {
  if (!svgRef.current || !document.body.contains(svgRef.current)) return;
  const svg = d3.select(svgRef.current);
  svg.selectAll('*').remove();

  const w = 720, h = 260, m = { top: 28, right: 24, bottom: 64, left: 52 };
  initSvg(svg, w, h);

  const innerW = w - m.left - m.right;
  const innerH = h - m.top - m.bottom;
  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

  if (!rows.length) {
    g.append('text').attr('x', innerW / 2).attr('y', innerH / 2).attr('text-anchor', 'middle').text('—');
  } else {
    const yMax = d3.max(rows, (r) => r.stats.max)!;
    const y = d3.scaleLinear().domain([0, yMax * 1.1]).nice().range([innerH, 0]);
    const x = d3.scaleBand().domain(rows.map((r) => r.key)).range([0, innerW]).padding(0.3);

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(
        smartBandAxisBottom(x, {
          maxTicks: 10,
          rotate: -35,
          format: (k) => (res === 'weekly' ? fmtNice(parseYMD(k)!) : k),
        }) as any
      );

    g.append('g').call(d3.axisLeft(y).ticks(5));

    const boxW = Math.max(8, x.bandwidth() * 0.5);
    const tt = getOrCreateTooltip();

    const groups = g
      .selectAll('.box')
      .data(rows)
      .enter()
      .append('g')
      .attr('transform', (d) => `translate(${x(d.key)! + x.bandwidth() / 2 - boxW / 2},0)`);

    // whiskers
    groups.append('line').attr('x1', boxW / 2).attr('x2', boxW / 2).attr('y1', (d) => y(d.stats.max)).attr('y2', (d) => y(d.stats.q3)).attr('stroke', '#1f77b4');
    groups.append('line').attr('x1', boxW / 2).attr('x2', boxW / 2).attr('y1', (d) => y(d.stats.min)).attr('y2', (d) => y(d.stats.q1)).attr('stroke', '#1f77b4');
    groups.append('line').attr('x1', 0).attr('x2', boxW).attr('y1', (d) => y(d.stats.max)).attr('y2', (d) => y(d.stats.max)).attr('stroke', '#1f77b4');
    groups.append('line').attr('x1', 0).attr('x2', boxW).attr('y1', (d) => y(d.stats.min)).attr('y2', (d) => y(d.stats.min)).attr('stroke', '#1f77b4');

    // box (IQR)
    groups
      .append('rect')
      .attr('x', 0)
      .attr('width', boxW)
      .attr('y', (d) => y(d.stats.q3))
      .attr('height', (d) => Math.max(1, y(d.stats.q1) - y(d.stats.q3)))
      .attr('fill', '#e6eefb')
      .attr('stroke', '#1f77b4')
      .on('mousemove', (ev, d) => {
        tt
          .style('opacity', 1)
          .html(
            `<div><strong>${d.key}</strong></div>
             <div>min: ${d.stats.min.toFixed(2)}</div>
             <div>Q1: ${d.stats.q1.toFixed(2)}</div>
             <div>median: ${d.stats.med.toFixed(2)}</div>
             <div>Q3: ${d.stats.q3.toFixed(2)}</div>
             <div>max: ${d.stats.max.toFixed(2)}</div>
             <div>mean: ${d.stats.mean.toFixed(2)}</div>`
          )
          .style('left', ev.pageX + 10 + 'px')
          .style('top', ev.pageY - 24 + 'px');
      })
      .on('mouseout', () => tt.style('opacity', 0));

    // median line
    groups
      .append('line')
      .attr('x1', 0)
      .attr('x2', boxW)
      .attr('y1', (d) => y(d.stats.med))
      .attr('y2', (d) => y(d.stats.med))
      .attr('stroke', '#1f77b4')
      .attr('stroke-width', 2);

    // mean dot
    groups
      .append('circle')
      .attr('cx', boxW / 2)
      .attr('cy', (d) => y(d.stats.mean))
      .attr('r', 2.5)
      .attr('fill', '#d62728')
      .on('mouseover', (ev, d) => {
        tt.style('opacity', 1).html(`<strong>${d.key}</strong><br/>mean: ${d.stats.mean.toFixed(2)}`);
      })
      .on('mousemove', (ev) => tt.style('left', ev.pageX + 10 + 'px').style('top', ev.pageY - 24 + 'px'))
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
