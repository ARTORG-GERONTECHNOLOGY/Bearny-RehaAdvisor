import React, { useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-bootstrap';

import authStore from '@/stores/authStore';
import { RehabTableStore } from '@/stores/rehabTableStore';

import InterventionLeftPanel from '@/components/RehaTablePage/InterventionLeftPanel';
import InterventionCalendar from '@/components/RehaTablePage/InterventionCalendar';

import PatientInterventionPopUp from '@/components/PatientPage/PatientInterventionPopUp';
import InterventionRepeatModal from '@/components/RehaTablePage/InterventionRepeatModal';
import InterventionStatsModal from '@/components/RehaTablePage/InterventionStatsModal';
import InterventionFeedbackModal from '@/components/RehaTablePage/InterventionFeedbackModal';
import '@/assets/styles/RehabTable.css';
import { RehabilitationPlanContentLoadingSkeleton } from '@/components/skeletons/TherapistPatientDetailSkeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface RehabilitationPlanContentProps {
  patientId: string;
}

const RehabilitationPlanContent: React.FC<RehabilitationPlanContentProps> = observer(
  ({ patientId }) => {
    const { t, i18n } = useTranslation();

    const store = useMemo(() => new RehabTableStore(), [patientId]);

    // keep tag translation in sync with current language
    useEffect(() => {
      store.translateTag = t;
      store.applyAllFilters();
    }, [store, t, i18n.language]);

    // init for this patient + cleanup
    useEffect(() => {
      if (!patientId) return;
      store.setUserLang(i18n.language || 'en');
      store.initForPatient(patientId, t as any);

      return () => {
        store.dispose();
      };
    }, [patientId, store]);

    // language changes
    useEffect(() => {
      store.setUserLang(i18n.language || 'en');
      store.translateVisibleItems();
    }, [i18n.language]);

    const refreshAfterScheduleChange = async () => {
      await Promise.all([store.fetchAll(t as any), store.fetchInts(t as any)]);
      store.patientData = (store as any).mergePlanWithCatalog(
        store.patientData,
        store.allInterventions
      );
      await store.translateVisibleItems();
    };

    return (
      <div>
        {store.error && (
          <Alert variant="danger" onClose={() => store.setError(null)} dismissible className="my-3">
            {store.error}
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
          {/* LEFT */}
          <div className="col-span-1 lg:col-span-4 xl:col-span-3">
            {store.loading ? (
              <RehabilitationPlanContentLoadingSkeleton />
            ) : (
              <InterventionLeftPanel
                data={{
                  activeItems: store.activePatientItems,
                  pastItems: store.pastPatientItems,
                  visibleItems: store.filteredRecommendations,
                  allItems: store.recommendations,
                  titleMap: store.titleMap,
                  typeMap: store.typeMap,
                  diagnoses: store.diagnoses,
                }}
                filters={{
                  searchTerm: store.searchTerm,
                  setSearchTerm: store.setSearchTerm,
                  patientTypeFilter: store.patientTypeFilter,
                  setPatientTypeFilter: store.setPatientTypeFilter,
                  contentTypeFilter: store.contentTypeFilter,
                  setContentTypeFilter: store.setContentTypeFilter,
                  tagFilter: store.tagFilter,
                  setTagFilter: store.setTagFilter,
                  benefitForFilter: store.benefitForFilter,
                  setBenefitForFilter: store.setBenefitForFilter,
                  languageFilter: store.languageFilter,
                  setLanguageFilter: store.setLanguageFilter,
                  resetAllFilters: store.resetAllFilters,
                }}
                actions={{
                  handleExerciseClick: store.handleExerciseClick,
                  showStats: store.showStats,
                  openFeedbackBrowser: store.openFeedbackBrowser,
                  handleModifyIntervention: store.openModifyIntervention,
                  handleDeleteExercise: (id: string) => store.deleteExercise(id, t as any),
                  handleAddIntervention: store.openAddIntervention,
                }}
                patientData={store.patientData as any}
                t={t as any}
              />
            )}
          </div>

          {/* RIGHT */}
          <div className="col-span-1 lg:col-span-8 xl:col-span-9 flex flex-col">
            <Card className="flex flex-col flex-1 min-h-0">
              <CardHeader>
                <CardTitle>{t('Reha Calendar')}</CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-1">
                  {t('Status')}:
                  <Badge variant="dashboard" className="bg-ok/5 border-ok text-ok">
                    {t('Completed')}
                  </Badge>
                  <Badge variant="dashboard" className="bg-nok/5 border-nok text-nok">
                    {t('Missed')}
                  </Badge>
                  <Badge variant="dashboard" className="bg-blue-50 border-blue-500 text-blue-500">
                    {t('today')}
                  </Badge>
                  <Badge
                    variant="dashboard"
                    className="bg-chartMuted/5 border-chartMuted text-zinc-500"
                  >
                    {t('Upcoming')}
                  </Badge>
                </CardDescription>
              </CardHeader>
              <CardContent className="rehaCalendarWrap">
                <InterventionCalendar
                  patientData={store.patientData as any}
                  titleMap={store.titleMap}
                  onSelectIntervention={store.handleExerciseClick}
                  onSelectFeedback={store.openFeedbackBrowser}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* INFO POPUP */}
        {store.showInfoInterventionModal && store.selectedExerciseFromPlan && (
          <PatientInterventionPopUp
            show
            item={store.selectedExerciseFromPlan as any}
            handleClose={store.closeInfoModal}
          />
        )}

        {/* REPEAT MODAL */}
        {store.showRepeatModal && store.selectedExerciseFromPlan && (
          <InterventionRepeatModal
            show
            onHide={store.closeRepeatModal}
            mode={store.repeatMode}
            intervention={store.selectedExerciseFromPlan as any}
            defaults={store.modifyDefaults}
            patient={store.patientIdForCalls}
            therapistId={authStore.id || undefined}
            onSuccess={async () => {
              await refreshAfterScheduleChange();
            }}
          />
        )}

        {/* STATS MODAL */}
        {store.showExerciseStats && store.selectedExerciseFromPlan && (
          <InterventionStatsModal
            show
            onHide={store.closeStatsModal}
            intervention={store.selectedExerciseFromPlan as any}
            patientData={store.patientData as any}
          />
        )}

        {/* FEEDBACK MODAL */}
        {store.showFeedbackBrowser && store.feedbackBrowserIntervention && (
          <InterventionFeedbackModal
            show
            onHide={store.closeFeedbackBrowser}
            intervention={store.feedbackBrowserIntervention as any}
            initialDatetime={store.feedbackInitialDatetime ?? undefined}
          />
        )}
      </div>
    );
  }
);

export default RehabilitationPlanContent;
