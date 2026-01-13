// src/pages/RehabTable.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Col, Container, Row, Nav, Card, Form, Badge,
  ButtonGroup, OverlayTrigger, Tooltip
} from 'react-bootstrap';
import InterventionFeedbackBrowserModal from '../components/RehaTablePage/InterventionFeedbackBrowserModal';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import authStore from '../stores/authStore';
import apiClient from '../api/client';
import { useTranslation } from 'react-i18next';
import Select from 'react-select';
import config from '../config/config.json';
import InterventionCalendar from '../components/RehaTablePage/InterventionCalendar';
import InterventionRepeatModal from '../components/RehaTablePage/InterventionRepeatModal';
import PatientInterventionPopUp from '../components/PatientPage/PatientInterventionPopUp';
import InterventionFeedbackModal from '../components/RehaTablePage/InterventionFeedbackModal';
import InterventionStatsModal from '../components/RehaTablePage/InterventionStatsModal';
import { Intervention } from '../types';
import ErrorAlert from '../components/common/ErrorAlert';
import { filterInterventions } from '../utils/filterUtils';
import { getBadgeVariantFromUrl, getMediaTypeLabelFromUrl } from '../utils/interventions';
import { translateText } from '../utils/translate';
import {
  FaPlus, FaMinus, FaChartBar, FaEdit, FaTrash, FaCommentDots, FaUndo, FaDownload
} from 'react-icons/fa';
import QuestionnaireScheduleModal from '../components/RehaTablePage/QuestionnaireScheduleModal';

// NEW COMPONENTS
import InterventionHeader from '../components/RehaTablePage/InterventionHeader';
import InterventionLeftPanel from '../components/RehaTablePage/InterventionLeftPanel';
import InterventionRightPanel from '../components/RehaTablePage/InterventionRightPanel';
import QuestionnairePanel from '../components/RehaTablePage/QuestionnairePanel';

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
type TitleMap = Record<string, { title: string; lang: string | null }>;
type TypeMap  = Record<string, string>;

type QItem = { _id: string; key: string; title: string; description?: string; tags?: string[]; question_count?: number };
type QAssigned = { _id: string; title: string; description?: string; frequency?: string; dates?: string[] };

type PatientPlan = { interventions: Intervention[] } & Record<string, any>;
const EMPTY_PLAN: PatientPlan = { interventions: [] };

const fmtPct = (v?: number | null) => (v == null ? '—' : `${v}%`);

/**
 * Extract a detailed, user-friendly error message from an axios error
 * that may contain:
 *  - message
 *  - error
 *  - details
 *  - field_errors: {field: [msg]}
 *  - non_field_errors: [msg]
 */
const extractApiError = (e: any, fallback: string): string => {
  const api = e?.response?.data;
  if (!api) return fallback;

  const pieces: string[] = [];

  if (typeof api.message === 'string' && api.message.trim()) {
    pieces.push(api.message.trim());
  }

  if (Array.isArray(api.non_field_errors)) {
    pieces.push(...api.non_field_errors.map((x: any) => String(x)));
  }

  if (api.field_errors && typeof api.field_errors === 'object') {
    Object.entries(api.field_errors).forEach(([field, msgs]) => {
      if (Array.isArray(msgs)) {
        msgs.forEach((m) => pieces.push(`${field}: ${m}`));
      } else if (msgs) {
        pieces.push(`${field}: ${msgs}`);
      }
    });
  }

  if (typeof api.error === 'string' && api.error.trim()) {
    pieces.push(api.error.trim());
  }

  if (typeof api.details === 'string' && api.details.trim()) {
    pieces.push(api.details.trim());
  }

  const text = pieces.join(' ');
  return text || fallback;
};

const RehabTable: React.FC = () => {
  const [selectedExercise, setSelectedExercise] = useState<Intervention | null>(null);
  const [showExerciseStats, setShowExerciseStats] = useState<boolean>(false);
  const [error, setError] = useState('');
  const [allInterventions, setAllInterventions] = useState<Intervention[]>([]);
  const [recommendations, setRecommendations] = useState<Intervention[]>([]);
  const [filteredRecommendations, setFilteredRecommendations] = useState<Intervention[]>([]);
  const navigate = useNavigate();
  const [patientName, setPatientName] = useState<string>('John Doe');
  const [patientUsername, setPatientUsername] = useState<string>('');
  const [showInterFeedbackModal, setShowInterFeedbackModal] = useState<boolean>(false);
  const [selectedTab, setSelectedTab] = useState<'patient' | 'all'>('patient');
  const [showRepeatModal, setshowRepeatModal] = useState<boolean>(false);
  const [ShowInfoInterventionModal, setShowInfoInterventionModal] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const { i18n, t } = useTranslation();
  const [showFeedbackBrowser, setShowFeedbackBrowser] = useState<boolean>(false);
  const [feedbackBrowserIntervention, setFeedbackBrowserIntervention] = useState<Intervention | null>(null);
  const [qDefaults, setQDefaults] = useState<any>(null);
  const [titleMap, setTitleMap] = useState<TitleMap>({});
  const [typeMap, setTypeMap]   = useState<TypeMap>({});
  const [repeatMode, setRepeatMode] = useState<'create'|'modify'>('create');
  const [modifyDefaults, setModifyDefaults] = useState<any>(null);
  const [patientData, setPatientData] = useState<PatientPlan>(EMPTY_PLAN);

  const userLang = (i18n.language || 'en').slice(0, 2);
  const specialisations = (authStore.specialisations || [])
  .map((s) => s.trim())
  .filter(Boolean);

  const diagnoses = Array.isArray(specialisations)
    ? specialisations.flatMap((spec) => config?.patientInfo?.function?.[spec]?.diagnosis || [])
    : config?.patientInfo?.function?.[specialisations]?.diagnosis || [];

  // Filters (ALL tab)
  const [searchTerm, setSearchTerm] = useState('');
  const [patientTypeFilter, setPatientTypeFilter] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [benefitForFilter, setBenefitForFilter] = useState<string[]>([]);

  // Export schedule (patient tab)
  const [exportStart, setExportStart] = useState<string>(
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0,10)
  );
  const [exportEnd, setExportEnd] = useState<string>(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0,10)
  );

  // QUESTIONNAIRES – state & helpers
  const [topTab, setTopTab] = useState<'interventions'|'questionnaires'>('interventions');
  const [questionnaires, setQuestionnaires] = useState<QItem[]>([]);
  const [assignedQuestionnaires, setAssignedQuestionnaires] = useState<QAssigned[]>([]);
  const [qModalOpen, setQModalOpen] = useState(false);
  const [qMode, setQMode] = useState<'create'|'modify'>('create');
  const [selectedQ, setSelectedQ] = useState<QItem | null>(null);
  const [qForm, setQForm] = useState<{effectiveFrom: string; frequency: string; notes: string}>({
    effectiveFrom: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    frequency: '',
    notes: ''
  });
  const freqOptions = config.RecomendationInfo.frequency as string[];

  const patientIdForCalls = localStorage.getItem('selectedPatient') || patientUsername;

  // util: local grouping fallback if BE dynamic endpoint is unavailable
  const groupByKeyPrefix = (rawQs: any[]): QItem[] => {
    const re = /^([A-Za-z0-9]+_[A-Za-z]+)/;
    const pretty = (k: string) => {
      const [num, rest] = k.split('_');
      return /^\d+$/.test(num)
        ? `${rest[0].toUpperCase()}${rest.slice(1)} (${num})`
        : k.replace('_',' ');
    };
    const buckets: Record<string, QItem> = {};
    rawQs.forEach((q: any) => {
      const m = (q.questionKey || '').match(re);
      const gid = m ? m[1] : 'Ungrouped';
      if (!buckets[gid]) buckets[gid] = { _id: gid, key: gid, title: pretty(gid), question_count: 0 };
      buckets[gid].question_count = (buckets[gid].question_count || 0) + 1;
    });
    const arr = Object.values(buckets);
    return arr.sort((a, b) => {
      const [na, ra] = a.key.split('_');
      const [nb, rb] = b.key.split('_');
      const ia = /^\d+$/.test(na) ? parseInt(na,10) : 0;
      const ib = /^\d+$/.test(nb) ? parseInt(nb,10) : 0;
      if (ib !== ia) return ib - ia;
      return (ra || a.title).localeCompare(rb || b.title);
    });
  };

  const openFeedbackBrowser = (intervention: Intervention) => {
    const withDates = patientData?.interventions?.find((i) => i._id === intervention._id) || intervention;
    setFeedbackBrowserIntervention(withDates as any);
    setShowFeedbackBrowser(true);
  };

  const fetchQuestionnaires = async () => {
    try {
      const res = await apiClient.get('/questionnaires/dynamic?subject=Healthstatus');
      const items: QItem[] = (Array.isArray(res.data) ? res.data : []).map((g: any) => ({
        _id: g.id,
        key: g.id,
        title: g.title,
        question_count: g.count,
      }));
      if (items.length) { setQuestionnaires(items); return; }
      try {
        const raw = await apiClient.get('/feedback-questions?subject=Healthstatus');
        setQuestionnaires(groupByKeyPrefix(raw.data || []));
      } catch (err: any) {
        const msg = extractApiError(err, t('Failed to load questionnaires.'));
        setError(msg);
        setQuestionnaires([]);
      }
    } catch (err: any) {
      // fallback to legacy endpoint
      try {
        const raw = await apiClient.get('/feedback-questions?subject=Healthstatus');
        setQuestionnaires(groupByKeyPrefix(raw.data || []));
      } catch (err2: any) {
        const msg = extractApiError(err2, t('Failed to load questionnaires.'));
        setError(msg);
        setQuestionnaires([]);
      }
    }
  };

  const fetchAssignedQuestionnaires = async () => {
    try {
      const res = await apiClient.get(`/questionnaires/patient/${patientIdForCalls}/`);
      const arr = Array.isArray(res.data)
        ? res.data
        : (Array.isArray(res.data?.questionnaires) ? res.data.questionnaires : []);
      setAssignedQuestionnaires(arr);
    } catch (err: any) {
      const msg = extractApiError(err, t('Failed to load patient questionnaires.'));
      setError(msg);
      setAssignedQuestionnaires([]);
    }
  };

  // OPEN modals for questionnaires
  const openAddQ = (q: QItem) => {
    setQMode('create');
    setSelectedQ({ _id: q._id, key: q.key, title: q.title });
    setQDefaults({
      interval: 1,
      unit: 'week',
      selectedDays: ['Mon'],
      end: { type: 'never' },
      startTime: '08:00',
    });
    setQModalOpen(true);
  };

  const openModifyQ = (q: QItem) => {
    const assigned = assignedQuestionnaires.find(a => a._id === q._id);
    setQMode('modify');
    setSelectedQ({ _id: q._id, key: q.key, title: q.title });
    setQDefaults({
      effectiveFrom: new Date().toISOString().slice(0,10),
      interval: (assigned as any)?.schedule?.interval ?? 1,
      unit: (assigned as any)?.schedule?.unit ?? 'week',
      selectedDays: (assigned as any)?.schedule?.selectedDays ?? ['Mon'],
      startTime: (assigned as any)?.schedule?.startTime ?? '08:00',
      end: (assigned as any)?.schedule?.end ?? { type: 'never' },
    });
    setQModalOpen(true);
  };

  const saveQAssignment = async () => {
    if (!selectedQ) return;
    try {
      await apiClient.post('/questionnaires/assign/', {
        patientId: patientIdForCalls,
        dynamicKey: selectedQ.key,
        questionnaireId: selectedQ._id,
        frequency: qForm.frequency,
        effectiveFrom: qForm.effectiveFrom,
        notes: qForm.notes,
      });
      setQModalOpen(false);
      fetchAssignedQuestionnaires();
    } catch (err: any) {
      const msg = extractApiError(err, t('Failed to assign questionnaire.'));
      setError(msg);
    }
  };

  const removeQ = async (qid: string) => {
    try {
      await apiClient.post('/questionnaires/remove/', {
        patientId: patientIdForCalls,
        dynamicKey: qid,
        questionnaireId: qid,
      });
      fetchAssignedQuestionnaires();
    } catch (err: any) {
      const msg = extractApiError(err, t('Failed to remove questionnaire.'));
      setError(msg);
    }
  };

  // Visible items for left column
  const visibleItems = useMemo(() => {
    return selectedTab === 'patient'
      ? allInterventions.filter((it) =>
          patientData?.interventions?.some((p) => p._id === it._id)
        )
      : filteredRecommendations;
  }, [selectedTab, allInterventions, filteredRecommendations, patientData]);

  const fetchAll = async () => {
    try {
      const res = await apiClient.get(
        `patients/rehabilitation-plan/therapist/${localStorage.getItem('selectedPatient') || patientUsername}/`
      );
      const raw = (res.data ?? {}) as Record<string, any>;

      // Support both success:true plan and "no plan" message
      if (raw.success === false && raw.message && !raw.interventions) {
        setPatientData(EMPTY_PLAN);
        // Show info text but not catastrophic error
        setError(raw.message);
        return;
      }

      const interventions = Array.isArray(raw.interventions) ? raw.interventions : [];
      setPatientData({ ...raw, interventions });
    } catch (e: any) {
      console.error('Error loading patient interventions', e);
      const msg = extractApiError(
        e,
        t('Error loading patients interventions. Reload the page or try again later.')
      );
      setPatientData(EMPTY_PLAN);
      setError(msg);
    }
  };

  const fetchInts = async () => {
    try {
      const res = await apiClient.get(
        `interventions/all/${localStorage.getItem('selectedPatient') || patientUsername}/`
      );
      setAllInterventions(res.data);
      setRecommendations(res.data);
      setFilteredRecommendations(res.data);
    } catch (e: any) {
      console.error('Error loading all interventions', e);
      const msg = extractApiError(
        e,
        t('Error loading interventions. Reload the page or try again later.')
      );
      setError(msg);
    }
  };

  useEffect(() => {
    authStore.checkAuthentication();
    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
      return;
    }
    if (localStorage.getItem('selectedPatient')) {
      setPatientUsername(localStorage.getItem('selectedPatient') as string);
      setPatientName(localStorage.getItem('selectedPatientName') as string);
      fetchAll();
      fetchInts();
      fetchQuestionnaires();
      fetchAssignedQuestionnaires();
    }

    const entryTime = Date.now();
    const patient = localStorage.getItem('selectedPatient');
    const therapist = authStore?.id || 'unknown';

    return () => {
      const exitTime = Date.now();
      const durationMs = exitTime - entryTime;
      const durationMin = (durationMs / 60000).toFixed(2);
      (async () => {
        try {
          await apiClient.post('/analytics/log', {
            userAgent: 'Therapist',
            user: therapist,
            patient: patient,
            action: 'REHATABLE',
            started: new Date(entryTime).toISOString(),
            ended: new Date(exitTime).toISOString(),
            details: `Viewed ${patient} rehabilitation plan for ${durationMin} minutes`,
          });
        } catch {}
      })();
    };
  }, [navigate]);

  // i18n for visible interventions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!visibleItems.length) {
        if (!cancelled) { setTitleMap({}); setTypeMap({}); }
        return;
      }
      const newTitles: TitleMap = {};
      await Promise.all(
        visibleItems.map(async (rec) => {
          try {
            const { translatedText, detectedSourceLanguage } = await translateText(rec.title, userLang);
            newTitles[rec._id] = { title: translatedText || rec.title, lang: detectedSourceLanguage || null };
          } catch {
            newTitles[rec._id] = { title: rec.title, lang: null };
          }
        })
      );
      const newTypes: TypeMap = {};
      await Promise.all(
        visibleItems.map(async (rec) => {
          const label = capitalize(rec.content_type || '');
          try {
            const { translatedText } = await translateText(label, userLang);
            newTypes[rec._id] = translatedText || label;
          } catch {
            newTypes[rec._id] = label;
          }
        })
      );
      if (!cancelled) { setTitleMap(newTitles); setTypeMap(newTypes); }
    })();
    return () => { cancelled = true; };
  }, [visibleItems, userLang]);

  const handleExerciseClick = (intervention: Intervention) => {
    if (intervention) { setSelectedExercise(intervention); setShowInfoInterventionModal(true); }
  };
  const showStats = (intervention: Intervention) => {
    setSelectedExercise(intervention);
    setShowExerciseStats(true);
  };
  const handleAddIntervention = (intervention: any) => {
    setRepeatMode('create');
    setSelectedExercise(intervention);
    setshowRepeatModal(true);
  };
  const handleModifyIntervention = (intervention: any) => {
    setRepeatMode('modify');
    setSelectedExercise(intervention);
    const assigned = patientData?.interventions?.find((i) => i._id === intervention._id);
    const next = assigned?.dates?.map(d => new Date(d.datetime)).find(d => d > new Date());
    setModifyDefaults({
      effectiveFrom: (next ? next : new Date(Date.now()+86400000)).toISOString().slice(0,10),
      frequency: assigned?.frequency || '',
      notes: assigned?.notes || '',
      require_video_feedback: !!assigned?.require_video_feedback,
    });
    setshowRepeatModal(true);
  };
  const handleDeleteExercise = async (interventionId: string) => {
    try {
      const res = await apiClient.post('interventions/remove-from-patient/', {
        patientId: patientIdForCalls,
        intervention: interventionId,
      });
      if (res.status === 200 || res.status === 201) { fetchAll(); fetchInts(); }
    } catch (err: any) {
      const msg = extractApiError(
        err,
        t('Failed to delete the intervention. Try again now or later.')
      );
      setError(msg);
    }
  };

  // Apply filters (ALL tab)
  useEffect(() => {
    const filtered = filterInterventions(recommendations, {
      patientTypeFilter,
      contentTypeFilter,
      tagFilter,
      benefitForFilter,
      searchTerm,
    });
    setFilteredRecommendations(filtered);
  }, [recommendations, patientTypeFilter, contentTypeFilter, tagFilter, benefitForFilter, searchTerm]);

  // Derived lists for Patient tab: Active vs Past (no future dates)
  const patientAssignedItems = useMemo(
    () => allInterventions.filter((it) =>
      patientData?.interventions?.some((p) => p._id === it._id)
    ),
    [allInterventions, patientData]
  );

  const hasFutureDates = (interventionId: string) => {
    const p = patientData?.interventions?.find((i) => i._id === interventionId);
    return p?.dates?.some((d) => new Date(d.datetime) > new Date()) || false;
  };

  const activePatientItems = useMemo(
    () => patientAssignedItems.filter((it) => hasFutureDates(it._id)),
    [patientAssignedItems, patientData]
  );

  const pastPatientItems = useMemo(
    () => patientAssignedItems.filter((it) => !hasFutureDates(it._id)),
    [patientAssignedItems, patientData]
  );

  // Reset filters for ALL tab
  const resetAllFilters = () => {
    setSearchTerm('');
    setPatientTypeFilter('');
    setContentTypeFilter('');
    setTagFilter([]);
    setBenefitForFilter([]);
  };

  // Export schedule CSV (patient tab)
  const exportScheduleCSV = () => {
    try {
      const start = new Date(`${exportStart}T00:00:00`);
      const end = new Date(`${exportEnd}T23:59:59`);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
        setError(t('Please choose a valid start/end date for export.'));
        return;
      }

      const rows: Array<{date: string; time: string; title: string; status: string; feedbackCount: number}> = [];

      (patientData?.interventions || []).forEach((it) => {
        const title = titleMap[it._id]?.title || it.title;
        (it.dates || []).forEach((d) => {
          const dt = new Date(d.datetime);
          if (dt >= start && dt <= end) {
            rows.push({
              date: dt.toLocaleDateString(),
              time: dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              title,
              status: d.status || '',
              feedbackCount: Array.isArray(d.feedback) ? d.feedback.length : 0,
            });
          }
        });
      });

      const header = ['Date','Time','Title','Status','FeedbackCount'];
      const lines = [header, ...rows.map(r => [
        r.date, r.time, r.title, r.status, String(r.feedbackCount)
      ])];

      const csv = lines.map(line =>
        line.map(field => {
          const f = String(field ?? '');
          const needsQuotes = /[",\n;]/.test(f);
          const escaped = f.replace(/"/g, '""');
          return needsQuotes ? `"${escaped}"` : escaped;
        }).join(',')
      ).join('\n');

      const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schedule_${patientName.replace(/\s+/g,'_')}_${exportStart}_to_${exportEnd}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      const msg = extractApiError(err, t('Failed to export the schedule.'));
      setError(msg);
    }
  };

  return (
    <>
      <style>{`
/* --- MAIN LAYOUT FIXES --- */

/* Main container */
.rehab-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Two-column area */
.rehab-panels {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* Force Bootstrap columns to allow children to scroll */
.rehab-panels > .col,
.rehab-panels > [class*="col-"] {
  display: flex;
  flex-direction: column;
  min-height: 0 !important;
  overflow: hidden;
}

/* Left panel top (tabs & filters) */
.left-top {
  flex: 0 0 auto;
}

/* Left side scroll area */
.left-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

/* Calendar scroll area */
.calendar-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

/* react-big-calendar forcing fix */
.rbc-calendar,
.rbc-time-view,
.rbc-time-content {
  min-height: 0 !important;
  height: 100% !important;
}

/* Patient interventions scroll area */
.scroll-y {
  max-height: 650px;
  overflow-y: auto !important;
  padding-right: 4px;
}

/* ALL INTERVENTIONS LIST: max height = viewport - 440px */
.all-scroll-y {
  max-height: calc(100vh - 440px);
  overflow-y: auto !important;
  min-height: 0;
  padding-right: 4px;
}

/* Ensure left panel bottom aligns with calendar */
.left-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
`}</style>

      <div className="d-flex flex-column min-vh-100">
        <Header isLoggedIn={authStore.isAuthenticated} />

        <div className="rehab-main overflow-hidden">
          <Container fluid className="mt-4 mb-3 d-flex flex-column flex-grow-1 overflow-hidden">

            <InterventionHeader
              patientName={patientName}
              adherence={{
                last7: fmtPct(patientData?.adherence_rate),
                overall: fmtPct(patientData?.adherence_total),
              }}
              error={error}
              onClearError={() => setError('')}
              topTab={topTab}
              setTopTab={setTopTab}
              t={t}
            />

            {topTab === 'interventions' ? (
              <Row className="flex-grow-1 overflow-hidden align-items-stretch">

                {/* LEFT PANEL */}
                <Col
                  xs={12}
                  md={3}
                  className="d-flex flex-column h-100"
                  style={{ overflow: 'hidden' }}
                >
                  <InterventionLeftPanel
                    selectedTab={selectedTab}
                    setSelectedTab={setSelectedTab}
                    data={{
                      activeItems: activePatientItems,
                      pastItems: pastPatientItems,
                      visibleItems,
                      titleMap,
                      typeMap,
                      diagnoses,
                    }}
                    filters={{
                      searchTerm,
                      setSearchTerm,
                      patientTypeFilter,
                      setPatientTypeFilter,
                      contentTypeFilter,
                      setContentTypeFilter,
                      tagFilter,
                      setTagFilter,
                      benefitForFilter,
                      setBenefitForFilter,
                      resetAllFilters,
                    }}
                    actions={{
                      handleExerciseClick,
                      showStats,
                      openFeedbackBrowser,
                      handleModifyIntervention,
                      handleDeleteExercise,
                      handleAddIntervention,
                    }}
                    patientData={patientData}
                    t={t}
                  />
                </Col>

                {/* RIGHT – calendar + export controls */}
                <Col
                  xs={12}
                  md={9}
                  className="d-flex flex-column h-100"
                  style={{ overflow: 'hidden' }}
                >
                  <InterventionRightPanel
                    data={{ interventions: patientData.interventions || [] }}
                    exportState={{
                      exportStart,
                      exportEnd,
                      setExportStart,
                      setExportEnd,
                      exportScheduleCSV,
                    }}
                    actions={{
                      onSelectEvent: (event: any) => {
                        setSelectedExercise(event);
                        setSelectedDate(event.start.toISOString().split('T')[0]);
                        setShowInterFeedbackModal(true);
                      },
                    }}
                    t={t}
                  />
                </Col>
              </Row>
            ) : (
              <QuestionnairePanel
                data={{ questionnaires, assignedQuestionnaires }}
                actions={{ openAddQ, openModifyQ, removeQ }}
                t={t}
              />
            )}
          </Container>

          <Footer />

          {selectedExercise && ShowInfoInterventionModal && (() => {
            const assigned = patientData?.interventions?.find(
              (i) => i._id === (selectedExercise as any)._id
            );
            return (
              <PatientInterventionPopUp
                show
                item={selectedExercise}
                personalNote={assigned?.notes || ''}
                handleClose={() => setShowInfoInterventionModal(false)}
              />
            );
          })()}

          {showRepeatModal && (
            <InterventionRepeatModal
              show
              mode={repeatMode}
              onHide={() => setshowRepeatModal(false)}
              onSuccess={async () => { await fetchAll(); await fetchInts(); }}
              patient={patientIdForCalls}
              therapistId={authStore.id}
              intervention={selectedExercise}
              defaults={modifyDefaults || undefined}
            />
          )}

          {showInterFeedbackModal && selectedExercise && (() => {
            const selectedIntervention = patientData?.interventions?.find(
              (int) => int._id === (selectedExercise as any)._id
            );
            const selectedLog = selectedIntervention?.dates?.find(
              (d) => d.datetime.split('T')[0] === selectedDate
            );
            return (
              <InterventionFeedbackModal
                show={showInterFeedbackModal}
                onClose={() => setShowInterFeedbackModal(false)}
                exercise={selectedExercise as any}
                feedbackEntries={selectedLog?.feedback || []}
                video={(selectedLog as any)?.video ? {
                  video_url: (selectedLog as any).video.video_url,
                  video_expired: (selectedLog as any).video.video_expired,
                  comment: (selectedLog as any).video.comment,
                } : undefined}
                date={selectedDate}
                userLang={userLang}
              />
            );
          })()}

          <InterventionStatsModal
            show={showExerciseStats}
            onClose={() => setShowExerciseStats(false)}
            exercise={selectedExercise as any}
            interventionData={(patientData?.interventions ?? []).find(
              (item) => item._id === (selectedExercise as any)?._id
            )}
            t={t}
          />

          <QuestionnaireScheduleModal
            show={qModalOpen}
            mode={qMode}
            onHide={() => setQModalOpen(false)}
            onSuccess={() => { setQModalOpen(false); fetchAssignedQuestionnaires(); }}
            patientId={patientIdForCalls}
            questionnaire={selectedQ}
            defaults={qDefaults}
          />

          {showFeedbackBrowser && feedbackBrowserIntervention && (
            <InterventionFeedbackBrowserModal
              show={showFeedbackBrowser}
              onClose={() => setShowFeedbackBrowser(false)}
              intervention={feedbackBrowserIntervention as any}
              userLang={userLang}
            />
          )}
        </div>
      </div>
    </>
  );
};

export default RehabTable;
