import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import HealthPageStore from '@/stores/healthPageStore';
import { toLocalYMD } from '@/utils/dateFormat';
import { buildPatientHealthPdf } from '@/utils/patientHealthExport';
import type { PatientExportMetric } from '@/utils/patientHealthExport';

export function usePatientHealthExport(patientId: string | null) {
  const { t } = useTranslation();

  const [showModal, setShowModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const storeRef = useRef(new HealthPageStore());

  const openModal = () => {
    setError('');
    setShowModal(true);
  };
  const closeModal = () => setShowModal(false);

  const runExport = async (
    from: Date,
    to: Date,
    selections: Record<PatientExportMetric, boolean>
  ) => {
    if (!patientId) return;
    setError('');
    setExporting(true);

    try {
      const store = storeRef.current;
      await store.fetchCombinedHistoryForPatient(patientId, toLocalYMD(from), toLocalYMD(to), t);
      if (store.error) {
        setError(store.error);
        return;
      }

      const doc = buildPatientHealthPdf(store, from, to, selections, t);
      doc.save(`HealthData_${toLocalYMD(from)}_to_${toLocalYMD(to)}.pdf`);
      setShowModal(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('Failed to export health data.'));
    } finally {
      setExporting(false);
    }
  };

  return {
    showModal,
    openModal,
    closeModal,
    exporting,
    error,
    runExport,
  };
}
