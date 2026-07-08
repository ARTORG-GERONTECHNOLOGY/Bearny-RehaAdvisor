// src/utils/healthCharts.ts
import * as d3 from 'd3';

export const parseYMD = d3.timeParse('%Y-%m-%d');

// `start`/`end` are always constructed as local calendar dates (e.g. `new Date(y, m, d)`).
// Comparing them as UTC instants against a UTC-parsed `iso` shifts the range by a day in any
// non-UTC timezone, so we compare calendar-date strings instead.
const toLocalYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const isInRange = (iso: string, start?: Date | null, end?: Date | null) => {
  const day = iso.slice(0, 10);
  return (!start || day >= toLocalYMD(start)) && (!end || day <= toLocalYMD(end));
};

// Every calendar date (YYYY-MM-DD, local) from `start` to `end` inclusive
export const eachDateInRange = (start: Date, end: Date): string[] => {
  const dates: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cur.getTime() <= last.getTime()) {
    dates.push(toLocalYMD(cur));
    cur.setDate(cur.getDate() + 1);
  }

  return dates;
};

// ---------- threshold tiers (green/yellow/red goal coloring) ----------
export type ThresholdTier = 'green' | 'yellow' | 'red';

const TIER_SEVERITY: Record<ThresholdTier, number> = { green: 0, yellow: 1, red: 2 };

// Classifies a value against a green ("good") and yellow ("caution") threshold.
// `higherIsBetter` flips the comparison for metrics like blood pressure, where lower is healthier.
// Returns null when there's no value to classify (e.g. a day with no reading).
export const thresholdTier = (
  value: number | null | undefined,
  green: number | null | undefined,
  yellow: number | null | undefined,
  higherIsBetter: boolean
): ThresholdTier | null => {
  if (value == null) return null;
  if (green == null) return 'green';

  const reachedGreen = higherIsBetter ? value >= green : value <= green;
  if (reachedGreen) return 'green';

  const reachedYellow = yellow != null && (higherIsBetter ? value >= yellow : value <= yellow);
  return reachedYellow ? 'yellow' : 'red';
};

// Worst (most severe) of several tiers, ignoring nulls. Used when a single day is
// judged by more than one metric (e.g. blood pressure's systolic + diastolic readings).
export const worstTier = (...tiers: (ThresholdTier | null)[]): ThresholdTier | null =>
  tiers
    .filter((t): t is ThresholdTier => t != null)
    .reduce<ThresholdTier | null>(
      (worst, t) => (worst == null || TIER_SEVERITY[t] > TIER_SEVERITY[worst] ? t : worst),
      null
    );

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
