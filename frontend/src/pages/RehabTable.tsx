import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Col, Nav, Row, Spinner } from 'react-bootstrap';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';

import authStore from '../stores/authStore';
import apiClient from '../api/client';
import { extractApiError, RehabTableStore } from '../stores/rehabTableStore';

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
import QuestionnairePanel from '../components/RehaTablePage/QuestionnairePanel';
import QuestionnaireScheduleModal from '../components/RehaTablePage/QuestionnaireScheduleModal';
import QuestionnaireBuilderModal from '../components/RehaTablePage/QuestionnaireBuilderModal';

const safeT = (t: any, key: string, fallback: string) => {
  try {
    const v = typeof t === 'function' ? t(key, { defaultValue: fallback }) : fallback;
    return typeof v === 'string' ? v : fallback;
  } catch {
    return fallback;
  }
};

type QItem = {
  _id: string;
  key: string;
  title: string;
  description?: string;
  tags?: string[];
  question_count?: number;
  created_by?: string | null;
  created_by_name?: string;
};

type QAssigned = {
  _id: string;
  title: string;
  description?: string;
  frequency?: string;
  dates?: string[];
  schedule?: {
    interval?: number;
    unit?: 'day' | 'week' | 'month';
    selectedDays?: string[];
    startTime?: string;
    end?: {
      type?: 'never' | 'date' | 'count';
      date?: string | null;
      count?: number | null;
    };
  };
};

const RehabTable: React.FC = observer(() => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const store = useMemo(() => new RehabTableStore(), []);
  const [questionnaires, setQuestionnaires] = useState<QItem[]>([]);
  const [assignedQuestionnaires, setAssignedQuestionnaires] = useState<QAssigned[]>([]);
  const [qModalOpen, setQModalOpen] = useState(false);
  const [qBuilderOpen, setQBuilderOpen] = useState(false);
  const [qMode, setQMode] = useState<'create' | 'modify'>('create');
  const [selectedQ, setSelectedQ] = useState<QItem | null>(null);
  const [qDefaults, setQDefaults] = useState<any>(null);

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

  // ✅ Central refresh function (used after successful submit)
  const refreshAfterScheduleChange = async () => {
    await Promise.all([store.fetchAll(t as any), store.fetchInts(t as any)]);
    store.patientData = (store as any).mergePlanWithCatalog(
      store.patientData,
      store.allInterventions
    );
    await store.translateVisibleItems(store.userLang);
  };

  const fetchQuestionnaires = useCallback(async () => {
    try {
      const res = await apiClient.get('/questionnaires/health/');
      const items: QItem[] = (Array.isArray(res.data) ? res.data : []).map((q: any) => ({
        _id: String(q._id),
        key: String(q.key),
        title: String(q.title),
        description: String(q.description || ''),
        tags: Array.isArray(q.tags) ? q.tags : [],
        question_count: Number(q.question_count || 0),
        created_by: q.created_by ? String(q.created_by) : null,
        created_by_name: String(q.created_by_name || ''),
      }));
      setQuestionnaires(items);
    } catch (e) {
      setQuestionnaires([]);
      store.setError(extractApiError(e, String(t('Failed to load questionnaires.'))));
    }
  }, [store, t]);

  const fetchAssignedQuestionnaires = useCallback(async () => {
    if (!store.patientIdForCalls) return;

    try {
      const res = await apiClient.get(`/questionnaires/patient/${store.patientIdForCalls}/`);
      const arr = Array.isArray(res.data) ? res.data : [];
      setAssignedQuestionnaires(arr as QAssigned[]);
    } catch (e) {
      setAssignedQuestionnaires([]);
      store.setError(extractApiError(e, String(t('Failed to load patient questionnaires.'))));
    }
  }, [store, t]);

  const openAddQ = useCallback((q: QItem) => {
    setQMode('create');
    setSelectedQ({ _id: q._id, key: q.key, title: q.title });
    setQDefaults({
      interval: 1,
      unit: 'month',
      selectedDays: [],
      end: { type: 'never' },
      startTime: '08:00',
    });
    setQModalOpen(true);
  }, []);

  const openModifyQ = useCallback(
    (q: QItem) => {
      const assigned = assignedQuestionnaires.find((a) => a._id === q._id);
      setQMode('modify');
      setSelectedQ({ _id: q._id, key: q.key, title: q.title });
      setQDefaults({
        effectiveFrom: new Date().toISOString().slice(0, 10),
        interval: assigned?.schedule?.interval ?? 1,
        unit: assigned?.schedule?.unit ?? 'month',
        selectedDays: assigned?.schedule?.selectedDays ?? [],
        startTime: assigned?.schedule?.startTime ?? '08:00',
        end: assigned?.schedule?.end ?? { type: 'never' },
      });
      setQModalOpen(true);
    },
    [assignedQuestionnaires]
  );

  const removeQ = useCallback(
    async (qid: string) => {
      if (!store.patientIdForCalls) return;

      try {
        await apiClient.post('/questionnaires/remove/', {
          patientId: store.patientIdForCalls,
          dynamicKey: qid,
          questionnaireId: qid,
        });
        await fetchAssignedQuestionnaires();
      } catch (e) {
        store.setError(extractApiError(e, String(t('Failed to remove questionnaire.'))));
      }
    },
    [fetchAssignedQuestionnaires, store, t]
  );

  useEffect(() => {
    if (store.topTab !== 'questionnaires') return;
    if (!store.patientIdForCalls) return;

    fetchQuestionnaires();
    fetchAssignedQuestionnaires();
  }, [
    fetchAssignedQuestionnaires,
    fetchQuestionnaires,
    store,
    store.patientIdForCalls,
    store.topTab,
  ]);

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

          <Row className="mb-3">
            <Col>
              <Nav
                variant="tabs"
                activeKey={store.topTab}
                onSelect={(k) => store.setTopTab((k as any) || 'interventions')}
              >
                <Nav.Item>
                  <Nav.Link eventKey="interventions">{t('Interventions')}</Nav.Link>
                </Nav.Item>
                <Nav.Item>
                  <Nav.Link eventKey="questionnaires">{t('Questionnaires')}</Nav.Link>
                </Nav.Item>
              </Nav>
            </Col>
          </Row>

          {store.topTab === 'interventions' ? (
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
                <RehaCalendarPanelShell title={safeT(t, 'Reha Calendar', 'Reha Calendar')}>
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
          ) : (
            <QuestionnairePanel
              data={{
                questionnaires,
                assignedQuestionnaires,
              }}
              actions={{
                openAddQ,
                openModifyQ,
                removeQ,
                openBuilder: () => setQBuilderOpen(true),
              }}
              t={t as any}
            />
          )}

          <QuestionnaireScheduleModal
            show={qModalOpen}
            mode={qMode}
            onHide={() => setQModalOpen(false)}
            onSuccess={async () => {
              setQModalOpen(false);
              await fetchAssignedQuestionnaires();
            }}
            patientId={store.patientIdForCalls}
            questionnaire={selectedQ}
            defaults={qDefaults}
          />

          <QuestionnaireBuilderModal
            show={qBuilderOpen}
            onHide={() => setQBuilderOpen(false)}
            onSuccess={async () => {
              await fetchQuestionnaires();
            }}
          />
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
