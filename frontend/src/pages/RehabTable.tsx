import React, { useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Col, Row, Spinner } from 'react-bootstrap';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';

import authStore from '../stores/authStore';
import { RehabTableStore } from '../stores/rehabTableStore';

import InterventionLeftPanel from '../components/RehaTablePage/InterventionLeftPanel';
import InterventionCalendar from '../components/RehaTablePage/InterventionCalendar';

import RehaPageLayout from '../components/RehaTablePage/layout/RehaPageLayout';
import RehaLeftPanelShell from '../components/RehaTablePage/layout/RehaLeftPanelShell';
import RehaCalendarPanelShell from '../components/RehaTablePage/layout/RehaCalendarPanelShell';

import PatientInterventionPopUp from '../components/PatientPage/PatientInterventionPopUp';
import InterventionRepeatModal from '../components/RehaTablePage/InterventionRepeatModal';
import InterventionStatsModal from '../components/RehaTablePage/InterventionStatsModal';
import InterventionFeedbackModal from '../components/RehaTablePage/InterventionFeedbackModal';
import '../assets/styles/RehabTable.css';
import { generateTagColors, getTaxonomyTags } from '../utils/interventions';

const safeT = (t: any, key: string, fallback: string) => {
  try {
    const v = typeof t === 'function' ? t(key, { defaultValue: fallback }) : fallback;
    return typeof v === 'string' ? v : fallback;
  } catch {
    return fallback;
  }
};

const RehabTable: React.FC = observer(() => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const store = useMemo(() => new RehabTableStore(), []);

  // auth + init
  useEffect(() => {
    authStore.checkAuthentication();
    if (!authStore.isAuthenticated) {
      navigate('/');
      return;
    }

    store.setUserLang(i18n.language || 'en');
    store.init(navigate, t as any);

    return () => {
      store.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, store]);

  // language changes
  useEffect(() => {
    store.setUserLang(i18n.language || 'en');
    store.translateVisibleItems(i18n.language || 'en');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language]);

  const calendarTitle = safeT(t, 'Calendar', 'Calendar');

  // ✅ Central refresh function (used after successful submit)
  const refreshAfterScheduleChange = async () => {
    await Promise.all([store.fetchAll(t as any), store.fetchInts(t as any)]);
    store.patientData = (store as any).mergePlanWithCatalog(store.patientData, store.allInterventions);
    await store.translateVisibleItems(store.userLang);
  };

  return (
    <div className="rehaPage">
      <Header isLoggedIn={authStore.isAuthenticated} />

      <main className="rehaPage__content">
        <RehaPageLayout>
          {store.patientName ? (
            <div className="rehaPatientHeader">
              <div className="rehaPatientHeader__name">{store.patientName}</div>
            </div>
          ) : null}

          {store.error ? (
            <Alert
              variant="danger"
              onClose={() => store.setError(null)}
              dismissible
              className="mb-3"
            >
              {store.error}
            </Alert>
          ) : null}

          <Row className="rehaGrid g-3">
            {/* LEFT */}
            <Col xs={12} lg={4} xl={3} className="rehaCol rehaCol--left">
              <RehaLeftPanelShell>
                {store.loading ? (
                  <div className="p-3 d-flex align-items-center gap-2">
                    <Spinner animation="border" size="sm" />
                    <span className="text-muted">{safeT(t, 'Loading', 'Loading')}…</span>
                  </div>
                ) : (
                  <InterventionLeftPanel
                    tagColors={generateTagColors(getTaxonomyTags())}
                    selectedTab={store.selectedTab}
                    setSelectedTab={(tab) => {
                      store.setSelectedTab(tab);
                      store.translateVisibleItems(store.userLang);
                    }}
                    data={{
                      activeItems: store.activePatientItems,
                      pastItems: store.pastPatientItems,
                      visibleItems: store.filteredRecommendations,
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
              <RehaCalendarPanelShell title={calendarTitle}>
                <div className="rehaCalendarWrap">
                  <InterventionCalendar
                    patientData={store.patientData as any}
                    titleMap={store.titleMap}
                    onSelectIntervention={store.handleExerciseClick}
                  />
                </div>
              </RehaCalendarPanelShell>
            </Col>
          </Row>
        </RehaPageLayout>
      </main>

      {/* INFO POPUP */}
      {store.showInfoInterventionModal && store.selectedExerciseFromPlan ? (
        <PatientInterventionPopUp
          show
          item={store.selectedExerciseFromPlan as any}
          handleClose={store.closeInfoModal}
        />
      ) : null}

      {/* ✅ REPEAT MODAL (UPDATED) */}
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
          t={t as any}
        />
      ) : null}

      <Footer />
    </div>
  );
});

export default RehabTable;