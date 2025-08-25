// src/pages/RehabTable.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Col, Container, Row, Nav, Card, Form, Badge,
  ButtonGroup, OverlayTrigger, Tooltip
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
import { FaPlus, FaMinus, FaChartBar, FaEdit } from 'react-icons/fa';

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

type TitleMap = Record<string, { title: string; lang: string | null }>;
type TypeMap  = Record<string, string>;

const RehabTable: React.FC = () => {
  const [patientData, setPatientData] = useState<{ interventions: Intervention[] }>({
    interventions: [],
  });
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

  // ITEMS CURRENTLY VISIBLE IN THE LEFT LIST
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
    }

    const entryTime = Date.now();
    const patient = localStorage.getItem('selectedPatient');
    const therapist = authStore?.id || 'unknown';

    console.log(
      `[i13n] Therapist ${therapist} opened RehabTable for ${patient} at ${new Date(entryTime).toISOString()}`
    );

    return () => {
      const exitTime = Date.now();
      const durationMs = exitTime - entryTime;
      const durationMin = (durationMs / 60000).toFixed(2);

      console.log(`[i13n] Therapist ${therapist} left RehabTable after ${durationMin} minutes`);

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
          console.log(
            `[i13n] Action: REHATABLE, Details: ${patient}, Duration: ${durationMin} minutes`
          );
        } catch (err) {
          console.error('Error logging action:', err);
        }
      })();
    };
  }, [navigate]);

  // 🔰 TRANSLATE VISIBLE TITLES + CONTENT TYPES (this mirrors your InterventionList pattern)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!visibleItems.length) {
        if (!cancelled) {
          setTitleMap({});
          setTypeMap({});
        }
        return;
      }

      // Translate titles
      const newTitles: TitleMap = {};
      await Promise.all(
        visibleItems.map(async (rec) => {
          try {
            const { translatedText, detectedSourceLanguage } = await translateText(rec.title, userLang);
            newTitles[rec._id] = {
              title: translatedText || rec.title,
              lang: detectedSourceLanguage || null,
            };
          } catch {
            newTitles[rec._id] = { title: rec.title, lang: null };
          }
        })
      );

      // Translate content types as display labels (capitalize first)
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

      if (!cancelled) {
        setTitleMap(newTitles);
        setTypeMap(newTypes);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visibleItems, userLang]);

  const handleExerciseClick = (intervention: Intervention) => {
    if (intervention) {
      setSelectedExercise(intervention);
      setShowInfoInterventionModal(true);
    }
  };

  const showStats = (intervention: Intervention) => {
    if (intervention) {
      setSelectedExercise(intervention);
      setShowExerciseStats(true);
    }
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
        patientId: patientUsername,
        intervention: interventionId,
      });
      if (res.status === 200 || res.status === 201) {
        fetchAll();
        fetchInts();
      }
    } catch (e) {
      console.error('Error loading all interventions', e);
      setError('Failed to delete the intervention. Try again now or later.');
    }

    console.log('Intervention removed for patient:', patientUsername);
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
  }, [
    recommendations,
    patientTypeFilter,
    contentTypeFilter,
    tagFilter,
    benefitForFilter,
    searchTerm,
  ]);

  const isAssigned = (id: string) =>
    !!patientData?.interventions?.some((item) => item._id === id);

  return (
    <>
      {/* Inline CSS helpers (kept tiny & local to this page) */}
      <style>{`
        .min-h-0 { min-height: 0 !important; }
        .flex-1 { flex: 1 1 auto !important; }
        .scroll-y { overflow-y: auto !important; -webkit-overflow-scrolling: touch; }
        .panel-viewport {
          height: 80vh;            /* match calendar's height in InterventionCalendar */
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
      `}</style>

      <div className="d-flex flex-column min-vh-100">
        <Header isLoggedIn={authStore.isAuthenticated} />

        <div className="flex-grow-1 d-flex flex-column overflow-hidden">
          <Container fluid className="mt-4 d-flex flex-column flex-grow-1 overflow-hidden">

            <Row>
              <Col>
                <h2 className="text-center mb-4">{patientName}</h2>
              </Col>
            </Row>
            <Row>
              <Col>
                {error && (
                  <ErrorAlert
                    message={error}
                    onClose={() => {
                      setError('');
                    }}
                  />
                )}
              </Col>
            </Row>

            {/* PANELS ROW */}
            <Row className="flex-grow-1 overflow-hidden">
              {/* LEFT PANEL */}
              <Col
                xs={12}
                md={3}
                className="mb-3 mb-md-0 d-flex flex-column"
                style={{ overflow: 'hidden', minHeight: 0 }}
              >
                <div className="panel-viewport">
                  {/* Tab Switcher */}
                  <Card className="mb-3">
                    <Card.Header>
                      <Nav
                        variant="tabs"
                        activeKey={selectedTab}
                        onSelect={(k) => setSelectedTab((k as 'patient' | 'all') || 'patient')}
                      >
                        <Nav.Item>
                          <Nav.Link eventKey="patient">{t("Patient's Interventions")}</Nav.Link>
                        </Nav.Item>
                        <Nav.Item>
                          <Nav.Link eventKey="all">{t('All Interventions')}</Nav.Link>
                        </Nav.Item>
                      </Nav>
                    </Card.Header>
                  </Card>

                  {/* Filters */}
                  {selectedTab === 'all' && (
                    <Card className="mb-3">
                      <Card.Body>
                        <Row className="mb-3">
                          <Col>
                            <Form.Group controlId="searchInput">
                              <Form.Control
                                type="text"
                                placeholder={t('Search Interventions')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                              />
                            </Form.Group>
                          </Col>
                        </Row>

                        <Row className="mb-3">
                          <Col>
                            <Form.Select
                              value={patientTypeFilter}
                              onChange={(e) => setPatientTypeFilter(e.target.value)}
                            >
                              <option value="">{t('Filter by Patient Type')}</option>
                              {diagnoses.map((type: string) => (
                                <option key={type} value={type}>
                                  {t(type)}
                                </option>
                              ))}
                            </Form.Select>
                          </Col>
                          <Col>
                            <Form.Select
                              value={contentTypeFilter}
                              onChange={(e) => setContentTypeFilter(e.target.value)}
                            >
                              <option value="">{t('Filter by Content Type')}</option>
                              {config.RecomendationInfo.types.map((type) => (
                                <option key={type} value={type}>
                                  {t(type)}
                                </option>
                              ))}
                            </Form.Select>
                          </Col>
                        </Row>

                        <Row>
                          <Col>
                            <Select
                              isMulti
                              options={config.RecomendationInfo.tags.map((tag) => ({
                                value: tag,
                                label: t(tag),
                              }))}
                              value={tagFilter.map((tag) => ({ value: tag, label: tag }))}
                              onChange={(opts) => setTagFilter(opts.map((opt) => opt.value))}
                              placeholder={t('Filter by Tags')}
                            />
                          </Col>
                          <Col>
                            <Select
                              isMulti
                              options={config.RecomendationInfo.benefits.map((b) => ({
                                value: b,
                                label: t(b),
                              }))}
                              value={benefitForFilter.map((b) => ({ value: b, label: b }))}
                              onChange={(opts) => setBenefitForFilter(opts.map((opt) => opt.value))}
                              placeholder={t('Filter by Benefit')}
                            />
                          </Col>
                        </Row>
                      </Card.Body>
                    </Card>
                  )}

                  {/* Intervention List - Scrollable, capped to calendar height */}
                  <Card className="d-flex flex-column flex-1 min-h-0">
                    <Card.Body className="d-flex flex-column flex-1 min-h-0 p-2">
                      <div className="flex-1 min-h-0 scroll-y">
                        {visibleItems.map((intervention) => {
                          const translated = titleMap[intervention._id];
                          const title = translated?.title || intervention.title;
                          const originalLang = translated?.lang;
                          const isTranslated =
                            originalLang &&
                            title.trim().toLowerCase() !== intervention.title.trim().toLowerCase();

                          const typeLabel =
                            typeMap[intervention._id] || capitalize(intervention.content_type || '');

                          const patientHasIntervention = patientData?.interventions?.find(
                            (item) => item._id === intervention._id
                          );
                          const hasFutureDates = patientHasIntervention?.dates?.some(
                            (d) => new Date(d.datetime) > new Date()
                          );
                          const assigned = isAssigned(intervention._id);

                          return (
                            <div
                              key={intervention._id}
                              className="d-flex justify-content-between align-items-start mb-2 p-2 rounded shadow-sm"
                              style={{
                                cursor: 'pointer',
                                backgroundColor: '#f8f9fa',
                                gap: '0.5rem',
                              }}
                              onClick={() => handleExerciseClick(intervention)}
                            >
                              <div className="flex-grow-1">
                                <strong {...(isTranslated ? { title: `Original: ${intervention.title}` } : {})}>
                                  {title}
                                </strong>

                                {isTranslated && (
                                  <div className="text-muted fst-italic" style={{ fontSize: '0.85rem' }}>
                                    ({t('Translated from')}: {originalLang})
                                  </div>
                                )}

                                <div className="text-muted">{typeLabel}</div>

                                <Badge bg={getBadgeVariantFromUrl(intervention.media_url, intervention.link)}>
                                  {t(getMediaTypeLabelFromUrl(intervention.media_url, intervention.link))}
                                </Badge>
                              </div>

                              {/* action column */}
                              <div style={{ flex: '0 0 auto' }}>
                                <div onClick={(e) => e.stopPropagation()} className="ms-2">
                                  <ButtonGroup size="sm" vertical>
                                    {/* Stats */}
                                    <OverlayTrigger placement="left" overlay={<Tooltip>{t('Statistics')}</Tooltip>}>
                                      <Button
                                        variant="outline-primary"
                                        onClick={() => showStats(intervention)}
                                        aria-label={t('Statistics')}
                                      >
                                        <FaChartBar />
                                      </Button>
                                    </OverlayTrigger>

                                    {/* Modify — ONLY for already assigned interventions */}
                                    {assigned && (
                                      <OverlayTrigger placement="left" overlay={<Tooltip>{t('Modify')}</Tooltip>}>
                                        <Button
                                          variant="outline-secondary"
                                          onClick={() => handleModifyIntervention(intervention)}
                                          aria-label={t('Modify')}
                                        >
                                          <FaEdit />
                                        </Button>
                                      </OverlayTrigger>
                                    )}

                                    {/* Add / Remove */}
                                    {selectedTab === 'all' ? (
                                      hasFutureDates ? (
                                        <OverlayTrigger placement="left" overlay={<Tooltip>{t('Remove')}</Tooltip>}>
                                          <Button
                                            variant="outline-danger"
                                            onClick={() => handleDeleteExercise(intervention._id)}
                                            aria-label={t('Remove')}
                                          >
                                            <FaMinus />
                                          </Button>
                                        </OverlayTrigger>
                                      ) : (
                                        <OverlayTrigger placement="left" overlay={<Tooltip>{t('Add')}</Tooltip>}>
                                          <Button
                                            variant="outline-success"
                                            onClick={() => handleAddIntervention(intervention)}
                                            aria-label={t('Add')}
                                          >
                                            <FaPlus />
                                          </Button>
                                        </OverlayTrigger>
                                      )
                                    ) : (
                                      // patient tab
                                      hasFutureDates && (
                                        <OverlayTrigger placement="left" overlay={<Tooltip>{t('Remove')}</Tooltip>}>
                                          <Button
                                            variant="outline-danger"
                                            onClick={() => handleDeleteExercise(intervention._id)}
                                            aria-label={t('Remove')}
                                          >
                                            <FaMinus />
                                          </Button>
                                        </OverlayTrigger>
                                      )
                                    )}
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

              {/* MIDDLE/RIGHT PANEL: Calendar */}
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
          </Container>

          <Footer />

          {selectedExercise && ShowInfoInterventionModal && (
            <PatientInterventionPopUp
              show={true}
              item={selectedExercise}
              handleClose={() => setShowInfoInterventionModal(false)}
            />
          )}

          {showRepeatModal && (
            <InterventionRepeatModal
              show
              mode={repeatMode}
              onHide={() => setshowRepeatModal(false)}
              onSuccess={async () => { await fetchAll(); await fetchInts(); }}
              patient={localStorage.getItem('selectedPatient') || patientUsername}
              therapistId={authStore.id}
              intervention={selectedExercise}
              defaults={modifyDefaults || undefined}
            />
          )}

          {showInterFeedbackModal &&
            selectedExercise &&
            (() => {
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
                  video={
                    (selectedLog as any)?.video
                      ? {
                          video_url: (selectedLog as any).video.video_url,
                          video_expired: (selectedLog as any).video.video_expired,
                          comment: (selectedLog as any).video.comment,
                        }
                      : undefined
                  }
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
        </div>
      </div>
    </>
  );
};

export default RehabTable;
