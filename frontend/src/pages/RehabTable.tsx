import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Col, Container, Row, Nav, Card, Form, Badge } from 'react-bootstrap';
import { FaPlus, FaMinus } from 'react-icons/fa';
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

import { filterInterventions } from '../utils/filterUtils';
import { getBadgeVariantFromUrl, getMediaTypeLabelFromUrl } from '../utils/interventions';

const RehabTable: React.FC = () => {
  const [patientData, setPatientData] = useState<{ interventions: Intervention[] }>({
    interventions: [],
  });
  const [selectedExercise, setSelectedExercise] = useState<Intervention | null>(null);
  const [showExerciseStats, setShowExerciseStats] = useState<boolean>(false);

  const [allInterventions, setAllInterventions] = useState<Intervention[]>([]);
  const [recommendations, setRecommendations] = useState<Intervention[]>([]);
  const [filteredRecommendations, setFilteredRecommendations] = useState<Intervention[]>([]);
  const navigate = useNavigate();
  const [patientName, setPatientName] = useState<string>('John Doe');
  const [patientUsername, setPatientUsername] = useState<string>('');
  const [showInterFeedbackModal, setShowInterFeedbackModal] = useState<boolean>(false);
  const [selectedTab, setSelectedTab] = useState('patient');
  const [showRepeatModal, setshowRepeatModal] = useState<boolean>(false);
  const [ShowInfoInterventionModal, setShowInfoInterventionModal] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const { i18n, t } = useTranslation();
  //const [selectedExercise, setSelectedExercise] = useState<Intervention | null>(null);
  //const [allInterventions, setAllInterventions] = useState<Intervention[]>([]);
  //const [patientData, setPatientData] = useState<{
  //interventions: Intervention[];
  //}>({ interventions: [] });

  const userLang = i18n.language?.slice(0, 2) || 'en';
  const specialisations = authStore.specialisation.split(',').map((s) => s.trim());
  const diagnoses = Array.isArray(specialisations)
    ? specialisations.flatMap((spec) => config?.patientInfo?.function?.[spec]?.diagnosis || [])
    : config?.patientInfo?.function?.[specialisations]?.diagnosis || [];

  const [searchTerm, setSearchTerm] = useState('');
  const [patientTypeFilter, setPatientTypeFilter] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [benefitForFilter, setBenefitForFilter] = useState<string[]>([]);

  const fetchAll = async () => {
    try {
      const res = await apiClient.get(
        `patients/rehabilitation-plan/therapist/${localStorage.getItem('selectedPatient') || patientUsername}/`
      );
      setPatientData(res.data);
    } catch (e) {
      console.error('Error loading all interventions', e);
    }
  };
  const fetchInts = async () => {
    try {
      const res = await apiClient.get('interventions/all/');
      setAllInterventions(res.data);
      setRecommendations(res.data);
      setFilteredRecommendations(res.data);
    } catch (e) {
      console.error('Error loading all interventions', e);
    }
  };

  useEffect(() => {
    authStore.checkAuthentication();

    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
      return;
    }

    if (localStorage.getItem('selectedPatient')) {
      setPatientUsername((localStorage.getItem('selectedPatient') as string) || '');
      setPatientName((localStorage.getItem('selectedPatientName') as string) || '');

      fetchAll();
      fetchInts();
    }
  }, [navigate]);

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

  const handleAddIntervention = (intervention: number) => {
    setshowRepeatModal(true);
    setSelectedExercise(intervention);
  };

  const handleDeleteExercise = async (intervention) => {
    try {
      const res = await apiClient.post('interventions/remove-from-patient/', {
        patientId: patientUsername,
        intervention: intervention,
      });
      if (res.status == 200 || res.status == 201) {
        fetchAll();
        fetchInts();
      }
    } catch (e) {
      console.error('Error loading all interventions', e);
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

  return (
    <>
      <div className="d-flex flex-column vh-100">
        <Header isLoggedIn={authStore.isAuthenticated} />

        <Container fluid className="mt-4">
          <Row>
            <Col>
              <h2 className="text-center mb-4">{patientName}</h2>
            </Col>
          </Row>

          <Row>
            {/* LEFT PANEL: Interventions + Tab Switcher */}
            <Col md={3} style={{ display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
              {/* Tab Switcher */}
              <Card className="mb-3">
                <Card.Header>
                  <Nav
                    variant="tabs"
                    activeKey={selectedTab}
                    onSelect={(k) => setSelectedTab(k || 'patient')}
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
              {/* Intervention List - Scrollable */}
              <Card style={{ flex: 1, overflowY: 'auto' }}>
                <Card.Body>
                  {(selectedTab === 'patient'
                    ? allInterventions.filter((intervention) =>
                        patientData?.interventions?.some((item) => item._id === intervention._id)
                      )
                    : filteredRecommendations
                  ).map((intervention) => {
                    const patientHasIntervention = patientData?.interventions?.find(
                      (item) => item._id === intervention._id
                    );
                    const hasFutureDates = patientHasIntervention?.dates?.some(
                      (d) => new Date(d.datetime) > new Date()
                    );

                    return (
                      <div
                        key={intervention._id}
                        className="d-flex justify-content-between align-items-center mb-2 p-2 rounded shadow-sm"
                        style={{ cursor: 'pointer', backgroundColor: '#f8f9fa' }}
                        onClick={() => handleExerciseClick(intervention)}
                      >
                        <div>
                          <strong>{intervention.title}</strong>
                          <div className="text-muted">
                            {t(
                              intervention.content_type.charAt(0).toUpperCase() +
                                intervention.content_type.slice(1)
                            )}
                          </div>
                          <Badge
                            bg={getBadgeVariantFromUrl(intervention.media_url, intervention.link)}
                          >
                            {getMediaTypeLabelFromUrl(intervention.media_url, intervention.link)}
                          </Badge>
                        </div>

                        <div onClick={(e) => e.stopPropagation()}>
                          {selectedTab === 'all' && !hasFutureDates && (
                            <Button
                              size="sm"
                              variant="success"
                              onClick={() => handleAddIntervention(intervention)}
                              className="me-1"
                            >
                              <FaPlus />
                            </Button>
                          )}
                          {selectedTab === 'all' && hasFutureDates && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleDeleteExercise(intervention._id)}
                            >
                              <FaMinus />
                            </Button>
                          )}
                          {selectedTab === 'patient' && (
                            <>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => showStats(intervention)}
                              >
                                {t('Statistics')}
                              </Button>
                              {hasFutureDates && (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => handleDeleteExercise(intervention._id)}
                                >
                                  <FaMinus />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </Card.Body>
              </Card>
            </Col>

            {/* MIDDLE PANEL: Calendar */}
            <Col md={9}>
              <InterventionCalendar
                interventions={patientData.interventions || []}
                onSelectEvent={(event) => {
                  setSelectedExercise(event);
                  setSelectedDate(event.start.toISOString().split('T')[0]);
                  setShowInterFeedbackModal(true);
                }}
              />
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
            show={true}
            onHide={() => setshowRepeatModal(false)}
            onSuccess={fetchAll}
            patient={localStorage.getItem('selectedPatient') || patientUsername}
            intervention={selectedExercise}
          />
        )}

        {showInterFeedbackModal && selectedExercise && (
          <InterventionFeedbackModal
            show={showInterFeedbackModal}
            onClose={() => setShowInterFeedbackModal(false)}
            exercise={selectedExercise}
            feedbackEntries={
              patientData?.interventions
                ?.find((int) => int._id === selectedExercise._id)
                ?.dates?.find((d) => d.datetime.split('T')[0] === selectedDate)?.feedback || []
            }
            date={selectedDate}
            userLang={userLang}
          />
        )}

        <InterventionStatsModal
          show={showExerciseStats}
          onClose={() => setShowExerciseStats(false)}
          exercise={selectedExercise}
          interventionData={patientData.interventions.find(
            (item) => item._id === selectedExercise?._id
          )}
          t={t}
        />
      </div>
    </>
  );
};

export default RehabTable;
