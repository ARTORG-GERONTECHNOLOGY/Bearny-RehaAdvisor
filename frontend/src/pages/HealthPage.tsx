/* eslint-disable */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import jsPDF from 'jspdf';
import { saveAs } from 'file-saver';
import { observer } from 'mobx-react-lite';
import { Alert, Container, Row, Col, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import authStore from '../stores/authStore';

import ExportModal from '../components/Health/ExportModal';
import HealthViewControls from '../components/Health/HealthViewControls';
import HealthChartsAccordion from '../components/Health/HealthChartsAccordion';

import type { AdherenceEntry } from '../types/health';
import type { FitbitEntry, QuestionnaireEntry } from '../types/health';
import { isInRange, svgToImageDataUrl } from '../utils/healthCharts';
import HealthPageStore from '../stores/healthPageStore';

/* --------- helpers for European date formatting ---------- */
const toEuroDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  const [y, m, d] = parts;
  return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`;
};

const formatDateEU = (d: Date): string => toEuroDate(d.toISOString().slice(0, 10));

const HealthPage: React.FC = observer(() => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  // Local store instance for this page
  const store = useMemo(() => new HealthPageStore(), []);

  // Export modal state (UI-only)
  const [showExport, setShowExport] = useState(false);

  // Chart refs for PDF export
  const svgRefs = {
    adherence: useRef<SVGSVGElement>(null),
    restingHR: useRef<SVGSVGElement>(null),
    sleep: useRef<SVGSVGElement>(null),
    wearTime: useRef<SVGSVGElement>(null),
    hrZones: useRef<SVGSVGElement>(null),
    floors: useRef<SVGSVGElement>(null),
    steps: useRef<SVGSVGElement>(null),
    distance: useRef<SVGSVGElement>(null),
    breathing: useRef<SVGSVGElement>(null),
    hrv: useRef<SVGSVGElement>(null),
    weight: useRef<SVGSVGElement>(null),
    bloodPressure: useRef<SVGSVGElement>(null),
    exercise: useRef<SVGSVGElement>(null),
  };

  // Default selections for export modal
  const defaultSelections: Record<string, boolean> = {
    adherence: true,
    totalScore: true,
    questionnaire: true,
    restingHR: true,
    sleep: true,
    hrZones: true,
    floors: true,
    steps: true,
    distance: true,
    breathing: true,
    hrv: true,
    weight: true,
    bloodPressure: true,
    exercise: true,
  };

  // Auth + initial patient name
  useEffect(() => {
    authStore.checkAuthentication();

    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
      return;
    }

    const storedName = localStorage.getItem('selectedPatientName');
    store.setPatientName(storedName || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // Fetch data when window changes
  useEffect(() => {
    store.fetchCombinedHealth(store.startDate, store.endDate, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, store.viewMode, store.referenceDate, t]);

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

    // Adherence (res = store.chartRes)
    if (selections.adherence) {
      const startOfWeek = (d: Date) => {
        const x = new Date(d);
        const day = x.getDay();
        const diff = x.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(x.getFullYear(), x.getMonth(), diff);
      };
      const ymKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const adIn = store.adherenceData.filter((d) => isInRange(d.date, from, to));

      type RowT = { label: string; sched: number; comp: number; pct: number | null; sort: Date };
      let rows: RowT[] = [];

      if (store.chartRes === 'daily') {
        rows = adIn
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((d) => ({
            label: d.date,
            sched: d.scheduled ?? 0,
            comp: d.completed ?? 0,
            pct: d.pct ?? null,
            sort: new Date(d.date),
          }));
      } else if (store.chartRes === 'weekly') {
        const map = new Map<string, { sched: number; comp: number; d: Date }>();
        adIn.forEach((d) => {
          const dt = new Date(d.date);
          const wk = startOfWeek(dt);
          const key = wk.toISOString().slice(0, 10);
          if (!map.has(key)) map.set(key, { sched: 0, comp: 0, d: wk });
          const v = map.get(key)!;
          v.sched += d.scheduled ?? 0;
          v.comp += d.completed ?? 0;
        });
        rows = [...map.values()]
          .sort((a, b) => a.d.getTime() - b.d.getTime())
          .map((v) => ({
            label: v.d.toISOString().slice(0, 10),
            sched: v.sched,
            comp: v.comp,
            pct: v.sched > 0 ? Math.round((100 * v.comp) / v.sched) : null,
            sort: v.d,
          }));
      } else {
        const map = new Map<string, { sched: number; comp: number; d: Date }>();
        adIn.forEach((d) => {
          const dt = new Date(d.date);
          const key = ymKey(dt);
          if (!map.has(key))
            map.set(key, { sched: 0, comp: 0, d: new Date(dt.getFullYear(), dt.getMonth(), 1) });
          const v = map.get(key)!;
          v.sched += d.scheduled ?? 0;
          v.comp += d.completed ?? 0;
        });
        rows = [...map.values()]
          .sort((a, b) => a.d.getTime() - b.d.getTime())
          .map((v) => ({
            label: ymKey(v.d),
            sched: v.sched,
            comp: v.comp,
            pct: v.sched > 0 ? Math.round((100 * v.comp) / v.sched) : null,
            sort: v.d,
          }));
      }

      const out = rows.map((r) => {
        let label = r.label;
        if (store.chartRes === 'monthly') {
          const [y, m] = r.label.split('-');
          label = `01.${m}.${y}`;
        } else {
          label = toEuroDate(r.label);
        }
        return [label, r.sched, r.comp, r.pct != null ? r.pct : ''];
      });

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
    if (selections.distance)
      csv += emitScalar(
        'Distance',
        fitIn.map((d) => ({ date: d.date, val: (d as any).distance }))
      );
    if (selections.floors)
      csv += emitScalar(
        'Floors',
        fitIn.map((d) => ({ date: d.date, val: (d as any).floors }))
      );
    if (selections.breathing)
      csv += emitScalar(
        'Breathing Rate',
        fitIn.map((d: any) => ({ date: d.date, val: d.breathing_rate?.breathingRate }))
      );
    if (selections.hrv)
      csv += emitScalar(
        'HRV (dailyRmssd)',
        fitIn.map((d: any) => ({ date: d.date, val: d.hrv?.dailyRmssd }))
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

    const charts = [
      { ref: svgRefs.adherence, key: 'adherence', title: t('Adherence (%)') },
      { ref: svgRefs.restingHR, key: 'restingHR', title: t('Resting Heart Rate') },
      { ref: svgRefs.sleep, key: 'sleep', title: t('Sleep Schedule and Duration') },
      { ref: svgRefs.hrZones, key: 'hrZones', title: t('Heart Rate Zones per Day') },
      { ref: svgRefs.floors, key: 'floors', title: t('Floors Climbed') },
      { ref: svgRefs.steps, key: 'steps', title: t('Daily Steps') },
      { ref: svgRefs.distance, key: 'distance', title: t('Distance Traveled') },
      { ref: svgRefs.breathing, key: 'breathing', title: t('Breathing Rate (breaths/min)') },
      { ref: svgRefs.hrv, key: 'hrv', title: t('Heart Rate Variability (dailyRmssd in ms)') },
      { ref: svgRefs.weight, key: 'weight', title: t('Weight (kg)') },
      { ref: svgRefs.bloodPressure, key: 'bloodPressure', title: t('Blood Pressure (SYS/DIA)') },
      { ref: svgRefs.exercise, key: 'exercise', title: t('Exercise Summary') },
    ];

    let first = true;

    for (const { ref, key, title } of charts) {
      if (!selections[key]) continue;
      const svg = ref.current;
      if (!svg) continue;

      const url = await svgToImageDataUrl(svg);
      if (!first) doc.addPage();
      first = false;

      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const maxW = pageW - 60;
      const maxH = pageH - 90;

      const vb = (svg as any).viewBox?.baseVal;
      const sW = vb?.width || 800;
      const sH = vb?.height || 300;
      const scale = Math.min(maxW / sW, maxH / sH);

      const imgW = sW * scale;
      const imgH = sH * scale;

      doc.text(String(title), pageW / 2, 30, { align: 'center' });
      doc.addImage(url, 'PNG', (pageW - imgW) / 2, 50, imgW, imgH);
    }

    doc.save(
      `HealthCharts_${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}.pdf`
    );
    setShowExport(false);
  };

  return (
    <div className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={authStore.isAuthenticated} />

      <main className="flex-grow-1">
        <Container fluid className="py-4 px-2 px-md-4">
          <Row className="justify-content-center">
            <Col xs={12} xxl={10}>
              {/* Patient name */}
              {store.patientName && (
                <div className="mb-3">
                  <h4 className="mb-0">{store.patientName}</h4>
                </div>
              )}

              {/* Threshold load error (non-blocking) */}
              {store.thresholdsError && (
                <Alert variant="warning" className="mb-3" role="alert">
                  {store.thresholdsError}
                </Alert>
              )}

              {/* Controls */}
              <div className="mb-3">
                <HealthViewControls
                  store={store}
                  t={t}
                  formatRangeLabel={formatRangeLabel}
                  onExportClick={() => setShowExport(true)}
                />
              </div>

              {/* Error / Loading */}
              {store.error && (
                <Alert variant="danger" className="mb-3" role="alert">
                  {store.error}
                </Alert>
              )}

              {store.loading ? (
                <div className="d-flex justify-content-center align-items-center py-5">
                  <div className="text-center">
                    <Spinner animation="border" role="status" />
                    <div className="text-muted mt-2">{t('Loading')}...</div>
                  </div>
                </div>
              ) : (
                <HealthChartsAccordion
                  store={store}
                  t={t}
                  lang={(i18n.language || 'en').split('-')[0]}
                  svgRefs={svgRefs}
                />
              )}
            </Col>
          </Row>
        </Container>
      </main>

      <ExportModal
        show={showExport}
        onClose={() => setShowExport(false)}
        initialFrom={store.startDate}
        initialTo={store.endDate}
        selections={defaultSelections}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
      />

      <Footer />
    </div>
  );
});

export default HealthPage;
