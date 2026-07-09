import React, { useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Alert, Col, Row } from 'react-bootstrap';

import authStore from '@/stores/authStore';
import { RehabTableStore } from '@/stores/rehabTableStore';

import InterventionLeftPanel from '@/components/RehaTablePage/InterventionLeftPanel';
import InterventionCalendar from '@/components/RehaTablePage/InterventionCalendar';
import RehaLeftPanelShell from '@/components/RehaTablePage/layout/RehaLeftPanelShell';
import RehaCalendarPanelShell from '@/components/RehaTablePage/layout/RehaCalendarPanelShell';

import PatientInterventionPopUp from '@/components/PatientPage/PatientInterventionPopUp';
import InterventionRepeatModal from '@/components/RehaTablePage/InterventionRepeatModal';
import InterventionStatsModal from '@/components/RehaTablePage/InterventionStatsModal';
import InterventionFeedbackModal from '@/components/RehaTablePage/InterventionFeedbackModal';
import '@/assets/styles/RehabTable.css';
import { generateTagColors, getTaxonomyTags } from '@/utils/interventions';
import { RehabilitationPlanContentLoadingSkeleton } from '@/components/skeletons/TherapistPatientDetailSkeleton';

const safeT = (t: any, key: string, fallback: string) => {
  try {
    const v = typeof t === 'function' ? t(key, { defaultValue: fallback }) : fallback;
    return typeof v === 'string' ? v : fallback;
  } catch {
    return fallback;
  }
};

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
      <div className="rehaLayout">
        {store.error && (
          <Alert variant="danger" onClose={() => store.setError(null)} dismissible className="my-3">
            {store.error}
          </Alert>
        )}

        <Row className="rehaGrid g-3">
          {/* LEFT */}
          <Col xs={12} lg={4} xl={3} className="rehaCol rehaCol--left">
            <RehaLeftPanelShell>
              {store.loading ? (
                <RehabilitationPlanContentLoadingSkeleton />
              ) : (
                <InterventionLeftPanel
                  tagColors={generateTagColors(getTaxonomyTags())}
                  selectedTab={store.selectedTab}
                  setSelectedTab={(tab) => {
                    store.setSelectedTab(tab);
                    store.translateVisibleItems();
                  }}
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
            </RehaLeftPanelShell>
          </Col>

          {/* RIGHT */}
          <Col xs={12} lg={8} xl={9} className="rehaCol rehaCol--right">
            <RehaCalendarPanelShell title={safeT(t, 'Reha Calendar', 'Reha Calendar')}>
              <div className="rehaCalendarWrap">
                <InterventionCalendar
                  patientData={store.patientData as any}
                  titleMap={store.titleMap}
                  onSelectIntervention={store.handleExerciseClick}
                  onSelectFeedback={store.openFeedbackBrowser}
                />
              </div>
            </RehaCalendarPanelShell>
          </Col>
        </Row>

        {/* INFO POPUP */}
        {store.showInfoInterventionModal && store.selectedExerciseFromPlan ? (
          <PatientInterventionPopUp
            show
            item={store.selectedExerciseFromPlan as any}
            handleClose={store.closeInfoModal}
          />
        ) : null}

        {/* REPEAT MODAL */}
        {store.showRepeatModal && store.selectedExerciseFromPlan ? (
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
        ) : null}

        {/* STATS MODAL */}
        {store.showExerciseStats && store.selectedExerciseFromPlan ? (
          <InterventionStatsModal
            show
            onHide={store.closeStatsModal}
            intervention={store.selectedExerciseFromPlan as any}
            patientData={store.patientData as any}
            t={t as any}
          />
        ) : null}

        {/* FEEDBACK MODAL */}
        {store.showFeedbackBrowser && store.feedbackBrowserIntervention ? (
          <InterventionFeedbackModal
            show
            onHide={store.closeFeedbackBrowser}
            intervention={store.feedbackBrowserIntervention as any}
            initialDatetime={store.feedbackInitialDatetime ?? undefined}
          />
        ) : null}
      </div>
    );
  }
);

export default RehabilitationPlanContent;
