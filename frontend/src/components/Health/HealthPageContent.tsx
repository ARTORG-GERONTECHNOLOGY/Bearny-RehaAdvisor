import React, { useEffect, useMemo, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import { observer } from 'mobx-react-lite';
import { Alert } from '@/components/ui/alert';
import { useTranslation } from 'react-i18next';

import ExportModal from '@/components/Health/ExportModal';
import HealthViewControls from '@/components/Health/HealthViewControls';
import HealthMetricsCards from '@/components/Health/HealthMetricsCards';

import { formatDateEU } from '@/utils/healthCharts';
import { buildHealthCsvBlob, buildHealthPdf } from '@/utils/healthExport';
import { toLocalYMD } from '@/utils/dateFormat';
import HealthPageStore from '@/stores/healthPageStore';
import { HealthPageContentLoadingSkeleton } from '@/components/skeletons/TherapistPatientDetailSkeleton';

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
  // Wrapped in useRef so the object identity is stable — HealthMetricsCards is an observer(),
  // and a fresh object every render would defeat its memoization.
  const svgRefs = useRef({
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
  }).current;

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
      toLocalYMD(store.startDate),
      toLocalYMD(store.endDate),
      t
    );
  }, [patientId, store, store.viewMode, store.referenceDate, t]);

  const formatRangeLabel = (start: Date, end: Date) =>
    `${formatDateEU(start)} — ${formatDateEU(end)}`;

  const handleExportCSV = (from: Date, to: Date, selections: Record<string, boolean>) => {
    const blob = buildHealthCsvBlob(store, from, to, selections, i18n.language);
    saveAs(blob, `HealthData_${toLocalYMD(from)}_to_${toLocalYMD(to)}.csv`);
    setShowExport(false);
  };

  const handleExportPDF = async (from: Date, to: Date, selections: Record<string, boolean>) => {
    const doc = await buildHealthPdf(store, svgRefs, from, to, selections, t, i18n.language);
    doc.save(`HealthCharts_${toLocalYMD(from)}_to_${toLocalYMD(to)}.pdf`);
    setShowExport(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {store.error && <Alert variant="destructive">{store.error}</Alert>}
      {store.thresholdsError && <Alert variant="warning">{store.thresholdsError}</Alert>}

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
