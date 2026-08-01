// src/utils/patientHealthExport.ts
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type HealthPageStore from '@/stores/healthPageStore';

import {
  toEuroDate,
  formatDateEU,
  scalarCaption,
  bloodPressureCaption,
} from '@/utils/healthCharts';
import { formatDurationMinutes } from '@/utils/dateFormat';
import { filterStepsInRange } from '@/components/Health/charts/StepsChart';
import { filterActiveMinutesInRange } from '@/components/Health/charts/ActiveMinutesChart';
import { filterSleepInRange } from '@/components/Health/charts/SleepChart';
import { filterBloodPressureInRange } from '@/components/Health/charts/BloodPressureChart';

export type PatientExportMetric = 'steps' | 'activeMinutes' | 'sleep' | 'bloodPressure';

type Section = {
  key: PatientExportMetric;
  title: string;
  caption: string | null;
  head: string[];
  rows: string[][];
};

export const buildPatientHealthPdf = (
  store: HealthPageStore,
  from: Date,
  to: Date,
  selections: Record<PatientExportMetric, boolean>,
  t: (k: string) => string
): jsPDF => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
  const fmt = (v: number, decimals = 0) => v.toFixed(decimals);

  const stepsRows = filterStepsInRange(store.fitbitData, from, to);
  const activeMinutesRows = filterActiveMinutesInRange(store.fitbitData, from, to);
  const sleepRows = filterSleepInRange(store.fitbitData, from, to);
  const bpRows = filterBloodPressureInRange(store.fitbitData, from, to);

  const sections: Section[] = [
    {
      key: 'steps',
      title: t('Daily Steps'),
      caption: scalarCaption(stepsRows, 'steps', (v) => Math.round(v).toLocaleString()),
      head: [t('Date'), t('Steps')],
      rows: stepsRows
        .filter((r) => r.steps != null)
        .map((r) => [toEuroDate(r.date), String(r.steps)]),
    },
    {
      key: 'activeMinutes',
      title: t('Active Minutes'),
      caption: scalarCaption(activeMinutesRows, 'activeMinutes', (v) => `${fmt(v)} ${t('min')}`),
      head: [t('Date'), t('Active Minutes')],
      rows: activeMinutesRows
        .filter((r) => r.activeMinutes != null)
        .map((r) => [toEuroDate(r.date), String(r.activeMinutes)]),
    },
    {
      key: 'sleep',
      title: t('Sleep Schedule and Duration'),
      caption: scalarCaption(sleepRows, 'minutesAsleep', formatDurationMinutes),
      head: [t('Date'), t('Duration (h)')],
      rows: sleepRows
        .filter((r) => r.minutesAsleep != null)
        .map((r) => [toEuroDate(r.date), (r.minutesAsleep! / 60).toFixed(2)]),
    },
    {
      key: 'bloodPressure',
      title: t('Blood pressure'),
      caption: bloodPressureCaption(bpRows, t, fmt),
      head: [t('Date'), t('Systolic (mmHg)'), t('Diastolic (mmHg)')],
      rows: bpRows
        .filter((r) => r.sys != null || r.dia != null)
        .map((r) => [
          toEuroDate(r.date),
          r.sys != null ? String(r.sys) : '',
          r.dia != null ? String(r.dia) : '',
        ]),
    },
  ];

  let first = true;

  for (const section of sections) {
    if (!selections[section.key]) continue;

    if (!first) doc.addPage();
    first = false;

    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(14);
    doc.text(section.title, pageW / 2, 30, { align: 'center' });

    doc.setFontSize(9);
    const rangeLine = `${formatDateEU(from)} – ${formatDateEU(to)}`;
    doc.text(rangeLine, pageW / 2, 46, { align: 'center' });
    if (section.caption) doc.text(section.caption, pageW / 2, 60, { align: 'center' });

    if (!section.rows.length) {
      doc.setFontSize(11);
      doc.text(t('No data available'), pageW / 2, 100, { align: 'center' });
      continue;
    }

    autoTable(doc, {
      startY: section.caption ? 74 : 60,
      head: [section.head],
      body: section.rows,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [0, 149, 108] },
      margin: { left: 30, right: 30 },
    });
  }

  return doc;
};
