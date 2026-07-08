import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';
import { observer } from 'mobx-react-lite';
import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import ExportModal from '@/components/Health/ExportModal';
import HealthViewControls from '@/components/Health/HealthViewControls';
import HealthMetricsCards from '@/components/Health/HealthMetricsCards';

import { isInRange, svgToImageDataUrl } from '@/utils/healthCharts';
import HealthPageStore from '@/stores/healthPageStore';
import { HealthPageContentLoadingSkeleton } from '@/components/skeletons/TherapistPatientDetailSkeleton';

// Pure row/average helpers reused to caption PDF chart pages with real numbers —
// the on-page charts hide their axes for a clean mini-chart look, so the exported
// image alone has no scale; these captions fill that gap without touching the charts.
import { filterAdherenceInRange } from '@/components/Health/charts/AdherenceLine';
import { filterWearTimeInRange } from '@/components/Health/charts/WearTimeChart';
import { filterRestingHRInRange } from '@/components/Health/charts/RestingHRChart';
import { filterBloodPressureInRange } from '@/components/Health/charts/BloodPressureChart';
import { filterHRZonesInRange } from '@/components/Health/charts/HRZonesStacked';
import { filterStepsInRange } from '@/components/Health/charts/StepsChart';
import { filterActiveMinutesInRange } from '@/components/Health/charts/ActiveMinutesChart';
import { filterWeightInRange } from '@/components/Health/charts/WeightChart';
import { filterExerciseInRange } from '@/components/Health/charts/ExerciseSessionsChart';
import { filterSleepInRange, formatSleepDuration } from '@/components/Health/charts/SleepChart';
import { filterBreathingInRange } from '@/components/Health/charts/BreathingChart';

/* --------- helpers for European date formatting ---------- */
const toEuroDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  const [y, m, d] = parts;
  return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`;
};

const formatDateEU = (d: Date): string => toEuroDate(d.toISOString().slice(0, 10));

interface HealthPageContentProps {
  patientId: string;
}

const HealthPageContent: React.FC<HealthPageContentProps> = observer(({ patientId }) => {
  const { t, i18n } = useTranslation();

  const store = useMemo(() => new HealthPageStore(), [patientId]);

  // Export modal state (UI-only)
  const [showExport, setShowExport] = useState(false);

  // Chart container refs for PDF export. Each ref points at the chart's wrapping <div> —
  // populated natively by React the moment it mounts, unlike the inner <svg>, which Recharts
  // only renders asynchronously once it has measured a size. handleExportPDF queries for the
  // live <svg> off these refs at export time, so it never races that measurement.
  // Ordered to match the card layout on the Health page (HealthMetricsCards.tsx):
  // Engagement, Cardiovascular, Activity, Sleep & Recovery.
  const svgRefs = {
    adherence: useRef<HTMLDivElement>(null),
    wearTime: useRef<HTMLDivElement>(null),
    restingHR: useRef<HTMLDivElement>(null),
    bloodPressure: useRef<HTMLDivElement>(null),
    hrZones: useRef<HTMLDivElement>(null),
    steps: useRef<HTMLDivElement>(null),
    activeMinutes: useRef<HTMLDivElement>(null),
    weight: useRef<HTMLDivElement>(null),
    exercise: useRef<HTMLDivElement>(null),
    sleep: useRef<HTMLDivElement>(null),
    breathing: useRef<HTMLDivElement>(null),
  };

  // Default selections for export modal, in the same card order as svgRefs above.
  const defaultSelections: Record<string, boolean> = {
    adherence: true,
    wearTime: true,
    questionnaire: true,
    totalScore: true,
    restingHR: true,
    bloodPressure: true,
    hrZones: true,
    steps: true,
    activeMinutes: true,
    weight: true,
    exercise: true,
    sleep: true,
    breathing: true,
  };

  // Fetch data when patient or window changes
  useEffect(() => {
    if (!patientId) return;
    store.fetchThresholds(patientId, t);
    store.fetchCombinedHistoryForPatient(
      patientId,
      store.startDate.toISOString().slice(0, 10),
      store.endDate.toISOString().slice(0, 10),
      t
    );
  }, [patientId, store, store.viewMode, store.referenceDate, t]);

  const formatRangeLabel = (start: Date, end: Date) =>
    `${formatDateEU(start)} — ${formatDateEU(end)}`;

  // ─────────────────────────────────────────────────────────
  // CSV export
  // ─────────────────────────────────────────────────────────
  const handleExportCSV = (from: Date, to: Date, selections: Record<string, boolean>) => {
    const delim = ';';

    const csvEscape = (v: unknown) => {
      const s = String(v ?? '');
      const needsQuotes = /[",\n;]/.test(s);
      const escaped = s.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };

    const emitRows2 = (header: string[], rows: (string | number | null | undefined)[][]) =>
      [header, ...rows].map((line) => line.map(csvEscape).join(delim)).join('\n') + '\n\n';

    let csv = '';

    const fitIn = store.fitbitData.filter((d) => isInRange(d.date, from, to));
    const qIn = store.questionnaireData.filter((d) => isInRange(d.date, from, to));

    // Total questionnaire score per day
    if (selections.totalScore && qIn.length) {
      const grouped = d3.groups(qIn, (d) => d.date.slice(0, 10));
      grouped.sort((a, b) => a[0].localeCompare(b[0]));
      const rows = grouped.map(([date, entries]) => {
        const score = d3.sum(entries, (e) => parseInt(e.answers?.[0]?.key || '0', 10));
        return [toEuroDate(date), score];
      });
      csv += emitRows2(['Date', 'Total Score'], rows);
    }

    // Adherence
    if (selections.adherence) {
      const adIn = store.adherenceData.filter((d) => isInRange(d.date, from, to));

      const rows = adIn
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          label: d.date,
          sched: d.scheduled ?? 0,
          comp: d.completed ?? 0,
          pct: d.pct ?? null,
        }));

      const out = rows.map((r) => [
        toEuroDate(r.label),
        r.sched,
        r.comp,
        r.pct != null ? r.pct : '',
      ]);

      csv += emitRows2(['Date/Period', 'Scheduled', 'Completed', 'Adherence (%)'], out);
    }

    // Questionnaire rows
    if (selections.questionnaire) {
      const rows: (string | number)[][] = [];
      for (const e of qIn) {
        const questionText =
          e.questionTranslations?.find((x) => x.language === i18n.language)?.text ||
          e.questionTranslations?.find((x) => x.language === 'en')?.text ||
          '';

        const answerKeys = (e.answers || []).map((a) => a.key).filter(Boolean);
        const answerTexts = (e.answers || [])
          .map((a) => {
            const text =
              a.translations?.find((x) => x.language === i18n.language)?.text ||
              a.translations?.find((x) => x.language === 'en')?.text ||
              a.key;
            return String(text || '');
          })
          .filter(Boolean);
        const mediaUrls = (e.media_urls || []).filter(Boolean);

        rows.push([
          toEuroDate(e.date.slice(0, 10)),
          e.questionKey,
          questionText,
          answerKeys.join(' | '),
          answerTexts.join(' | '),
          e.comment || '',
          mediaUrls.join(' | '),
        ]);
      }
      csv += emitRows2(
        [
          'Date',
          'Question Key',
          'Question Text',
          'Answer Keys',
          'Answer Texts',
          'Comment',
          'Media URLs',
        ],
        rows
      );
    }

    // Helper scalar
    const emitScalar = (label: string, rows: { date: string; val?: number }[]) => {
      const sorted = rows
        .filter((r) => r.val != null)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => [toEuroDate(r.date.slice(0, 10)), r.val as number]);
      return sorted.length ? emitRows2(['Date', label], sorted) : '';
    };

    if (selections.restingHR)
      csv += emitScalar(
        'Resting Heart Rate',
        fitIn.map((d) => ({ date: d.date, val: (d as any).resting_heart_rate }))
      );
    if (selections.steps)
      csv += emitScalar(
        'Steps',
        fitIn.map((d) => ({ date: d.date, val: (d as any).steps }))
      );
    if (selections.activeMinutes)
      csv += emitScalar(
        'Active Minutes',
        fitIn.map((d) => ({ date: d.date, val: (d as any).active_minutes }))
      );
    if (selections.breathing)
      csv += emitScalar(
        'Breathing Rate',
        fitIn.map((d: any) => ({ date: d.date, val: d.breathing_rate?.breathingRate }))
      );
    if (selections.wearTime)
      csv += emitScalar(
        'Wear Time (min)',
        fitIn.map((d: any) => ({ date: d.date, val: d.wear_time_minutes }))
      );

    if (selections.sleep) {
      const rows = fitIn
        .filter((d: any) => d.sleep?.sleep_duration != null)
        .map((d: any) => {
          const h = (d.sleep.sleep_duration / 3600000).toFixed(2);
          return [
            toEuroDate(d.date.slice(0, 10)),
            d.sleep.sleep_start ?? '',
            d.sleep.sleep_end ?? '',
            h,
          ];
        })
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      if (rows.length) csv += emitRows2(['Date', 'Sleep Start', 'Sleep End', 'Duration (h)'], rows);
    }

    if (selections.hrZones) {
      const rows: (string | number)[][] = [];
      fitIn.forEach((d) =>
        ((d as any).heart_rate_zones || []).forEach((z: any) => {
          rows.push([toEuroDate(d.date.slice(0, 10)), z.name, z.minutes, z.min ?? '', z.max ?? '']);
        })
      );
      rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      if (rows.length) csv += emitRows2(['Date', 'Zone', 'Minutes', 'Min HR', 'Max HR'], rows);
    }

    if (selections.weight) {
      const rows = fitIn
        .filter((d: any) => d.weight_kg != null)
        .map((d: any) => [toEuroDate(d.date.slice(0, 10)), d.weight_kg as number])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      if (rows.length) csv += emitRows2(['Date', 'Weight (kg)'], rows);
    }

    if (selections.bloodPressure) {
      const rows = fitIn
        .filter((d: any) => d.bp_sys != null || d.bp_dia != null)
        .map((d: any) => [
          toEuroDate(d.date.slice(0, 10)),
          d.bp_sys != null ? d.bp_sys : '',
          d.bp_dia != null ? d.bp_dia : '',
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      if (rows.length) csv += emitRows2(['Date', 'Systolic (mmHg)', 'Diastolic (mmHg)'], rows);
    }

    if (selections.exercise) {
      const rows: (string | number | null)[][] = [];
      fitIn.forEach((d: any) => {
        const sessions = d.exercise?.sessions || [];
        sessions.forEach((s: any) => {
          const durMin = s.duration != null ? (s.duration as number) / 60000 : null;
          rows.push([
            toEuroDate(d.date.slice(0, 10)),
            s.name || '',
            durMin != null ? durMin.toFixed(1) : '',
            s.calories ?? '',
            s.averageHeartRate ?? '',
            s.maxHeartRate ?? '',
          ]);
        });
      });
      rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      if (rows.length) {
        csv += emitRows2(
          [
            'Date',
            'Exercise Name',
            'Duration (min)',
            'Calories (kcal)',
            'Avg HR (bpm)',
            'Max HR (bpm)',
          ],
          rows
        );
      }
    }

    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    saveAs(
      blob,
      `HealthData_${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}.csv`
    );
    setShowExport(false);
  };

  // ─────────────────────────────────────────────────────────
  // PDF export
  // ─────────────────────────────────────────────────────────
  const handleExportPDF = async (from: Date, to: Date, selections: Record<string, boolean>) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: 'a4' });
    const titleFontSize = doc.getFontSize();

    // avg/min/max caption per chart page — the on-page charts hide their axes for a
    // clean mini-chart look, so the exported image alone has no scale. Computed from
    // the same filter functions that drive the chart, not re-derived independently.
    const fmt = (v: number, decimals = 0) => v.toFixed(decimals);
    const stats = (values: number[]): { avg: number; min: number; max: number } | null => {
      if (!values.length) return null;
      return {
        avg: values.reduce((sum, v) => sum + v, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    };

    const captionBuilders: Record<string, () => string | null> = {
      adherence: () => {
        const s = stats(
          filterAdherenceInRange(store.adherenceData, from, to)
            .map((r) => r.pct)
            .filter((v): v is number => v != null)
        );
        return (
          s && `${t('Adherence (%)')}: avg ${fmt(s.avg)}% · min ${fmt(s.min)}% · max ${fmt(s.max)}%`
        );
      },
      wearTime: () => {
        const s = stats(
          filterWearTimeInRange(store.fitbitData, from, to)
            .map((r) => r.wearTime)
            .filter((v): v is number => v != null)
        );
        return (
          s &&
          `avg ${fmt(s.avg)} ${t('min')} · min ${fmt(s.min)} ${t('min')} · max ${fmt(s.max)} ${t('min')}`
        );
      },
      restingHR: () => {
        const s = stats(
          filterRestingHRInRange(store.fitbitData, from, to)
            .map((r) => r.restingHR)
            .filter((v): v is number => v != null)
        );
        return s && `avg ${fmt(s.avg)} bpm · min ${fmt(s.min)} bpm · max ${fmt(s.max)} bpm`;
      },
      bloodPressure: () => {
        const rows = filterBloodPressureInRange(store.fitbitData, from, to);
        const sys = stats(rows.map((r) => r.sys).filter((v): v is number => v != null));
        const dia = stats(rows.map((r) => r.dia).filter((v): v is number => v != null));
        if (!sys && !dia) return null;
        const parts = [
          sys &&
            `${t('Blood pressure systolic')}: avg ${fmt(sys.avg)} · min ${fmt(sys.min)} · max ${fmt(sys.max)}`,
          dia &&
            `${t('Blood pressure diastolic')}: avg ${fmt(dia.avg)} · min ${fmt(dia.min)} · max ${fmt(dia.max)}`,
        ].filter(Boolean);
        return `${parts.join('   |   ')} mmHg`;
      },
      hrZones: () => {
        const s = stats(
          filterHRZonesInRange(store.fitbitData, from, to)
            .map((r) => r.fatBurn + r.cardio + r.peak)
            .filter((v) => v > 0)
        );
        return (
          s &&
          `avg ${fmt(s.avg)} ${t('min')} · min ${fmt(s.min)} ${t('min')} · max ${fmt(s.max)} ${t('min')}`
        );
      },
      steps: () => {
        const s = stats(
          filterStepsInRange(store.fitbitData, from, to)
            .map((r) => r.steps)
            .filter((v): v is number => v != null)
        );
        return (
          s &&
          `avg ${Math.round(s.avg).toLocaleString()} · min ${s.min.toLocaleString()} · max ${s.max.toLocaleString()}`
        );
      },
      activeMinutes: () => {
        const s = stats(
          filterActiveMinutesInRange(store.fitbitData, from, to)
            .map((r) => r.activeMinutes)
            .filter((v): v is number => v != null)
        );
        return (
          s &&
          `avg ${fmt(s.avg)} ${t('min')} · min ${fmt(s.min)} ${t('min')} · max ${fmt(s.max)} ${t('min')}`
        );
      },
      weight: () => {
        const s = stats(
          filterWeightInRange(store.fitbitData, from, to)
            .map((r) => r.weight)
            .filter((v): v is number => v != null)
        );
        return s && `avg ${fmt(s.avg, 1)} kg · min ${fmt(s.min, 1)} kg · max ${fmt(s.max, 1)} kg`;
      },
      exercise: () => {
        const s = stats(
          filterExerciseInRange(store.fitbitData, from, to)
            .map((r) => r.total)
            .filter((v): v is number => v != null && v > 0)
        );
        return (
          s &&
          `avg ${fmt(s.avg)} ${t('min')} · min ${fmt(s.min)} ${t('min')} · max ${fmt(s.max)} ${t('min')}`
        );
      },
      sleep: () => {
        const s = stats(
          filterSleepInRange(store.fitbitData, from, to)
            .map((r) => r.minutesAsleep)
            .filter((v): v is number => v != null)
        );
        return (
          s &&
          `avg ${formatSleepDuration(s.avg)} · min ${formatSleepDuration(s.min)} · max ${formatSleepDuration(s.max)}`
        );
      },
      breathing: () => {
        const s = stats(
          filterBreathingInRange(store.fitbitData, from, to)
            .map((r) => r.breathingRate)
            .filter((v): v is number => v != null)
        );
        return (
          s && `avg ${fmt(s.avg, 1)}/min · min ${fmt(s.min, 1)}/min · max ${fmt(s.max, 1)}/min`
        );
      },
    };

    const sections: (
      | { type: 'chart'; ref: React.RefObject<HTMLDivElement>; key: string; title: string }
      | { type: 'questionnaire'; key: 'questionnaire'; title: string }
    )[] = [
      { type: 'chart', ref: svgRefs.adherence, key: 'adherence', title: t('Adherence (%)') },
      { type: 'chart', ref: svgRefs.wearTime, key: 'wearTime', title: t('Wear Time (min)') },
      { type: 'questionnaire', key: 'questionnaire', title: t('Questionnaire Results By Date') },
      { type: 'chart', ref: svgRefs.restingHR, key: 'restingHR', title: t('Resting Heart Rate') },
      {
        type: 'chart',
        ref: svgRefs.bloodPressure,
        key: 'bloodPressure',
        title: t('Blood Pressure (SYS/DIA)'),
      },
      { type: 'chart', ref: svgRefs.hrZones, key: 'hrZones', title: t('Heart Rate Zones per Day') },
      { type: 'chart', ref: svgRefs.steps, key: 'steps', title: t('Daily Steps') },
      {
        type: 'chart',
        ref: svgRefs.activeMinutes,
        key: 'activeMinutes',
        title: t('Active Minutes'),
      },
      { type: 'chart', ref: svgRefs.weight, key: 'weight', title: t('Weight (kg)') },
      { type: 'chart', ref: svgRefs.exercise, key: 'exercise', title: t('Exercise Summary') },
      {
        type: 'chart',
        ref: svgRefs.sleep,
        key: 'sleep',
        title: t('Sleep Schedule and Duration'),
      },
      {
        type: 'chart',
        ref: svgRefs.breathing,
        key: 'breathing',
        title: t('Breathing Rate (breaths/min)'),
      },
    ];

    let first = true;

    for (const section of sections) {
      if (!selections[section.key]) continue;

      // Every selected chart gets a page — including ones with no data for the
      // range, so the PDF mirrors the card grid instead of silently dropping pages.
      if (!first) doc.addPage();
      first = false;

      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      doc.text(String(section.title), pageW / 2, 30, { align: 'center' });

      if (section.type === 'questionnaire') {
        const qIn = store.questionnaireData
          .filter((d) => isInRange(d.date, from, to))
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date));

        if (!qIn.length) {
          doc.text(t('No data available'), pageW / 2, pageH / 2, { align: 'center' });
          continue;
        }

        const rows = qIn.map((e) => {
          const questionText =
            e.questionTranslations?.find((x) => x.language === i18n.language)?.text ||
            e.questionTranslations?.find((x) => x.language === 'en')?.text ||
            e.questionKey;

          const answers = (e.answers || [])
            .map(
              (a) =>
                a.translations?.find((x) => x.language === i18n.language)?.text ||
                a.translations?.find((x) => x.language === 'en')?.text ||
                a.key
            )
            .filter(Boolean)
            .join(', ');

          return [toEuroDate(e.date.slice(0, 10)), questionText, answers || '—', e.comment || '—'];
        });

        autoTable(doc, {
          startY: 50,
          head: [[t('Date'), t('Question'), t('Answers'), t('Comment')]],
          body: rows,
          styles: { fontSize: 8, cellPadding: 4 },
          headStyles: { fillColor: [0, 149, 108] },
          margin: { left: 30, right: 30 },
        });
        continue;
      }

      // Queried fresh (not cached) — by export time the chart has been on screen long
      // enough for Recharts to have mounted its <svg>, so this reliably finds it.
      const svg = section.ref.current?.querySelector('svg');
      if (!svg) {
        doc.text(t('No data available'), pageW / 2, pageH / 2, { align: 'center' });
        continue;
      }

      // Bottom margin (below maxH) is reserved for the date-range/stats caption below,
      // since the chart itself has no axis labels to give it scale.
      const maxW = pageW - 60;
      const maxH = pageH - 115;

      const vb = (svg as any).viewBox?.baseVal;
      const sW = vb?.width || 800;
      const sH = vb?.height || 300;
      const scale = Math.min(maxW / sW, maxH / sH);

      const imgW = sW * scale;
      const imgH = sH * scale;

      const url = await svgToImageDataUrl(svg);
      doc.addImage(url, 'PNG', (pageW - imgW) / 2, 50, imgW, imgH);

      const rangeLine = `${formatDateEU(from)} – ${formatDateEU(to)}`;
      const caption = captionBuilders[section.key]?.();
      doc.setFontSize(9);
      doc.text(rangeLine, pageW / 2, pageH - (caption ? 38 : 24), { align: 'center' });
      if (caption) doc.text(caption, pageW / 2, pageH - 22, { align: 'center' });
      doc.setFontSize(titleFontSize);
    }

    doc.save(
      `HealthCharts_${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}.pdf`
    );
    setShowExport(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {store.error && (
        <Alert variant="danger" role="alert">
          {store.error}
        </Alert>
      )}
      {store.thresholdsError && (
        <Alert variant="warning" role="alert">
          {store.thresholdsError}
        </Alert>
      )}

      <HealthViewControls
        store={store}
        t={t}
        formatRangeLabel={formatRangeLabel}
        onExportClick={() => setShowExport(true)}
      />

      {store.loading ? (
        <HealthPageContentLoadingSkeleton />
      ) : (
        <HealthMetricsCards
          store={store}
          t={t}
          lang={(i18n.language || 'en').split('-')[0]}
          svgRefs={svgRefs}
        />
      )}

      <ExportModal
        show={showExport}
        onClose={() => setShowExport(false)}
        initialFrom={store.startDate}
        initialTo={store.endDate}
        selections={defaultSelections}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
      />
    </div>
  );
});

export default HealthPageContent;
