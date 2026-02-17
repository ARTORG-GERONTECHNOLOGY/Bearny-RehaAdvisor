/* eslint-disable */
import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import {
  Card,
  Col,
  Row,
  Spinner,
  OverlayTrigger,
  Tooltip,
  Button,
  Form,
  Alert,
  Modal,
  Badge,
} from 'react-bootstrap';
import authStore from '../../stores/authStore';
import { useTranslation } from 'react-i18next';
import { isSameDay, format, subDays } from 'date-fns';

import { patientFitbitStore, mergeThresholds } from '../../stores/patientFitbitStore';

import '../../assets/styles/ActivitySummary.css';

type DailyRow = any;
type MetricKey = 'steps' | 'active' | 'sleep' | 'bp';

/* ---------- Color helpers ---------- */
const colorForSteps = (v: number, thr: any) =>
  v >= thr.steps_goal ? 'text-success' : v >= thr.steps_goal * 0.6 ? 'text-warning' : 'text-danger';

const colorForActive = (v: number, thr: any) =>
  v >= thr.active_minutes_green
    ? 'text-success'
    : v >= thr.active_minutes_yellow
      ? 'text-warning'
      : 'text-danger';

const colorForSleep = (minutes: number, thr: any) =>
  minutes >= thr.sleep_green_min
    ? 'text-success'
    : minutes >= thr.sleep_yellow_min
      ? 'text-warning'
      : 'text-danger';

const colorForBP = (sys: number | null | undefined, dia: number | null | undefined, thr: any) => {
  if (sys == null && dia == null) return 'text-muted';
  const s = sys ?? 0;
  const d = dia ?? 0;
  const green = s <= thr.bp_sys_green_max && d <= thr.bp_dia_green_max;
  const yellow = !green && s <= thr.bp_sys_yellow_max && d <= thr.bp_dia_yellow_max;
  if (green) return 'text-success';
  if (yellow) return 'text-warning';
  return 'text-danger';
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const safeNum = (v: any): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const median = (vals: number[]) => {
  if (!vals.length) return null;
  const a = [...vals].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

function toDate(d: any): Date {
  try {
    return new Date(d);
  } catch {
    return new Date();
  }
}
function sortDailyAsc(daily: DailyRow[]) {
  return [...(daily || [])].sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());
}
function sliceUpToDate(sortedAsc: DailyRow[], focusDate: Date) {
  const focusTime = focusDate.getTime();
  return sortedAsc.filter((r) => toDate(r.date).getTime() <= focusTime);
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/* ---------- StatCard ---------- */
const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: string;
  tooltip?: string;
  valueClassName?: string;
  onOpenChart?: () => void;
  chartButtonLabel?: string;
}> = ({ label, value, sub, tooltip, valueClassName, onOpenChart, chartButtonLabel }) => (
  <Card className="shadow-sm h-100 activity-stat-card">
    <Card.Body>
      <div className="d-flex justify-content-between align-items-start gap-2">
        <div className="text-muted activity-stat-label">{label}</div>

        <div className="d-flex align-items-center gap-2">
          {tooltip && (
            <OverlayTrigger overlay={<Tooltip>{tooltip}</Tooltip>} placement="left">
              <span className="text-muted activity-info-icon" role="img" aria-label="info">
                ⓘ
              </span>
            </OverlayTrigger>
          )}

          {!!onOpenChart && (
            <Button
              variant="outline-secondary"
              size="sm"
              className="activity-view-chart-btn"
              onClick={onOpenChart}
            >
              {chartButtonLabel || 'View chart'}
            </Button>
          )}
        </div>
      </div>

      <div className={`display-6 fw-semibold mt-1 ${valueClassName || ''} activity-stat-value`}>
        {value}
      </div>

      {sub && <div className="small text-muted mt-1 activity-stat-sub">{sub}</div>}
    </Card.Body>
  </Card>
);

/* ---------- TrendModal (reusable) ---------- */
type TooltipState = null | {
  x: number;
  y: number;
  dateLabel: string;
  valueLabel: string;
  goalMetText?: string;
  pctText?: string;
  extra?: string;
};

const TrendModal: React.FC<{
  show: boolean;
  onHide: () => void;
  metric: MetricKey;
  daily: DailyRow[];
  thresholds: any;
  selectedDate: Date;
  lastSync?: string | null;
}> = ({ show, onHide, metric, daily, thresholds: thr, selectedDate, lastSync }) => {
  const { i18n, t } = useTranslation();
  const nf = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  const [rangeDays, setRangeDays] = useState<7 | 14 | 30>(7);
  const [tip, setTip] = useState<TooltipState>(null);

  const focusDate = selectedDate || new Date();
  const today = new Date();

  const sorted = useMemo(() => sortDailyAsc(daily), [daily]);
  const upto = useMemo(() => sliceUpToDate(sorted, focusDate), [sorted, focusDate]);

  const currentRangeRows = useMemo(() => {
    if (!upto.length) return [];
    return upto.slice(Math.max(0, upto.length - rangeDays));
  }, [upto, rangeDays]);

  const prevRangeRows = useMemo(() => {
    if (!upto.length) return [];
    const startIdx = Math.max(0, upto.length - rangeDays);
    const prevStart = Math.max(0, startIdx - rangeDays);
    return upto.slice(prevStart, startIdx);
  }, [upto, rangeDays]);

  const metricMeta = useMemo(() => {
    if (metric === 'steps') {
      const goal = safeNum(thr.steps_goal) ?? 0;
      const warn = goal * 0.6;
      return {
        title: t('Steps'),
        unit: '',
        getValue: (r: DailyRow) => safeNum(r.steps),
        greenTarget: goal,
        percentBase: goal,
        format: (v: number) => nf.format(Math.round(v)),
        meetsGreen: (v: number) => v >= goal,
        thresholds: [
          { label: t('Goal'), value: goal, kind: 'goal' as const },
          { label: t('Warning'), value: warn, kind: 'warn' as const },
        ],
        whatMeans: t(
          'This chart shows your daily steps. Reaching your goal consistently supports physical activity targets.'
        ),
      };
    }

    if (metric === 'active') {
      const g = safeNum(thr.active_minutes_green) ?? 0;
      const y = safeNum(thr.active_minutes_yellow) ?? 0;
      return {
        title: t('Active Minutes'),
        unit: t('min'),
        getValue: (r: DailyRow) => safeNum(r.active_minutes),
        greenTarget: g,
        percentBase: g,
        format: (v: number) => `${Math.round(v)} ${t('min')}`,
        meetsGreen: (v: number) => v >= g,
        thresholds: [
          { label: t('Green'), value: g, kind: 'green' as const },
          { label: t('Yellow'), value: y, kind: 'yellow' as const },
        ],
        whatMeans: t(
          'This chart shows minutes of activity per day. Higher values generally indicate more movement.'
        ),
      };
    }

    if (metric === 'sleep') {
      const g = safeNum(thr.sleep_green_min) ?? 0;
      const y = safeNum(thr.sleep_yellow_min) ?? 0;
      return {
        title: t('Sleep'),
        unit: '',
        getValue: (r: DailyRow) => safeNum(r.sleep_minutes),
        greenTarget: g,
        percentBase: g,
        format: (minutes: number) => {
          const h = Math.floor((minutes || 0) / 60);
          const mm = Math.abs((minutes || 0) % 60);
          return t('{{hours}}h {{minutes}}m', { hours: h, minutes: mm });
        },
        meetsGreen: (v: number) => v >= g,
        thresholds: [
          { label: t('Green'), value: g, kind: 'green' as const },
          { label: t('Yellow'), value: y, kind: 'yellow' as const },
        ],
        whatMeans: t(
          'This chart shows your sleep duration per day. Meeting the green threshold suggests adequate sleep time.'
        ),
      };
    }

    // BP: SYS and DIA
    const sysG = safeNum(thr.bp_sys_green_max) ?? 0;
    const sysY = safeNum(thr.bp_sys_yellow_max) ?? 0;
    const diaG = safeNum(thr.bp_dia_green_max) ?? 0;
    const diaY = safeNum(thr.bp_dia_yellow_max) ?? 0;

    return {
      title: t('Blood Pressure'),
      unit: 'mmHg',
      getValue: (r: DailyRow) => safeNum(r.bp_sys),
      getExtra: (r: DailyRow) => safeNum(r.bp_dia),
      percentBase: null as any,
      formatBP: (sys: number | null, dia: number | null) =>
        sys == null && dia == null ? '—' : `${sys ?? '—'}/${dia ?? '—'}`,
      meetsGreenBP: (sys: number | null, dia: number | null) => {
        if (sys == null && dia == null) return false;
        const s = sys ?? 0;
        const d = dia ?? 0;
        return s <= sysG && d <= diaG;
      },
      thresholdsSys: [
        { label: t('Green max SYS'), value: sysG, kind: 'green' as const },
        { label: t('Yellow max SYS'), value: sysY, kind: 'yellow' as const },
      ],
      thresholdsDia: [
        { label: t('Green max DIA'), value: diaG, kind: 'green' as const },
        { label: t('Yellow max DIA'), value: diaY, kind: 'yellow' as const },
      ],
      whatMeans: t(
        'This chart shows systolic and diastolic blood pressure. Lower values are generally better, within your target ranges.'
      ),
    };
  }, [metric, thr, nf, t, i18n.language]);

  const series = useMemo(() => {
    if (!currentRangeRows.length) return [];
    return currentRangeRows.map((r) => {
      const dt = toDate(r.date);

      if (metric === 'bp') {
        const sys = (metricMeta as any).getValue(r) as number | null;
        const dia = (metricMeta as any).getExtra(r) as number | null;
        // Try to detect manual vitals from a few common flags (safe if missing)
        const manual =
          r?.bp_source === 'manual' ||
          r?.vitals_source === 'manual' ||
          r?.bp_manual === true ||
          r?.manual_bp === true ||
          r?.bpOrigin === 'manual' ||
          r?.bp_origin === 'manual';

        return {
          date: dt,
          dateLabel: dt.toLocaleDateString(i18n.language),
          value: sys,
          extra: dia,
          manualBP: !!manual,
          raw: r,
        };
      }

      const v = (metricMeta as any).getValue(r) as number | null;
      return {
        date: dt,
        dateLabel: dt.toLocaleDateString(i18n.language),
        value: v,
        extra: null,
        manualBP: false,
        raw: r,
      };
    });
  }, [currentRangeRows, metric, metricMeta, i18n.language]);

  // Missingness (Fitbit data missing in range)
  const missingness = useMemo(() => {
    // define “missing” as no metric value for that day
    const missing = series.filter((p) => p.value == null).length;
    return { missing, total: series.length };
  }, [series]);

  const hasManualBP = useMemo(() => {
    if (metric !== 'bp') return false;
    return series.some((p) => p.manualBP);
  }, [series, metric]);

  // Insights
  const insights = useMemo(() => {
    const values = series
      .map((p) => (p.value == null ? null : Number(p.value)))
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const med = values.length ? median(values) : null;

    let best: any = null;
    let worst: any = null;
    for (const p of series) {
      if (p.value == null) continue;
      const v = Number(p.value);
      if (!Number.isFinite(v)) continue;
      if (!best || v > best.value) best = { ...p, value: v };
      if (!worst || v < worst.value) worst = { ...p, value: v };
    }

    // trend vs previous period (compare avg of primary values)
    const prevVals = prevRangeRows
      .map((r) => {
        if (metric === 'bp') return (metricMeta as any).getValue(r) as number | null;
        return (metricMeta as any).getValue(r) as number | null;
      })
      .map((v) => (v == null ? null : Number(v)))
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    const prevAvg = prevVals.length ? prevVals.reduce((a, b) => a + b, 0) / prevVals.length : null;

    let trend: { dir: 'up' | 'down' | 'flat'; pct: number | null } = { dir: 'flat', pct: null };
    if (avg != null && prevAvg != null && prevAvg !== 0) {
      const pct = ((avg - prevAvg) / prevAvg) * 100;
      const abs = Math.abs(pct);
      const dir = abs < 2 ? 'flat' : pct > 0 ? 'up' : 'down';
      trend = { dir, pct };
    }

    // streak meeting goal/green
    let streak = 0;
    for (let i = series.length - 1; i >= 0; i--) {
      const p = series[i];
      if (metric === 'bp') {
        const ok = (metricMeta as any).meetsGreenBP(
          p.value as number | null,
          p.extra as number | null
        );
        if (!ok) break;
        streak++;
      } else {
        const ok = (metricMeta as any).meetsGreen(p.value as number);
        if (!ok) break;
        streak++;
      }
    }

    return { avg, med, best, worst, trend, streak };
  }, [series, prevRangeRows, metric, metricMeta]);

  const markerIndexToday = useMemo(() => {
    const idx = series.findIndex((p) => sameDay(p.date, today));
    return idx >= 0 ? idx : null;
  }, [series, today]);

  const markerIndexSelected = useMemo(() => {
    const idx = series.findIndex((p) => sameDay(p.date, focusDate));
    return idx >= 0 ? idx : null;
  }, [series, focusDate]);

  // Chart scaling + drawing
  const chart = useMemo(() => {
    const w = 1100;
    const h = 340;
    const padL = 60;
    const padR = 120; // space for threshold labels
    const padT = 16;
    const padB = 54;

    const xs = series.map((_, i) => i);

    const yValsPrimary = series
      .map((p) => (p.value == null ? null : Number(p.value)))
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    const yValsSecondary =
      metric === 'bp'
        ? series
            .map((p) => (p.extra == null ? null : Number(p.extra)))
            .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        : [];

    // include thresholds in range
    const thPrimary =
      metric === 'bp'
        ? (metricMeta as any).thresholdsSys || []
        : (metricMeta as any).thresholds || [];
    const thSecondary = metric === 'bp' ? (metricMeta as any).thresholdsDia || [] : [];

    const thVals = [
      ...thPrimary.map((x: any) => x.value),
      ...thSecondary.map((x: any) => x.value),
    ].filter((v) => Number.isFinite(v));

    let minY = Math.min(
      ...(yValsPrimary.length ? yValsPrimary : [0]),
      ...(yValsSecondary.length ? yValsSecondary : [0]),
      ...(thVals.length ? thVals : [0])
    );
    let maxY = Math.max(
      ...(yValsPrimary.length ? yValsPrimary : [1]),
      ...(yValsSecondary.length ? yValsSecondary : [1]),
      ...(thVals.length ? thVals : [1])
    );

    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    }

    const span = maxY - minY;
    minY = minY - span * 0.08;
    maxY = maxY + span * 0.1;

    const xScale = (i: number) => {
      if (xs.length <= 1) return padL;
      const t = i / (xs.length - 1);
      return padL + t * (w - padL - padR);
    };
    const yScale = (v: number) => {
      const t = (v - minY) / (maxY - minY);
      return padT + (1 - t) * (h - padT - padB);
    };

    // grid lines
    const gridCount = 4;
    const grid = Array.from({ length: gridCount + 1 }).map((_, idx) => {
      const t = idx / gridCount;
      const v = minY + (1 - t) * (maxY - minY);
      const y = yScale(v);
      return { y, v };
    });

    // x labels
    const xLabelIdx =
      xs.length <= 1
        ? [0]
        : [0, Math.floor((xs.length - 1) / 2), xs.length - 1].filter(
            (v, i, arr) => arr.indexOf(v) === i
          );

    const buildPath = (getY: (p: any) => number | null) => {
      const pts = series
        .map((p, i) => {
          const v = getY(p);
          if (v == null) return null;
          const n = Number(v);
          if (!Number.isFinite(n)) return null;
          return { x: xScale(i), y: yScale(n) };
        })
        .filter(Boolean) as { x: number; y: number }[];

      if (pts.length < 2) return '';
      return (
        `M ${pts[0].x} ${pts[0].y} ` +
        pts
          .slice(1)
          .map((p) => `L ${p.x} ${p.y}`)
          .join(' ')
      );
    };

    const pathPrimary = buildPath((p) => p.value);
    const pathSecondary = metric === 'bp' ? buildPath((p) => p.extra) : '';

    return {
      w,
      h,
      padL,
      padR,
      padT,
      padB,
      xScale,
      yScale,
      grid,
      xLabelIdx,
      thPrimary,
      thSecondary,
      pathPrimary,
      pathSecondary,
    };
  }, [series, metric, metricMeta]);

  const closeAndResetTooltip = () => {
    setTip(null);
    onHide();
  };

  const title = (metricMeta as any).title;
  const whatMeans = (metricMeta as any).whatMeans;

  const trendBadge = useMemo(() => {
    if (insights.trend.pct == null) return null;
    const pct = insights.trend.pct;
    const dir = insights.trend.dir;

    const cls =
      dir === 'up' ? 'trend-badge-up' : dir === 'down' ? 'trend-badge-down' : 'trend-badge-flat';
    const label = dir === 'up' ? t('Up') : dir === 'down' ? t('Down') : t('Stable');

    return (
      <span className={`trend-badge ${cls}`}>
        {label} ({pct > 0 ? '+' : ''}
        {pct.toFixed(1)}%)
      </span>
    );
  }, [insights.trend, t]);

  const computeGoalInfo = (p: any) => {
    if (metric === 'bp') {
      const met = (metricMeta as any).meetsGreenBP(
        p.value as number | null,
        p.extra as number | null
      );
      return { met, pctText: undefined };
    }

    const v = p.value == null ? 0 : Number(p.value);
    const base = (metricMeta as any).percentBase as number;
    const met = (metricMeta as any).meetsGreen(v);

    if (!base || base <= 0) return { met, pctText: undefined };
    const pct = Math.round((v / base) * 100);
    return { met, pctText: `${pct}%` };
  };

  const formatValueLabel = (p: any) => {
    if (metric === 'bp') {
      return (metricMeta as any).formatBP(p.value as number | null, p.extra as number | null);
    }
    const v = p.value == null ? 0 : Number(p.value);
    return (metricMeta as any).format(v);
  };

  const onPointHover = (evt: React.MouseEvent, i: number) => {
    const container = (evt.currentTarget as HTMLElement).closest(
      '.trend-modal-chart'
    ) as HTMLElement | null;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const p = series[i];
    if (!p) return;

    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

    const { met, pctText } = computeGoalInfo(p);

    setTip({
      x,
      y,
      dateLabel: p.dateLabel,
      valueLabel: formatValueLabel(p),
      goalMetText: met ? t('Goal met: Yes') : t('Goal met: No'),
      pctText: pctText ? t('Percent of goal: {{pct}}', { pct: pctText }) : undefined,
      extra: metric === 'bp' ? `SYS/DIA (${(metricMeta as any).unit})` : undefined,
    });
  };

  const onPointLeave = () => setTip(null);

  return (
    <Modal
      show={show}
      onHide={closeAndResetTooltip}
      centered
      dialogClassName="trend-modal-dialog"
      contentClassName="trend-modal-content"
      backdropClassName="trend-modal-backdrop"
    >
      <Modal.Header closeButton className="trend-modal-header">
        <div className="d-flex flex-column gap-1 w-100">
          <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <Modal.Title className="trend-modal-title">{title}</Modal.Title>
              {trendBadge}
              {metric === 'bp' && hasManualBP && (
                <Badge bg="secondary" className="trend-badge-inline">
                  {t('BP manually entered')}
                </Badge>
              )}
            </div>

            <div className="trend-modal-last-sync">
              {lastSync ? (
                <span className="text-muted">
                  {t('lastSync', { date: new Date(lastSync).toLocaleString(i18n.language) })}
                </span>
              ) : (
                <span className="text-muted">{t('notConnected')}</span>
              )}
            </div>
          </div>

          <div className="trend-modal-subtitle d-flex align-items-center gap-2 flex-wrap">
            <span>
              {t('Range')}: {rangeDays} {t('days')}
            </span>
            <span className="mx-1">•</span>
            <span>
              {t('Up to')}: {focusDate.toLocaleDateString(i18n.language)}
            </span>
            <span className="mx-1">•</span>
            <span className="text-muted">
              {t('Data missing')}: {missingness.missing}/{missingness.total}
            </span>
          </div>
        </div>
      </Modal.Header>

      <Modal.Body className="trend-modal-body">
        {/* Controls */}
        <div className="trend-modal-controls">
          <div className="btn-group" role="group" aria-label="range">
            {[7, 14, 30].map((d) => (
              <Button
                key={d}
                variant={rangeDays === d ? 'primary' : 'outline-primary'}
                size="sm"
                onClick={() => setRangeDays(d as 7 | 14 | 30)}
              >
                {d} {t('days')}
              </Button>
            ))}
          </div>

          <div className="trend-meaning">
            <OverlayTrigger overlay={<Tooltip>{whatMeans}</Tooltip>} placement="left">
              <span className="trend-meaning-link" role="img" aria-label="meaning">
                {t('What does this mean?')} ⓘ
              </span>
            </OverlayTrigger>
          </div>
        </div>

        {/* Chart */}
        <div className="trend-modal-chart" aria-label={`${title} chart`}>
          {tip && (
            <div
              className="trend-tooltip"
              style={{
                left: clamp(tip.x + 12, 8, 9999),
                top: clamp(tip.y - 14, 8, 9999),
              }}
            >
              <div className="trend-tooltip-date">{tip.dateLabel}</div>
              <div className="trend-tooltip-value">{tip.valueLabel}</div>
              {tip.goalMetText && <div className="trend-tooltip-meta">{tip.goalMetText}</div>}
              {tip.pctText && <div className="trend-tooltip-meta">{tip.pctText}</div>}
              {tip.extra && <div className="trend-tooltip-extra">{tip.extra}</div>}
            </div>
          )}

          <svg
            viewBox={`0 0 ${chart.w} ${chart.h}`}
            preserveAspectRatio="none"
            className="trend-svg"
          >
            {/* Grid + Y labels */}
            {chart.grid.map((g, idx) => (
              <g key={idx}>
                <line
                  x1={chart.padL}
                  x2={chart.w - chart.padR}
                  y1={g.y}
                  y2={g.y}
                  className="trend-grid-line"
                />
                <text x={10} y={g.y + 5} className="trend-axis-label">
                  {Math.round(g.v)}
                </text>
              </g>
            ))}

            {/* Today marker */}
            {markerIndexToday != null && (
              <line
                x1={chart.xScale(markerIndexToday)}
                x2={chart.xScale(markerIndexToday)}
                y1={chart.padT}
                y2={chart.h - chart.padB}
                className="trend-marker-today"
              />
            )}

            {/* Selected day marker */}
            {markerIndexSelected != null && (
              <line
                x1={chart.xScale(markerIndexSelected)}
                x2={chart.xScale(markerIndexSelected)}
                y1={chart.padT}
                y2={chart.h - chart.padB}
                className="trend-marker-selected"
              />
            )}

            {/* Threshold lines + labels */}
            {chart.thPrimary.map((th: any, idx: number) => {
              const y = chart.yScale(th.value);
              return (
                <g key={`th-${idx}`}>
                  <line
                    x1={chart.padL}
                    x2={chart.w - chart.padR}
                    y1={y}
                    y2={y}
                    className={`trend-th-line trend-th-${th.kind}`}
                  />
                  <text x={chart.w - chart.padR + 10} y={y + 5} className="trend-th-label">
                    {th.label}: {nf.format(Math.round(th.value))}
                    {metric === 'bp' ? ` ${(metricMeta as any).unit}` : ''}
                  </text>
                </g>
              );
            })}

            {metric === 'bp' &&
              chart.thSecondary.map((th: any, idx: number) => {
                const y = chart.yScale(th.value);
                return (
                  <g key={`th2-${idx}`}>
                    <line
                      x1={chart.padL}
                      x2={chart.w - chart.padR}
                      y1={y}
                      y2={y}
                      className={`trend-th-line trend-th-${th.kind} trend-th-secondary`}
                    />
                    <text
                      x={chart.w - chart.padR + 10}
                      y={y + 5}
                      className="trend-th-label trend-th-label-secondary"
                    >
                      {th.label}: {nf.format(Math.round(th.value))} {(metricMeta as any).unit}
                    </text>
                  </g>
                );
              })}

            {/* Axes */}
            <line
              x1={chart.padL}
              x2={chart.padL}
              y1={chart.padT}
              y2={chart.h - chart.padB}
              className="trend-axis"
            />
            <line
              x1={chart.padL}
              x2={chart.w - chart.padR}
              y1={chart.h - chart.padB}
              y2={chart.h - chart.padB}
              className="trend-axis"
            />

            {/* Series */}
            {chart.pathPrimary && <path d={chart.pathPrimary} className="trend-line" fill="none" />}
            {metric === 'bp' && chart.pathSecondary && (
              <path d={chart.pathSecondary} className="trend-line-secondary" fill="none" />
            )}

            {/* X labels */}
            {chart.xLabelIdx.map((idx) => {
              const p = series[idx];
              if (!p) return null;
              const x = chart.xScale(idx);
              return (
                <text
                  key={`xl-${idx}`}
                  x={x}
                  y={chart.h - 18}
                  textAnchor="middle"
                  className="trend-x-label"
                >
                  {p.date.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })}
                </text>
              );
            })}

            {/* Points (hit area) + selected highlight */}
            {series.map((p, i) => {
              const isSel = markerIndexSelected === i;
              const isTod = markerIndexToday === i;

              // primary
              if (p.value != null && Number.isFinite(Number(p.value))) {
                const x = chart.xScale(i);
                const y = chart.yScale(Number(p.value));
                return (
                  <g key={`pt-${i}`}>
                    <circle
                      cx={x}
                      cy={y}
                      r={isSel ? 7 : 6}
                      className={`trend-point-hit ${isSel ? 'trend-point-selected' : ''} ${isTod ? 'trend-point-today' : ''}`}
                      onMouseMove={(e) => onPointHover(e, i)}
                      onMouseLeave={onPointLeave}
                      onTouchStart={(e) => {
                        const touch = e.touches?.[0];
                        if (!touch) return;
                        const fakeEvt = {
                          ...e,
                          clientX: touch.clientX,
                          clientY: touch.clientY,
                          currentTarget: e.currentTarget,
                        } as any;
                        onPointHover(fakeEvt, i);
                      }}
                    />
                  </g>
                );
              }

              return null;
            })}

            {/* BP DIA points */}
            {metric === 'bp' &&
              series.map((p, i) => {
                if (p.extra == null || !Number.isFinite(Number(p.extra))) return null;
                const x = chart.xScale(i);
                const y = chart.yScale(Number(p.extra));
                const isSel = markerIndexSelected === i;
                const isTod = markerIndexToday === i;
                return (
                  <circle
                    key={`pt2-${i}`}
                    cx={x}
                    cy={y}
                    r={isSel ? 6 : 5}
                    className={`trend-point-secondary ${isSel ? 'trend-point-secondary-selected' : ''} ${isTod ? 'trend-point-secondary-today' : ''}`}
                  />
                );
              })}
          </svg>
        </div>

        {/* Insights */}
        <div className="trend-modal-section">
          <div className="trend-section-title">{t('Quick insights')}</div>

          <div className="trend-insights-grid">
            <div className="trend-insight-item">
              <div className="trend-insight-label">{t('Average')}</div>
              <div className="trend-insight-value">
                {insights.avg == null
                  ? '—'
                  : metric === 'bp'
                    ? `${Math.round(insights.avg)} ${(metricMeta as any).unit}`
                    : (metricMeta as any).format(insights.avg)}
              </div>
            </div>

            <div className="trend-insight-item">
              <div className="trend-insight-label">{t('Median')}</div>
              <div className="trend-insight-value">
                {insights.med == null
                  ? '—'
                  : metric === 'bp'
                    ? `${Math.round(insights.med)} ${(metricMeta as any).unit}`
                    : (metricMeta as any).format(insights.med)}
              </div>
            </div>

            <div className="trend-insight-item">
              <div className="trend-insight-label">{t('Best day')}</div>
              <div className="trend-insight-value">
                {insights.best
                  ? `${insights.best.date.toLocaleDateString(i18n.language)} • ${formatValueLabel(insights.best)}`
                  : '—'}
              </div>
            </div>

            <div className="trend-insight-item">
              <div className="trend-insight-label">{t('Worst day')}</div>
              <div className="trend-insight-value">
                {insights.worst
                  ? `${insights.worst.date.toLocaleDateString(i18n.language)} • ${formatValueLabel(insights.worst)}`
                  : '—'}
              </div>
            </div>

            <div className="trend-insight-item">
              <div className="trend-insight-label">{t('Streak meeting goal')}</div>
              <div className="trend-insight-value">
                {insights.streak} {t('days')}
              </div>
            </div>

            <div className="trend-insight-item">
              <div className="trend-insight-label">{t('Trend vs previous period')}</div>
              <div className="trend-insight-value">
                {insights.trend.pct == null
                  ? '—'
                  : `${insights.trend.dir === 'up' ? t('Up') : insights.trend.dir === 'down' ? t('Down') : t('Stable')} (${insights.trend.pct > 0 ? '+' : ''}${insights.trend.pct.toFixed(1)}%)`}
              </div>
            </div>
          </div>
        </div>

        {/* Context + thresholds list */}
        <div className="trend-modal-section">
          <div className="trend-section-title">{t('Your thresholds')}</div>

          <div className="trend-threshold-list">
            {metric !== 'bp' &&
              ((metricMeta as any).thresholds || []).map((th: any, idx: number) => (
                <div key={`ctx-${idx}`} className="trend-threshold-row">
                  <span className={`trend-legend-line trend-legend-${th.kind}`} />
                  <span className="trend-legend-text">
                    {th.label}: {nf.format(Math.round(th.value))}
                    {(metricMeta as any).unit ? ` ${(metricMeta as any).unit}` : ''}
                  </span>
                </div>
              ))}

            {metric === 'bp' && (
              <>
                {((metricMeta as any).thresholdsSys || []).map((th: any, idx: number) => (
                  <div key={`ctx-s-${idx}`} className="trend-threshold-row">
                    <span className={`trend-legend-line trend-legend-${th.kind}`} />
                    <span className="trend-legend-text">
                      {th.label}: {nf.format(Math.round(th.value))} {(metricMeta as any).unit}
                    </span>
                  </div>
                ))}
                {((metricMeta as any).thresholdsDia || []).map((th: any, idx: number) => (
                  <div key={`ctx-d-${idx}`} className="trend-threshold-row">
                    <span
                      className={`trend-legend-line trend-legend-${th.kind} trend-legend-secondary`}
                    />
                    <span className="trend-legend-text">
                      {th.label}: {nf.format(Math.round(th.value))} {(metricMeta as any).unit}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="trend-data-quality mt-2">
            <div className="text-muted">
              {t('Data quality')}: {missingness.missing}/{missingness.total}{' '}
              {t('days missing Fitbit data')}
            </div>
            {metric === 'bp' && hasManualBP && (
              <div className="text-muted">{t('Some BP values were entered manually.')}</div>
            )}
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
};

/* ---------- Main ActivitySummary ---------- */
const ActivitySummary: React.FC<{ selectedDate?: Date }> = observer(({ selectedDate }) => {
  const { i18n, t } = useTranslation();
  const id = useMemo(() => localStorage.getItem('id') || authStore.id, []);
  const nf = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  const [modalMetric, setModalMetric] = useState<MetricKey | null>(null);

  /* Manual steps UI state */
  const [manualSteps, setManualSteps] = useState('');
  const [manualDate, setManualDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [manualMsg, setManualMsg] = useState('');
  const [showManualError, setShowManualError] = useState(false);
  const [showManualSuccess, setShowManualSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const mmToHhMm = (m = 0) => {
    const h = Math.floor((m || 0) / 60);
    const mm = Math.abs((m || 0) % 60);
    return t('{{hours}}h {{minutes}}m', { hours: h, minutes: mm });
  };

  useEffect(() => {
    if (!id) return;
    patientFitbitStore.fetchStatus(id);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (patientFitbitStore.connected !== null) {
      patientFitbitStore.fetchSummary(id, 30);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientFitbitStore.connected, id]);

  if (patientFitbitStore.connected === null || patientFitbitStore.summaryLoading) {
    return (
      <Card className="mb-4">
        <Card.Body className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" /> {t('loading')}
        </Card.Body>
      </Card>
    );
  }

  const data = patientFitbitStore.summary;

  // MANUAL MODE (not connected)
  if (patientFitbitStore.connected === false) {
    const daily = data?.period?.daily || [];
    const focusRow =
      daily.find((r) => isSameDay(new Date(r.date), selectedDate || new Date())) || null;

    const steps = focusRow?.steps ?? null;
    const avgSteps = data?.period?.averages?.steps ?? null;

    const thr = mergeThresholds(data?.thresholds);

    const submitManualSteps = async () => {
      if (!manualSteps || isNaN(Number(manualSteps))) return;

      setSubmitting(true);
      try {
        await patientFitbitStore.submitManualSteps(id, manualDate, Number(manualSteps));
        setManualMsg(t('Steps saved successfully.'));
        setShowManualSuccess(true);
        setShowManualError(false);
        setManualSteps('');
      } catch {
        setManualMsg(t('Failed to save steps. Please try again.'));
        setShowManualError(true);
        setShowManualSuccess(false);
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <Card className="mb-4 border-warning">
        <Card.Header>
          <strong>{t('Manual Steps Entry')}</strong>
        </Card.Header>
        <Card.Body>
          {showManualSuccess && (
            <Alert variant="success" dismissible onClose={() => setShowManualSuccess(false)}>
              {manualMsg}
            </Alert>
          )}
          {showManualError && (
            <Alert variant="danger" dismissible onClose={() => setShowManualError(false)}>
              {manualMsg}
            </Alert>
          )}

          <Alert variant="warning">
            {t('Your Fitbit is not connected. Please enter your daily steps manually.')}
          </Alert>

          <Row className="g-2 mb-3 align-items-end">
            <Col xs={6} md={4}>
              <Form.Label>{t('Steps')}</Form.Label>
              <Form.Control
                type="number"
                min="0"
                value={manualSteps}
                onChange={(e) => setManualSteps(e.target.value)}
                placeholder={t('e.g. 5000')}
              />
            </Col>

            <Col xs={6} md={4}>
              <Form.Label>{t('Date')}</Form.Label>
              <Form.Control
                type="date"
                max={format(new Date(), 'yyyy-MM-dd')}
                min={format(subDays(new Date(), 7), 'yyyy-MM-dd')}
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
              />
            </Col>

            <Col xs="auto">
              <Button onClick={submitManualSteps} disabled={submitting || !manualSteps}>
                {submitting && <Spinner size="sm" animation="border" className="me-2" />}
                {t('Save')}
              </Button>
            </Col>
          </Row>

          <Row xs={1} md={3} className="g-3 mt-3">
            <Col>
              <StatCard
                label={t('Steps')}
                value={steps !== null ? nf.format(steps) : '-'}
                valueClassName={steps != null ? colorForSteps(steps, thr) : 'text-muted'}
                sub={t('Today’s recorded steps')}
              />
            </Col>

            <Col>
              <StatCard
                label={t('Average Steps')}
                value={avgSteps != null ? nf.format(avgSteps) : '-'}
                valueClassName={avgSteps != null ? colorForSteps(avgSteps, thr) : 'text-muted'}
                sub={t('Average of last 7 days')}
              />
            </Col>

            <Col>
              <StatCard
                label={t('Step Score')}
                value={
                  steps === null
                    ? '-'
                    : steps >= thr.steps_goal
                      ? t('Excellent')
                      : steps >= thr.steps_goal * 0.75
                        ? t('Good')
                        : steps >= thr.steps_goal * 0.5
                          ? t('Fair')
                          : t('Low')
                }
              />
            </Col>
          </Row>
        </Card.Body>
      </Card>
    );
  }

  // CONNECTED MODE
  if (!data) {
    return (
      <Card className="mb-4">
        <Card.Body className="text-danger">{t('No data available')}</Card.Body>
      </Card>
    );
  }

  const thr = mergeThresholds(data.thresholds);
  const daily = data.period.daily || [];
  const focusRow =
    daily.find((r) => isSameDay(new Date(r.date), selectedDate || new Date())) || null;

  const stepsToday = focusRow?.steps ?? 0;
  const activeToday = focusRow?.active_minutes ?? 0;
  const sleepToday = focusRow?.sleep_minutes ?? 0;

  const bpSysToday = focusRow?.bp_sys ?? data.today?.bp_sys ?? null;
  const bpDiaToday = focusRow?.bp_dia ?? data.today?.bp_dia ?? null;

  const averages = data.period.averages || {};
  const avgSteps = averages.steps ?? 0;
  const avgActive = averages.active_minutes ?? 0;
  const avgSleep = averages.sleep_minutes ?? 0;
  const avgBpSys = averages.bp_sys ?? null;
  const avgBpDia = averages.bp_dia ?? null;

  const daysCount = data.period.days || daily.length || 0;

  return (
    <>
      <Card className="mb-4">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <strong>{t('Fitbit Activity Summary')}</strong>
          <span className="small text-muted">
            {data.last_sync
              ? t('lastSync', { date: new Date(data.last_sync).toLocaleString(i18n.language) })
              : t('notConnected')}
          </span>
        </Card.Header>

        <Card.Body>
          {!!patientFitbitStore.error && (
            <Alert variant="danger" className="py-2">
              {t(patientFitbitStore.error)}
            </Alert>
          )}

          <Row xs={1} md={4} className="g-3">
            <Col>
              <StatCard
                label={t('Steps')}
                value={nf.format(stepsToday)}
                valueClassName={colorForSteps(stepsToday, thr)}
                sub={`${t('avg', { days: daysCount })} ${nf.format(avgSteps)}`}
                tooltip={t('stepsTip')}
                onOpenChart={() => setModalMetric('steps')}
                chartButtonLabel={t('View chart')}
              />
            </Col>

            <Col>
              <StatCard
                label={t('Active Minutes')}
                value={`${activeToday} ${t('min')}`}
                valueClassName={colorForActive(activeToday, thr)}
                sub={`${t('avg', { days: daysCount })} ${avgActive} ${t('min')}`}
                onOpenChart={() => setModalMetric('active')}
                chartButtonLabel={t('View chart')}
              />
            </Col>

            <Col>
              <StatCard
                label={t('Sleep')}
                value={mmToHhMm(sleepToday)}
                valueClassName={colorForSleep(sleepToday, thr)}
                sub={`${t('avg', { days: daysCount })} ${mmToHhMm(avgSleep)}`}
                onOpenChart={() => setModalMetric('sleep')}
                chartButtonLabel={t('View chart')}
              />
            </Col>

            <Col>
              <StatCard
                label={t('Blood Pressure')}
                value={
                  bpSysToday == null && bpDiaToday == null
                    ? '—'
                    : `${bpSysToday ?? '—'}/${bpDiaToday ?? '—'}`
                }
                valueClassName={colorForBP(bpSysToday, bpDiaToday, thr)}
                sub={
                  avgBpSys == null && avgBpDia == null
                    ? `${t('avg', { days: daysCount })} —`
                    : `${t('avg', { days: daysCount })} ${Math.round(avgBpSys ?? 0)}/${Math.round(avgBpDia ?? 0)}`
                }
                tooltip={t('Enter BP manually on the patient page if needed.')}
                onOpenChart={() => setModalMetric('bp')}
                chartButtonLabel={t('View chart')}
              />
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {modalMetric && (
        <TrendModal
          show={!!modalMetric}
          onHide={() => setModalMetric(null)}
          metric={modalMetric}
          daily={daily}
          thresholds={thr}
          selectedDate={selectedDate || new Date()}
          lastSync={data.last_sync || null}
        />
      )}
    </>
  );
});

export default ActivitySummary;
