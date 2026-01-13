/* eslint-disable */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Container, Row, Col, Button, Card, Form } from 'react-bootstrap';
import Accordion from 'react-bootstrap/Accordion';
import jsPDF from 'jspdf';
import { saveAs } from 'file-saver';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import authStore from '../stores/authStore';

import MetricBarOrBox from '../components/Health/charts/MetricBarOrBox';
import SleepChart from '../components/Health/charts/SleepChart';
import HRZonesStacked from '../components/Health/charts/HRZonesStacked';
import QuestionnaireTotal from '../components/Health/charts/QuestionnaireTotal';
import QuestionnaireLines from '../components/Health/charts/QuestionnaireLines';
import ExportModal from '../components/Health/ExportModal';
import AdherenceLine from '../components/Health/charts/AdherenceLine';

import WeightChart from '../components/Health/charts/WeightChart';
import BloodPressureChart from '../components/Health/charts/BloodPressureChart';
import ExerciseSessionsChart from '../components/Health/charts/ExerciseSessionsChart';
import ExerciseSessionsTable from '../components/Health/charts/ExerciseSessionsTable';

import type { AdherenceEntry } from '../types/health';
import { FitbitEntry, QuestionnaireEntry, ChartRes, ViewMode } from '../types/health';
import { isInRange, svgToImageDataUrl } from '../utils/healthCharts';

/* --------- helpers for European date formatting ---------- */

const toEuroDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  const [y, m, d] = parts;
  return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`;
};

const formatDateEU = (d: Date): string => {
  return toEuroDate(d.toISOString().slice(0, 10));
};

const HealthPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  // viewing controls
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [chartRes, setChartRes] = useState<ChartRes>('daily');
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  const [patientName, setPatientName] = useState<string | null>(null);
  const [adherenceData, setAdherenceData] = useState<AdherenceEntry[]>([]);

  // derived view window (data range)
  const [startDate, endDate] = useMemo(() => {
    let start: Date, end: Date;
    if (viewMode === 'weekly') {
      const d = new Date(referenceDate);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      start = new Date(d.getFullYear(), d.getMonth(), diff);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    } else {
      start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
      end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
    }
    return [start, end];
  }, [referenceDate, viewMode]);

  // view label window (for header display)
  const [viewStart, viewEnd] = useMemo(() => {
    let start: Date, end: Date;
    if (viewMode === 'weekly') {
      const d = new Date(referenceDate);
      const day = d.getDay();
      const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
      start = new Date(d.getFullYear(), d.getMonth(), diffToMon);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    } else {
      start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
      end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
    }
    return [start, end];
  }, [referenceDate, viewMode]);

  const goPrev = () =>
    setReferenceDate((p) => {
      const d = new Date(p);
      if (viewMode === 'weekly') d.setDate(d.getDate() - 7);
      else d.setMonth(d.getMonth() - 1);
      return d;
    });

  const goNext = () =>
    setReferenceDate((p) => {
      const d = new Date(p);
      if (viewMode === 'weekly') d.setDate(d.getDate() + 7);
      else d.setMonth(d.getMonth() + 1);
      return d;
    });

  // data
  const [fitbitData, setFitbitData] = useState<FitbitEntry[]>([]);
  const [questionnaireData, setQuestionnaireData] = useState<QuestionnaireEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    authStore.checkAuthentication();
    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
      return;
    }
    const storedName = localStorage.getItem('selectedPatientName');
    if (storedName) setPatientName(storedName);

    const fetchData = async (from: Date, to: Date) => {
      const userId = localStorage.getItem('selectedPatient');
      const params = {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      };
      try {
        const res = await axios.get(
          `/api/patients/health-combined-history/${userId}/`,
          { params }
        );

        // Fitbit data now lives in `data`
        const normalizedFitbit = (res.data.fitbit || []).map((d: any) => ({
  ...d,
  exercise: Array.isArray(d.exercise)
    ? { sessions: d.exercise }
    : d.exercise,
}));

setFitbitData(normalizedFitbit);

        setQuestionnaireData(res.data.questionnaire || []);
        setAdherenceData(res.data.adherence || []);
      } catch {
        setError(t('Failed to load health data.'));
      }
    };
    fetchData(startDate, endDate);
  }, [navigate, t, startDate, endDate]);

  // questionnaire visibility toggles
  const [visibleQuestions, setVisibleQuestions] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const vis: Record<string, boolean> = {};
    for (const q of questionnaireData) {
      if (!(q.questionKey in vis)) vis[q.questionKey] = true;
    }
    setVisibleQuestions(vis);
  }, [questionnaireData]);

  useMemo(() => {
    // keep meta map up-to-date (used by your sidebar if any)
    const map: Record<string, { label: string; key: string }> = {};
    for (const entry of questionnaireData) {
      if (!entry.questionKey || map[entry.questionKey]) continue;
      const label =
        entry.questionTranslations?.find((tt) => tt.language === i18n.language)?.text ||
        entry.questionTranslations?.find((tt) => tt.language === 'en')?.text ||
        entry.questionKey;
      map[entry.questionKey] = { label, key: entry.questionKey };
    }
    return map;
  }, [questionnaireData, i18n.language]);

  // chart refs for PDF
  const svgRefs = {
    adherence: useRef<SVGSVGElement>(null),
    totalScore: useRef<SVGSVGElement>(null),
    questionnaire: useRef<SVGSVGElement>(null),
    restingHR: useRef<SVGSVGElement>(null),
    sleep: useRef<SVGSVGElement>(null),
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

  // ── Export modal state ───────────────────────────────────────────────────────
  const [showExport, setShowExport] = useState(false);
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

  // CSV export using values coming from the modal
  const handleExportCSV = (
    from: Date,
    to: Date,
    selections: Record<string, boolean>
  ) => {
    const delim = ';';

    const csvEscape = (v: unknown) => {
      const s = String(v ?? '');
      const needsQuotes = /[",\n;]/.test(s);
      const escaped = s.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };

    const emitRows2 = (
      header: string[],
      rows: (string | number | null | undefined)[][]
    ) =>
      [header, ...rows]
        .map((line) => line.map(csvEscape).join(delim))
        .join('\n') + '\n\n';

    let csv = '';

    // Filter by selected window once
    const fitIn = fitbitData.filter((d) => isInRange(d.date, from, to));
    const qIn = questionnaireData.filter((d) => isInRange(d.date, from, to));

    // ----- Total questionnaire score per day -----
    if (selections.totalScore && qIn.length) {
      const grouped = d3.groups(qIn, (d) => d.date.slice(0, 10));
      grouped.sort((a, b) => a[0].localeCompare(b[0]));
      const rows = grouped.map(([date, entries]) => {
        const score = d3.sum(entries, (e) =>
          parseInt(e.answers?.[0]?.key || '0', 10)
        );
        return [toEuroDate(date), score];
      });
      csv += emitRows2(['Date', 'Total Score'], rows);
    }

    // ----- Adherence (uses current chartRes) -----
    if (selections.adherence) {
      const startOfWeek = (d: Date) => {
        const x = new Date(d);
        const day = x.getDay();
        const diff = x.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(x.getFullYear(), x.getMonth(), diff);
      };
      const ymKey = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const adIn = adherenceData.filter((d) => isInRange(d.date, from, to));

      type Row = {
        label: string; // ISO date or "YYYY-MM"
        sched: number;
        comp: number;
        pct: number | null;
        sort: Date;
      };

      let rows: Row[] = [];

      if (chartRes === 'daily') {
        rows = adIn
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((d) => {
            const dt = new Date(d.date);
            return {
              label: d.date,
              sched: d.scheduled ?? 0,
              comp: d.completed ?? 0,
              pct: d.pct ?? null,
              sort: dt,
            };
          });
      } else if (chartRes === 'weekly') {
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
          const key = ymKey(dt); // YYYY-MM
          if (!map.has(key))
            map.set(key, {
              sched: 0,
              comp: 0,
              d: new Date(dt.getFullYear(), dt.getMonth(), 1),
            });
          const v = map.get(key)!;
          v.sched += d.scheduled ?? 0;
          v.comp += d.completed ?? 0;
        });
        rows = [...map.values()]
          .sort((a, b) => a.d.getTime() - b.d.getTime())
          .map((v) => ({
            label: ymKey(v.d), // YYYY-MM
            sched: v.sched,
            comp: v.comp,
            pct: v.sched > 0 ? Math.round((100 * v.comp) / v.sched) : null,
            sort: v.d,
          }));
      }

      const out = rows.map((r) => {
        let label = r.label;
        if (chartRes === 'monthly') {
          const [y, m] = r.label.split('-');
          label = `01.${m}.${y}`; // represent month as first day
        } else {
          label = toEuroDate(r.label);
        }
        return [
          label,
          r.sched,
          r.comp,
          r.pct != null ? r.pct : '',
        ];
      });

      csv += emitRows2(
        ['Date/Period', 'Scheduled', 'Completed', 'Adherence (%)'],
        out
      );
    }

    // ----- Questionnaire rows -----
    if (selections.questionnaire) {
      const rows: (string | number)[][] = [];
      for (const e of qIn) {
        if (!visibleQuestions[e.questionKey]) continue;
        const key = e.answers?.[0]?.key ?? '';
        const text =
          e.answers?.[0]?.translations?.find(
            (x) => x.language === i18n.language
          )?.text ||
          e.answers?.[0]?.translations?.find((x) => x.language === 'en')?.text ||
          key;
        rows.push([toEuroDate(e.date.slice(0, 10)), e.questionKey, key, text]);
      }
      csv += emitRows2(
        ['Date', 'Question Key', 'Answer Key', 'Answer Text'],
        rows
      );
    }

    // Helper: scalar time series
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
        fitIn.map((d) => ({ date: d.date, val: d.resting_heart_rate }))
      );
    if (selections.steps)
      csv += emitScalar(
        'Steps',
        fitIn.map((d) => ({ date: d.date, val: d.steps }))
      );
    if (selections.distance)
      csv += emitScalar(
        'Distance',
        fitIn.map((d) => ({ date: d.date, val: d.distance }))
      );
    if (selections.floors)
      csv += emitScalar(
        'Floors',
        fitIn.map((d) => ({ date: d.date, val: d.floors }))
      );
    if (selections.breathing)
      csv += emitScalar(
        'Breathing Rate',
        fitIn.map((d: any) => ({
          date: d.date,
          val: d.breathing_rate?.breathingRate,
        }))
      );
    if (selections.hrv)
      csv += emitScalar(
        'HRV (dailyRmssd)',
        fitIn.map((d: any) => ({
          date: d.date,
          val: d.hrv?.dailyRmssd,
        }))
      );

    if (selections.sleep) {
      const rows = fitIn
        .filter((d: any) => d.sleep?.sleep_duration != null)
        .map((d: any) => {
          const h = (d.sleep.sleep_duration / 3600000).toFixed(2); // hours
          return [
            toEuroDate(d.date.slice(0, 10)),
            d.sleep.sleep_start ?? '',
            d.sleep.sleep_end ?? '',
            h,
          ];
        })
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      if (rows.length)
        csv += emitRows2(
          ['Date', 'Sleep Start', 'Sleep End', 'Duration (h)'],
          rows
        );
    }

    if (selections.hrZones) {
      const rows: (string | number)[][] = [];
      fitIn.forEach((d) =>
        (d.heart_rate_zones || []).forEach((z: any) => {
          rows.push([
            toEuroDate(d.date.slice(0, 10)),
            z.name,
            z.minutes,
            z.min ?? '',
            z.max ?? '',
          ]);
        })
      );
      rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      if (rows.length)
        csv += emitRows2(
          ['Date', 'Zone', 'Minutes', 'Min HR', 'Max HR'],
          rows
        );
    }

    // NEW: Weight time series
    if (selections.weight) {
      const rows = fitIn
        .filter((d: any) => d.weight_kg != null)
        .map((d: any) => [toEuroDate(d.date.slice(0, 10)), d.weight_kg as number])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      if (rows.length)
        csv += emitRows2(['Date', 'Weight (kg)'], rows);
    }

    // NEW: Blood pressure time series (SYS + DIA)
    if (selections.bloodPressure) {
      const rows = fitIn
        .filter((d: any) => d.bp_sys != null || d.bp_dia != null)
        .map((d: any) => [
          toEuroDate(d.date.slice(0, 10)),
          d.bp_sys != null ? d.bp_sys : '',
          d.bp_dia != null ? d.bp_dia : '',
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      if (rows.length)
        csv += emitRows2(
          ['Date', 'Systolic (mmHg)', 'Diastolic (mmHg)'],
          rows
        );
    }

    // NEW: Exercise sessions (duration in minutes)
    if (selections.exercise) {
      const rows: (string | number | null)[][] = [];
      fitIn.forEach((d: any) => {
        const sessions = d.exercise?.sessions || [];
        sessions.forEach((s: any) => {
          const durMin =
            s.duration != null ? (s.duration as number) / 60000 : null;
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
      if (rows.length)
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

    const blob = new Blob([`\ufeff${csv}`], {
      type: 'text/csv;charset=utf-8;',
    });
    saveAs(
      blob,
      `HealthData_${from.toISOString().slice(0, 10)}_to_${to
        .toISOString()
        .slice(0, 10)}.csv`
    );
    setShowExport(false);
  };

  // PDF export using values coming from the modal
  const handleExportPDF = async (
    from: Date,
    to: Date,
    selections: Record<string, boolean>
  ) => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: 'a4',
    });
    const charts = [
      { ref: svgRefs.adherence, key: 'adherence', title: t('Adherence (%)') },
      {
        ref: svgRefs.totalScore,
        key: 'totalScore',
        title: t('Total Questionnaire Score Per Day'),
      },
      {
        ref: svgRefs.questionnaire,
        key: 'questionnaire',
        title: t('Questionnaire Answers Over Time'),
      },
      {
        ref: svgRefs.restingHR,
        key: 'restingHR',
        title: t('Resting Heart Rate'),
      },
      {
        ref: svgRefs.sleep,
        key: 'sleep',
        title: t('Sleep Schedule and Duration'),
      },
      {
        ref: svgRefs.hrZones,
        key: 'hrZones',
        title: t('Heart Rate Zones per Day'),
      },
      {
        ref: svgRefs.floors,
        key: 'floors',
        title: t('Floors Climbed'),
      },
      {
        ref: svgRefs.steps,
        key: 'steps',
        title: t('Daily Steps'),
      },
      {
        ref: svgRefs.distance,
        key: 'distance',
        title: t('Distance Traveled'),
      },
      {
        ref: svgRefs.breathing,
        key: 'breathing',
        title: t('Breathing Rate (breaths/min)'),
      },
      {
        ref: svgRefs.hrv,
        key: 'hrv',
        title: t('Heart Rate Variability (dailyRmssd in ms)'),
      },
      {
        ref: svgRefs.weight,
        key: 'weight',
        title: t('Weight (kg)'),
      },
      {
        ref: svgRefs.bloodPressure,
        key: 'bloodPressure',
        title: t('Blood Pressure (SYS/DIA)'),
      },
      {
        ref: svgRefs.exercise,
        key: 'exercise',
        title: t('Exercise Summary'),
      },
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
      `HealthCharts_${from.toISOString().slice(0, 10)}_to_${to
        .toISOString()
        .slice(0, 10)}.pdf`
    );
    setShowExport(false);
  };

  return (
    <div className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={authStore.isAuthenticated} />
      <Container fluid className="mt-4">
        {patientName && (
          <Row className="mb-2 justify-content-center">
            <Col>
              <h4 className="text-center">{patientName}</h4>
            </Col>
          </Row>
        )}

        {/* Viewing controls */}
        <Card className="mx-auto mb-4" style={{ width: '80%', minWidth: 320 }}>
          <Card.Body>
            <Row className="mb-3 justify-content-center">
              <Col md={3} className="align-items-center justify-content-between">
                <div className="d-flex align-items-center justify-content-between">
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={goPrev}
                  >
                    ‹
                  </Button>
                  <div className="mx-2 fw-bold d-block text-center flex-grow-1">
                    {formatDateEU(viewStart)} &mdash; {formatDateEU(viewEnd)}
                  </div>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={goNext}
                  >
                    ›
                  </Button>
                </div>
              </Col>
            </Row>
            <Row className="align-items-end g-3">
              <Col md={4}>
                <Form.Label className="fw-bold">{t('View Mode')}</Form.Label>
                <Form.Select
                  value={viewMode}
                  onChange={(e) =>
                    setViewMode(e.target.value as ViewMode)
                  }
                >
                  <option value="weekly">{t('Weekly')}</option>
                  <option value="monthly">{t('Monthly')}</option>
                </Form.Select>
              </Col>

              <Col md={5}>
                <Form.Label className="fw-bold">
                  {t('Chart Resolution')}
                </Form.Label>
                <div
                  className="btn-group d-flex"
                  role="group"
                  aria-label="Chart resolution"
                >
                  {(['daily', 'weekly', 'monthly'] as ChartRes[]).map((r) => (
                    <Button
                      key={r}
                      size="sm"
                      className="text-capitalize"
                      variant={
                        chartRes === r ? 'primary' : 'outline-primary'
                      }
                      onClick={() => setChartRes(r)}
                    >
                      {t(r.charAt(0).toUpperCase() + r.slice(1))}
                    </Button>
                  ))}
                </div>
              </Col>
              <Col className="text-end">
                <Button
                  variant="primary"
                  onClick={() => setShowExport(true)}
                >
                  <i className="bi bi-box-arrow-up-right me-1" />{' '}
                  {t('Export…')}
                </Button>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {error && <div className="alert alert-danger">{error}</div>}

        {/* Charts centered at 80% width */}
        <div
          className="mx-auto mb-4"
          style={{ width: '80%', minWidth: 320 }}
        >
          <Accordion defaultActiveKey={['0']} alwaysOpen>
            <Accordion.Item eventKey="0">
              <Accordion.Header>{t('Adherence')}</Accordion.Header>
              <Accordion.Body className="d-flex justify-content-center">
                <AdherenceLine
                  ref={svgRefs.adherence}
                  data={adherenceData}
                  res={chartRes}
                  start={startDate}
                  end={endDate}
                />
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="1">
              <Accordion.Header>
                {t('Summary of Questionaire Scores')}
              </Accordion.Header>
              <Accordion.Body className="d-flex justify-content-center">
                <QuestionnaireTotal
                  ref={svgRefs.totalScore}
                  data={questionnaireData}
                  res={chartRes}
                  start={startDate}
                  end={endDate}
                />
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="2">
              <Accordion.Header>{t('Questions')}</Accordion.Header>
              <Accordion.Body>
                <QuestionnaireLines
                  ref={svgRefs.questionnaire}
                  data={questionnaireData}
                  visibleKeys={visibleQuestions}
                  start={startDate}
                  end={endDate}
                />
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="3">
              <Accordion.Header>{t('Resting HR')}</Accordion.Header>
              <Accordion.Body className="d-flex justify-content-center">
                <MetricBarOrBox
                  ref={svgRefs.restingHR}
                  titleKey="Resting Heart Rate"
                  data={fitbitData}
                  accessor={(d) => d.resting_heart_rate}
                  res={chartRes}
                  start={startDate}
                  end={endDate}
                />
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="4">
              <Accordion.Header>{t('Sleep')}</Accordion.Header>
              <Accordion.Body className="d-flex justify-content-center">
                <SleepChart
                  ref={svgRefs.sleep}
                  data={fitbitData}
                  start={startDate}
                  end={endDate}
                />
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="5">
              <Accordion.Header>{t('HR Zones')}</Accordion.Header>
              <Accordion.Body className="d-flex justify-content-center">
                <HRZonesStacked
                  ref={svgRefs.hrZones}
                  data={fitbitData}
                  start={startDate}
                  end={endDate}
                />
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="6">
              <Accordion.Header>{t('Floors')}</Accordion.Header>
              <Accordion.Body className="d-flex justify-content-center">
                <MetricBarOrBox
                  ref={svgRefs.floors}
                  titleKey="Floors Climbed"
                  data={fitbitData}
                  accessor={(d) => d.floors}
                  res={chartRes}
                  start={startDate}
                  end={endDate}
                />
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="7">
              <Accordion.Header>{t('Steps')}</Accordion.Header>
              <Accordion.Body className="d-flex justify-content-center">
                <MetricBarOrBox
                  ref={svgRefs.steps}
                  titleKey="Daily Steps"
                  data={fitbitData}
                  accessor={(d) => d.steps}
                  res={chartRes}
                  start={startDate}
                  end={endDate}
                />
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="8">
              <Accordion.Header>{t('Distance')}</Accordion.Header>
              <Accordion.Body className="d-flex justify-content-center">
                <MetricBarOrBox
                  ref={svgRefs.distance}
                  titleKey="Distance Traveled (km)"
                  data={fitbitData}
                  accessor={(d) => d.distance}
                  res={chartRes}
                  start={startDate}
                  end={endDate}
                />
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="9">
              <Accordion.Header>{t('Breathing')}</Accordion.Header>
              <Accordion.Body className="d-flex justify-content-center">
                <MetricBarOrBox
                  ref={svgRefs.breathing}
                  titleKey="Breathing Rate (breaths/min)"
                  data={fitbitData}
                  accessor={(d) => d.breathing_rate?.breathingRate}
                  res={chartRes}
                  start={startDate}
                  end={endDate}
                />
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="10">
              <Accordion.Header>{t('HRV')}</Accordion.Header>
              <Accordion.Body className="d-flex justify-content-center">
                <MetricBarOrBox
                  ref={svgRefs.hrv}
                  titleKey="Heart Rate Variability (dailyRmssd in ms)"
                  data={fitbitData}
                  accessor={(d) => d.hrv?.dailyRmssd}
                  res={chartRes}
                  start={startDate}
                  end={endDate}
                />
              </Accordion.Body>
            </Accordion.Item>

            {/* NEW: Weight chart */}
            <Accordion.Item eventKey="11">
              <Accordion.Header>{t('Weight')}</Accordion.Header>
              <Accordion.Body className="d-flex justify-content-center">
                <WeightChart
                  ref={svgRefs.weight}
                  data={fitbitData}
                  start={startDate}
                  end={endDate}
                />
              </Accordion.Body>
            </Accordion.Item>

            {/* NEW: Blood pressure chart (SYS + DIA combined) */}
            <Accordion.Item eventKey="12">
              <Accordion.Header>{t('Blood Pressure')}</Accordion.Header>
              <Accordion.Body className="d-flex justify-content-center">
                <BloodPressureChart
                  ref={svgRefs.bloodPressure}
                  data={fitbitData}
                  start={startDate}
                  end={endDate}
                />
              </Accordion.Body>
            </Accordion.Item>

            {/* NEW: Exercise summary chart */}
<Accordion.Item eventKey="13">
              <Accordion.Header>{t('Exercises')}</Accordion.Header>
              <Accordion.Body>
                <Row>
                  <Col md={7} className="mb-3">
                    <ExerciseSessionsChart
                      ref={svgRefs.exercise}
                      data={fitbitData}
                      start={startDate}
                      end={endDate}
                    />
                  </Col>
                  <Col md={5}>
                    <ExerciseSessionsTable
                      data={fitbitData}
                      start={startDate}
                      end={endDate}
                    />
                  </Col>
                </Row>
              </Accordion.Body>
            </Accordion.Item>
          </Accordion>
        </div>
      </Container>

      {/* Export pop-up */}
      <ExportModal
        show={showExport}
        onClose={() => setShowExport(false)}
        initialFrom={startDate}
        initialTo={endDate}
        selections={defaultSelections}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
      />

      <Footer />
    </div>
  );
};

export default HealthPage;
