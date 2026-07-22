import React, { useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import { appModeStore } from '@/stores/appModeStore';
import ErrorAlert from '@/components/common/ErrorAlert';
import { PatientPopupStore } from '@/stores/patientPopupStore';
import PatientInfoActionToolbar from './PatientInfoActionToolbar';
import PatientInfoWearablesSyncResult from './PatientInfoWearablesSyncResult';
import PatientInfoProfileCard from './PatientInfoProfileCard';
import PatientInfoCharacteristicsCard from './PatientInfoCharacteristicsCard';
import PatientInfoThresholdsCard from './PatientInfoThresholdsCard';
import PatientInfoRedcapCard from './PatientInfoRedcapCard';
import { PatientInfoContentLoadingSkeleton } from '@/components/skeletons/TherapistPatientDetailSkeleton';

interface PatientInfoContentProps {
  patientId: string;
}

const PatientInfoContent: React.FC<PatientInfoContentProps> = observer(({ patientId }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const store = useMemo(() => new PatientPopupStore(patientId), [patientId]);

  useEffect(() => {
    if (!patientId) return;
    store.fetchPatientData(t);
    store.fetchThresholds(t);
  }, [patientId, store]);

  return (
    <div>
      {store.loading ? (
        <PatientInfoContentLoadingSkeleton />
      ) : (
        <>
          {store.error && <ErrorAlert message={store.error} onClose={() => store.setError('')} />}

          {store.redcapError && (
            <div className="mb-3">
              <ErrorAlert message={store.redcapError} onClose={() => (store.redcapError = null)} />
            </div>
          )}

          {store.wearablesSyncError && (
            <div className="mb-3">
              <ErrorAlert
                message={store.wearablesSyncError}
                onClose={() => (store.wearablesSyncError = null)}
              />
            </div>
          )}

          <PatientInfoWearablesSyncResult store={store} />

          <PatientInfoActionToolbar store={store} onDeleted={() => navigate('/therapist')} />

          <div className="my-6 flex flex-wrap items-center gap-2 text-zinc-500 text-sm">
            <div>
              {t('Data mode')}:{' '}
              {store.hasManualInfo ? (
                <Badge variant="dashboard-success">{t('Manual preferred')}</Badge>
              ) : (
                <Badge variant="dashboard-info">{t('REDCap fallback')}</Badge>
              )}
            </div>

            {store.redcapProject && (
              <div>
                {t('REDCap Project')}: <Badge variant="dashboard-info">{store.redcapProject}</Badge>
              </div>
            )}
            {store.redcapIdentifier && (
              <span>
                {t('Identifier')}: <Badge variant="dashboard">{store.redcapIdentifier}</Badge>
              </span>
            )}
            {store.redcapRecordId && (
              <span>
                {t('Record ID')}: <Badge variant="dashboard">{store.redcapRecordId}</Badge>
              </span>
            )}
            {store.redcapPatId && (
              <span>
                {t('pat_id')}: <Badge variant="dashboard">{store.redcapPatId}</Badge>
              </span>
            )}
            {store.redcapDag && (
              <span>
                {t('DAG')}: <Badge variant="dashboard">{store.redcapDag}</Badge>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            <div className="md:col-start-1 md:row-start-1 xl:col-start-1">
              <PatientInfoProfileCard store={store} />
            </div>
            <div className="md:col-start-1 md:row-start-2 xl:col-start-2 xl:row-start-1">
              <PatientInfoCharacteristicsCard store={store} />
              <PatientInfoThresholdsCard store={store} />
            </div>
            {appModeStore.showRedcapTab && (
              <div className="md:col-start-2 md:row-start-1 md:row-span-2 xl:col-start-3 xl:row-span-1">
                <PatientInfoRedcapCard store={store} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});

export default PatientInfoContent;
