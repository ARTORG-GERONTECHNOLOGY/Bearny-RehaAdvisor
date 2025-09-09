// src/pages/RehabTable.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Col, Container, Row, Nav, Card, Form, Badge,
  ButtonGroup, OverlayTrigger, Tooltip, Modal
} from 'react-bootstrap';
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
import { FaPlus, FaMinus, FaChartBar, FaEdit, FaTrash } from 'react-icons/fa';
import QuestionnaireScheduleModal from '../components/RehaTablePage/QuestionnaireScheduleModal';

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
type TitleMap = Record<string, { title: string; lang: string | null }>;
type TypeMap  = Record<string, string>;

type QItem = { _id: string; key: string; title: string; description?: string; tags?: string[]; question_count?: number };
type QAssigned = { _id: string; title: string; description?: string; frequency?: string; dates?: string[] };

const RehabTable: React.FC = () => {
  const [patientData, setPatientData] = useState<{ interventions: Intervention[] }>({ interventions: [] });
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

const [qDefaults, setQDefaults] = useState<any>(null);
  const [titleMap, setTitleMap] = useState<TitleMap>({});
  const [typeMap, setTypeMap]   = useState<TypeMap>({});
  const [repeatMode, setRepeatMode] = useState<'create'|'modify'>('create');
  const [modifyDefaults, setModifyDefaults] = useState<any>(null);

  const userLang = (i18n.language || 'en').slice(0, 2);
  const specialisations = authStore.specialisation.split(',').map((s) => s.trim());
  const diagnoses = Array.isArray(specialisations)
    ? specialisations.flatMap((spec) => config?.patientInfo?.function?.[spec]?.diagnosis || [])
    : config?.patientInfo?.function?.[specialisations]?.diagnosis || [];

  const [searchTerm, setSearchTerm] = useState('');
  const [patientTypeFilter, setPatientTypeFilter] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [benefitForFilter, setBenefitForFilter] = useState<string[]>([]);

  // ─────────────────────────────────────────────────────────────────────────────
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
      return /^\d+$/.test(num) ? `${rest[0].toUpperCase()}${rest.slice(1)} (${num})` : k.replace('_',' ');
    };
    const buckets: Record<string, QItem> = {};
    rawQs.forEach((q: any) => {
      const m = (q.questionKey || '').match(re);
      const gid = m ? m[1] : 'Ungrouped';
      if (!buckets[gid]) buckets[gid] = { _id: gid, key: gid, title: pretty(gid), question_count: 0 };
      buckets[gid].question_count = (buckets[gid].question_count || 0) + 1;
    });
    // sort by numeric prefix desc, then title
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

  const fetchQuestionnaires = async () => {
    try {
      // 1) preferred: dynamic groups from BE (uses questionKey prefix)
      const res = await apiClient.get('/questionnaires/dynamic?subject=Healthstatus');
      // map to QItem
      const items: QItem[] = (Array.isArray(res.data) ? res.data : []).map((g: any) => ({
        _id: g.id,          // group key like "16_profile"
        key: g.id,
        title: g.title,
        question_count: g.count,
      }));
      if (items.length) {
        setQuestionnaires(items);
        return;
      }
      // 2) fallback: fetch raw questions and group locally
      try {
        const raw = await apiClient.get('/feedback-questions?subject=Healthstatus');
        setQuestionnaires(groupByKeyPrefix(raw.data || []));
      } catch {
        setQuestionnaires([]);
      }
    } catch {
      // if dynamic endpoint not found, fallback
      try {
        const raw = await apiClient.get('/feedback-questions?subject=Healthstatus');
        setQuestionnaires(groupByKeyPrefix(raw.data || []));
      } catch {
        setError(t('Failed to load questionnaires.'));
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
    } catch {
      // don't hard-fail the page; just show none
      setAssignedQuestionnaires([]);
    }
  };

// OPEN modals
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
        // Send both fields; BE can accept either
        dynamicKey: selectedQ.key,            // e.g. "16_profile"
        questionnaireId: selectedQ._id,       // same value when dynamic
        frequency: qForm.frequency,
        effectiveFrom: qForm.effectiveFrom,
        notes: qForm.notes,
      });
      setQModalOpen(false);
      fetchAssignedQuestionnaires();
    } catch {
      setError(t('Failed to assign questionnaire.'));
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
    } catch {
      setError(t('Failed to remove questionnaire.'));
    }
  };
  // ─────────────────────────────────────────────────────────────────────────────

  // ITEMS CURRENTLY VISIBLE IN THE LEFT LIST (interventions)
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
      setPatientData(res.data);
    } catch (e) {
      console.error('Error loading patient interventions', e);
      setError('Error loading patients interventions. Reload the page or try again later.');
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
    } catch (e) {
      console.error('Error loading all interventions', e);
      setError('Error loading interventions. Reload the page or try again later.');
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
      // preload questionnaires area
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
          } catch { newTitles[rec._id] = { title: rec.title, lang: null }; }
        })
      );
      const newTypes: TypeMap = {};
      await Promise.all(
        visibleItems.map(async (rec) => {
          const label = capitalize(rec.content_type || '');
          try {
            const { translatedText } = await translateText(label, userLang);
            newTypes[rec._id] = translatedText || label;
          } catch { newTypes[rec._id] = label; }
        })
      );
      if (!cancelled) { setTitleMap(newTitles); setTypeMap(newTypes); }
    })();
    return () => { cancelled = true; };
  }, [visibleItems, userLang]);

  const handleExerciseClick = (intervention: Intervention) => {
    if (intervention) { setSelectedExercise(intervention); setShowInfoInterventionModal(true); }
  };
  const showStats = (intervention: Intervention) => { setSelectedExercise(intervention); setShowExerciseStats(true); };
  const handleAddIntervention = (intervention: any) => { setRepeatMode('create'); setSelectedExercise(intervention); setshowRepeatModal(true); };
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
    } catch {
      setError('Failed to delete the intervention. Try again now or later.');
    }
  };
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

  const isAssigned = (id: string) => !!patientData?.interventions?.some((item) => item._id === id);

  return (
    <>
      <style>{`
        .min-h-0 { min-height: 0 !important; }
        .flex-1 { flex: 1 1 auto !important; }
        .scroll-y { overflow-y: auto !important; -webkit-overflow-scrolling: touch; }
        .panel-viewport { height: 80vh; min-height: 0; display: flex; flex-direction: column; }
      `}</style>

      <div className="d-flex flex-column min-vh-100">
        <Header isLoggedIn={authStore.isAuthenticated} />

        <div className="flex-grow-1 d-flex flex-column overflow-hidden">
          <Container fluid className="mt-4 d-flex flex-column flex-grow-1 overflow-hidden">

            <Row><Col><h2 className="text-center mb-4">{patientName}</h2></Col></Row>
            <Row><Col>{error && <ErrorAlert message={error} onClose={() => setError('')} />}</Col></Row>

            {/* ───────────────── Top-level tab (Interventions | Questionnaires) ─────────────── */}
            <Row className="mb-3">
              <Col>
                <Nav variant="tabs" activeKey={topTab} onSelect={(k) => setTopTab((k as any) || 'interventions')}>
                  <Nav.Item><Nav.Link eventKey="interventions">{t('Interventions')}</Nav.Link></Nav.Item>
                  <Nav.Item><Nav.Link eventKey="questionnaires">{t('Questionnaires')}</Nav.Link></Nav.Item>
                </Nav>
              </Col>
            </Row>

            {topTab === 'interventions' ? (
              /* ================== your existing INTERVENTIONS layout ================== */
              <Row className="flex-grow-1 overflow-hidden">
                {/* LEFT PANEL */}
                <Col xs={12} md={3} className="mb-3 mb-md-0 d-flex flex-column" style={{ overflow: 'hidden', minHeight: 0 }}>
                  <div className="panel-viewport">
                    <Card className="mb-3">
                      <Card.Header>
                        <Nav variant="tabs" activeKey={selectedTab} onSelect={(k) => setSelectedTab((k as 'patient'|'all') || 'patient')}>
                          <Nav.Item><Nav.Link eventKey="patient">{t("Patient's Interventions")}</Nav.Link></Nav.Item>
                          <Nav.Item><Nav.Link eventKey="all">{t('All Interventions')}</Nav.Link></Nav.Item>
                        </Nav>
                      </Card.Header>
                    </Card>
                    {selectedTab === 'all' && (
                      <Card className="mb-3">
                        <Card.Body>
                          <Row className="mb-3">
                            <Col>
                              <Form.Group controlId="searchInput">
                                <Form.Control type="text" placeholder={t('Search Interventions')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                              </Form.Group>
                            </Col>
                          </Row>
                          <Row className="mb-3">
                            <Col>
                              <Form.Select value={patientTypeFilter} onChange={(e) => setPatientTypeFilter(e.target.value)}>
                                <option value="">{t('Filter by Patient Type')}</option>
                                {diagnoses.map((type: string) => (<option key={type} value={type}>{t(type)}</option>))}
                              </Form.Select>
                            </Col>
                            <Col>
                              <Form.Select value={contentTypeFilter} onChange={(e) => setContentTypeFilter(e.target.value)}>
                                <option value="">{t('Filter by Content Type')}</option>
                                {config.RecomendationInfo.types.map((type) => (<option key={type} value={type}>{t(type)}</option>))}
                              </Form.Select>
                            </Col>
                          </Row>
                          <Row>
                            <Col>
                              <Select
                                isMulti
                                options={config.RecomendationInfo.tags.map((tag) => ({ value: tag, label: t(tag) }))}
                                value={tagFilter.map((tag) => ({ value: tag, label: tag }))}
                                onChange={(opts) => setTagFilter(opts.map((opt) => opt.value))}
                                placeholder={t('Filter by Tags')}
                              />
                            </Col>
                            <Col>
                              <Select
                                isMulti
                                options={config.RecomendationInfo.benefits.map((b) => ({ value: b, label: t(b) }))}
                                value={benefitForFilter.map((b) => ({ value: b, label: b }))}
                                onChange={(opts) => setBenefitForFilter(opts.map((opt) => opt.value))}
                                placeholder={t('Filter by Benefit')}
                              />
                            </Col>
                          </Row>
                        </Card.Body>
                      </Card>
                    )}
                    <Card className="d-flex flex-column flex-1 min-h-0">
                      <Card.Body className="d-flex flex-column flex-1 min-h-0 p-2">
                        <div className="flex-1 min-h-0 scroll-y">
                          {visibleItems.map((intervention) => {
                            const translated = titleMap[intervention._id];
                            const title = translated?.title || intervention.title;
                            const originalLang = translated?.lang;
                            const isTranslated =
                              originalLang && title.trim().toLowerCase() !== intervention.title.trim().toLowerCase();
                            const typeLabel = typeMap[intervention._id] || capitalize(intervention.content_type || '');
                            const patientHasIntervention = patientData?.interventions?.find((item) => item._id === intervention._id);
                            const hasFutureDates = patientHasIntervention?.dates?.some((d) => new Date(d.datetime) > new Date());
                            const assigned = isAssigned(intervention._id);
                            return (
                              <div key={intervention._id} className="d-flex justify-content-between align-items-start mb-2 p-2 rounded shadow-sm"
                                   style={{ cursor: 'pointer', backgroundColor: '#f8f9fa', gap: '0.5rem' }}
                                   onClick={() => handleExerciseClick(intervention)}>
                                <div className="flex-grow-1">
                                  <strong {...(isTranslated ? { title: `Original: ${intervention.title}` } : {})}>{title}</strong>
                                  {isTranslated && <div className="text-muted fst-italic" style={{ fontSize: '0.85rem' }}>({t('Translated from')}: {originalLang})</div>}
                                  <div className="text-muted">{typeLabel}</div>
                                  <Badge bg={getBadgeVariantFromUrl(intervention.media_url, intervention.link)}>
                                    {t(getMediaTypeLabelFromUrl(intervention.media_url, intervention.link))}
                                  </Badge>
                                </div>
                                <div style={{ flex: '0 0 auto' }}>
                                  <div onClick={(e) => e.stopPropagation()} className="ms-2">
                                    <ButtonGroup size="sm" vertical>
                                      <OverlayTrigger placement="left" overlay={<Tooltip>{t('Statistics')}</Tooltip>}>
                                        <Button variant="outline-primary" onClick={() => showStats(intervention)} aria-label={t('Statistics')}>
                                          <FaChartBar />
                                        </Button>
                                      </OverlayTrigger>
                                      {assigned && (
                                        <OverlayTrigger placement="left" overlay={<Tooltip>{t('Modify')}</Tooltip>}>
                                          <Button variant="outline-secondary" onClick={() => handleModifyIntervention(intervention)} aria-label={t('Modify')}>
                                            <FaEdit />
                                          </Button>
                                        </OverlayTrigger>
                                      )}
                                      {selectedTab === 'all'
                                        ? (patientHasIntervention?.dates?.some((d) => new Date(d.datetime) > new Date())
                                          ? (
                                            <OverlayTrigger placement="left" overlay={<Tooltip>{t('Remove')}</Tooltip>}>
                                              <Button variant="outline-danger" onClick={() => handleDeleteExercise(intervention._id)} aria-label={t('Remove')}>
                                                <FaMinus />
                                              </Button>
                                            </OverlayTrigger>
                                          ) : (
                                            <OverlayTrigger placement="left" overlay={<Tooltip>{t('Add')}</Tooltip>}>
                                              <Button variant="outline-success" onClick={() => handleAddIntervention(intervention)} aria-label={t('Add')}>
                                                <FaPlus />
                                              </Button>
                                            </OverlayTrigger>
                                          ))
                                        : (patientHasIntervention?.dates?.some((d) => new Date(d.datetime) > new Date()) && (
                                            <OverlayTrigger placement="left" overlay={<Tooltip>{t('Remove')}</Tooltip>}>
                                              <Button variant="outline-danger" onClick={() => handleDeleteExercise(intervention._id)} aria-label={t('Remove')}>
                                                <FaMinus />
                                              </Button>
                                            </OverlayTrigger>
                                          ))
                                      }
                                    </ButtonGroup>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </Card.Body>
                    </Card>
                  </div>
                </Col>
                {/* RIGHT – calendar */}
                <Col xs={12} md={9} className="d-flex flex-column" style={{ overflow: 'hidden', minHeight: 0 }}>
                  <div className="flex-1 min-h-0" style={{ overflow: 'auto' }}>
                    <InterventionCalendar
                      interventions={patientData.interventions || []}
                      onSelectEvent={(event: any) => {
                        setSelectedExercise(event);
                        setSelectedDate(event.start.toISOString().split('T')[0]);
                        setShowInterFeedbackModal(true);
                      }}
                    />
                  </div>
                </Col>
              </Row>
            ) : (
              /* ================== QUESTIONNAIRES layout ================== */
              <Row className="flex-grow-1 overflow-hidden">
                <Col xs={12} md={5} className="d-flex flex-column" style={{ minHeight: 0 }}>
                  <Card className="flex-1 min-h-0 d-flex flex-column">
                    <Card.Header>{t('Available questionnaires')}</Card.Header>
                    <Card.Body className="p-2 flex-1 min-h-0">
                      <div className="scroll-y">
                        {questionnaires.length === 0 && (
                          <div className="text-muted">{t('No questionnaires found')}</div>
                        )}
                        {questionnaires.map((q) => {
                          const isAlready = !!assignedQuestionnaires.find(a => a._id === q._id);
                          return (
                            <div key={q._id} className="d-flex justify-content-between align-items-start mb-2 p-2 rounded border">
                              <div>
                                <div className="fw-semibold">{q.title}</div>
                                {q.question_count != null && <div className="small text-muted">{t('Questions')}: {q.question_count}</div>}
                              </div>
                              <div>
                                <ButtonGroup size="sm" vertical>
                                  {isAlready ? (
                                    <>
                                      <Button variant="outline-secondary" onClick={() => openModifyQ(q)}><FaEdit /></Button>
                                      <Button variant="outline-danger" onClick={() => removeQ(q._id)}><FaTrash /></Button>
                                    </>
                                  ) : (
                                    <Button variant="outline-success" onClick={() => openAddQ(q)}><FaPlus /></Button>
                                  )}
                                </ButtonGroup>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card.Body>
                  </Card>
                </Col>

                <Col xs={12} md={7} className="d-flex flex-column" style={{ minHeight: 0 }}>
                  <Card className="flex-1 min-h-0 d-flex flex-column">
                    <Card.Header>{t('Assigned questionnaires')}</Card.Header>
                    <Card.Body className="p-2 flex-1 min-h-0">
                      <div className="scroll-y">
                        {assignedQuestionnaires.length === 0 && (
                          <div className="text-muted">{t('No questionnaires assigned')}</div>
                        )}
                        {assignedQuestionnaires.map((a) => (
                          <div key={a._id} className="d-flex justify-content-between align-items-center p-2 mb-2 border rounded">
                            <div>
                              <div className="fw-semibold">{a.title}</div>
                              <div className="small text-muted">{t('Frequency')}: {a.frequency || '—'}</div>
                              {a.dates?.length ? (
                                <div className="small text-muted">{t('Next on')}: {new Date(a.dates[0]).toLocaleDateString()}</div>
                              ) : null}
                            </div>
                            <div>
                              <ButtonGroup size="sm">
                                <Button variant="outline-secondary" onClick={() => openModifyQ({ _id: a._id, key: a._id, title: a.title })}><FaEdit /></Button>
                                <Button variant="outline-danger" onClick={() => removeQ(a._id)}><FaTrash /></Button>
                              </ButtonGroup>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            )}

          </Container>

          <Footer />

          {/* existing modals (unchanged) */}
          {selectedExercise && ShowInfoInterventionModal && (
            <PatientInterventionPopUp show item={selectedExercise} handleClose={() => setShowInfoInterventionModal(false)} />
          )}
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
            const selectedIntervention = patientData?.interventions?.find((int) => int._id === (selectedExercise as any)._id);
            const selectedLog = selectedIntervention?.dates?.find((d) => d.datetime.split('T')[0] === selectedDate);
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
            interventionData={patientData.interventions.find(
              (item) => item._id === (selectedExercise as any)?._id
            )}
            t={t}
          />

          {/* ───────────── QUESTIONNAIRE frequency modal (same UX as interventions) ───────────── */}
          <QuestionnaireScheduleModal
  show={qModalOpen}
  mode={qMode}
  onHide={() => setQModalOpen(false)}
  onSuccess={() => { setQModalOpen(false); fetchAssignedQuestionnaires(); }}
  patientId={patientIdForCalls}
  questionnaire={selectedQ}
  defaults={qDefaults}
/>

        </div>
      </div>
    </>
  );
};

export default RehabTable;
