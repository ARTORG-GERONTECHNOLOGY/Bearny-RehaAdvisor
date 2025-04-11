import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Col, Container, Modal, OverlayTrigger, Row, Table, Tooltip, Nav, Navbar, Card, Form, Badge} from 'react-bootstrap';
import { FaInfoCircle, FaPlus, FaStar, FaMinus } from 'react-icons/fa';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import authStore from '../stores/authStore';
import apiClient from '../api/client';
import { useTranslation } from 'react-i18next';
import Select from 'react-select';
import config from '../config/config.json'
import AddInterventionModal from '../components/AddRecomendationModal';
import InterventionCalendar from '../components/InterventionCalendar';
import InterventionRepeatModal from '../components/InterventionRepeatModal';
import PatientInterventionPopUp from '../components/PatientInterventionPopUp';
import {generateTagColors, getBadgeVariantFromUrl, getMediaTypeLabelFromUrl} from '../utils/interventions';

const RehabTable: React.FC = () => {
  const navigate = useNavigate();
  const [patientData, setPatientData] = useState<any[]>([]);
  const [patientName, setPatientName] = useState<string>('John Doe');
  const [patientUsername, setPatientUsername] = useState<string>('');
  const [patientType, setPatientType] = useState<string>('');
  const [selectedExercise, setSelectedExercise] = useState<any>(null);
  const [showInterFeedbackModal, setShowInterFeedbackModal] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [showExerciseStats, setShowExerciseStats] = useState<any>(null);
  const [exerciseStats, setExerciseStats] = useState<any>(null);
  const [repeatSettings, setRepeatSettings] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState('patient');
  const [allInterventions, setAllInterventions] = useState([]);
  const [showRepeatModal, setshowRepeatModal] = useState<boolean>(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [filteredRecommendations, setFilteredRecommendations] = useState<any[]>([]);
  const [recommendationTypeFilter, setRecommendationTypeFilter] = useState<string>('');
  const [ShowInfoInterventionModal, setShowInfoInterventionModal] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const { i18n, t } = useTranslation();
  const userLang = i18n.language?.slice(0, 2) || 'en';
  // @ts-ignore
  const specialisations = authStore.specialisation.split(',').map(s => s.trim())
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
      const res = await apiClient.get(`patients/rehabilitation-plan/therapist/${localStorage.getItem('selectedPatient') || patientUsername}/`);
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
      setFilteredRecommendations(res.data)
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
      setPatientUsername(localStorage.getItem('selectedPatient') as string || '');
      setPatientName(localStorage.getItem('selectedPatientName') as string || '');
    
      fetchAll();
      fetchInts();
    }
  }, [navigate]);

  const handleExerciseClick = (intervention: any) => {
    if (intervention) {
      setSelectedExercise(intervention);
      setShowInfoInterventionModal(true);
    }
  };

  const handleAddIntervention =  (intervention: number) => {
    setshowRepeatModal(true)
    setSelectedExercise(intervention);
  };

  const showStats = (intervention: any) => {
    if (intervention) {
      setSelectedExercise(intervention);
      setShowExerciseStats(true);
    }
  };


  const handleDeleteExercise = async (intervention) => {
    try {
    const res = await apiClient.post('interventions/remove-from-patient/', 
        {
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


  // Generate colors dynamically
  const tagColors = generateTagColors(config.RecomendationInfo.tags);


  // Filter recommendations based on selected filters and search term
  useEffect(() => {
    let filtered = recommendations;

    if (patientTypeFilter) {
      filtered = filtered.filter((rec) =>
        // Check if `rec.patient_types` contains a matching patient type or diagnosis
        rec.patient_types.some((pt) => {
          const matchesType = patientTypeFilter ? pt.diagnosis === patientTypeFilter : true;
          return matchesType;
        })
      );
    }

    if (contentTypeFilter) {
      // @ts-ignore
      filtered = filtered.filter((rec) => rec.content_type === contentTypeFilter);
    }

    if (tagFilter.length > 0) {
      // @ts-ignore
      filtered = filtered.filter((rec) =>
        rec.tags.some((tag) => tagFilter.includes(tag))
      );
    }

    if (benefitForFilter.length > 0) {
      // @ts-ignore
      filtered = filtered.filter((rec) =>
        rec.benefitFor.some((benefit) => benefitForFilter.includes(benefit))
      );
    }

    if (searchTerm) {

      filtered = filtered.filter((rec) =>
        // @ts-ignore
        rec.title.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    setFilteredRecommendations(filtered);
  }, [
    searchTerm,
    patientTypeFilter,
    contentTypeFilter,
    benefitForFilter,
    tagFilter,
    recommendations,
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
                <Nav variant="tabs" activeKey={selectedTab} onSelect={(k) => setSelectedTab(k || 'patient')}>
                  <Nav.Item>
                    <Nav.Link eventKey="patient">{t("Patient's Interventions")}</Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link eventKey="all">{t("All Interventions")}</Nav.Link>
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
                      <Form.Select value={patientTypeFilter} onChange={(e) => setPatientTypeFilter(e.target.value)}>
                        <option value="">{t('Filter by Patient Type')}</option>
                        {diagnoses.map((type: string) => (
                          <option key={type} value={type}>{t(type)}</option>
                        ))}
                      </Form.Select>
                    </Col>
                    <Col>
                      <Form.Select value={contentTypeFilter} onChange={(e) => setContentTypeFilter(e.target.value)}>
                        <option value="">{t('Filter by Content Type')}</option>
                        {config.RecomendationInfo.types.map((type) => (
                          <option key={type} value={type}>{t(type)}</option>
                        ))}
                      </Form.Select>
                    </Col>
                  </Row>

                  <Row>
                    <Col>
                      <Select
                        isMulti
                        options={config.RecomendationInfo.tags.map(tag => ({ value: tag, label: t(tag) }))}
                        value={tagFilter.map(tag => ({ value: tag, label: tag }))}
                        onChange={opts => setTagFilter(opts.map(opt => opt.value))}
                        placeholder={t('Filter by Tags')}
                      />
                    </Col>
                    <Col>
                      <Select
                        isMulti
                        options={config.RecomendationInfo.benefits.map(b => ({ value: b, label: t(b) }))}
                        value={benefitForFilter.map(b => ({ value: b, label: b }))}
                        onChange={opts => setBenefitForFilter(opts.map(opt => opt.value))}
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
                  : filteredRecommendations).map((intervention) => {
                  const patientHasIntervention = patientData?.interventions?.find(
                    (item) => item._id === intervention._id
                  );
                  const hasFutureDates = patientHasIntervention?.dates?.some((d) => new Date(d.datetime) > new Date());

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
                          {t(intervention.content_type.charAt(0).toUpperCase() + intervention.content_type.slice(1))}
                        </div>
                        <Badge bg={getBadgeVariantFromUrl(intervention.media_url, intervention.link)}>
                          {getMediaTypeLabelFromUrl(intervention.media_url, intervention.link)}
                        </Badge>
                      </div>

                      <div onClick={(e) => e.stopPropagation()}>
                        {selectedTab === 'all' && !hasFutureDates && (
                          <Button size="sm" variant="success" onClick={() => handleAddIntervention(intervention)} className="me-1">
                            <FaPlus />
                          </Button>
                        )}
                        {selectedTab === 'all' && hasFutureDates && (
                          <Button size="sm" variant="danger" onClick={() => handleDeleteExercise(intervention._id)}>
                            <FaMinus />
                          </Button>
                        )}
                        {selectedTab === 'patient' && (
                          <>
                            <Button size="sm" variant="primary" onClick={() => showStats(intervention)}>{t('Statistics')}</Button>
                            <Button size="sm" variant="danger" onClick={() => handleDeleteExercise(intervention._id)}>
                              <FaMinus />
                            </Button>
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

      {selectedExercise && ShowInfoInterventionModal && <PatientInterventionPopUp show={true} item={selectedExercise} handleClose={() => setShowInfoInterventionModal(false)} />}

      {showRepeatModal && (
        <InterventionRepeatModal
          show={true}
          onHide={() => setshowRepeatModal(false)}
          onSuccess={fetchAll}
          patient={localStorage.getItem('selectedPatient') || patientUsername}
          intervention={selectedExercise}
        />
      )}

      {showInterFeedbackModal && selectedExercise && <Modal show={showInterFeedbackModal} onHide={() => setShowInterFeedbackModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{selectedExercise.title} ({selectedDate})</Modal.Title> 
        </Modal.Header>
        <Modal.Body>
          <>
            <h5>{t("Feedback")}</h5>
           
            {(() => {
              const intervention = patientData?.interventions?.find(i => i._id === selectedExercise?._id);
              const dayData = intervention?.dates?.find(d =>
                new Date(d.datetime).toISOString().slice(0, 10) === selectedDate
              );
              const feedbackEntries = dayData?.feedback || [];

              return (
                <>
                  {feedbackEntries.length > 0 ? (
                    feedbackEntries.map((entry, idx) => {
                      const questionText =
                        entry.question?.translations?.find(t => t.language === userLang)?.text ||
                        entry.question?.translations?.find(t => t.language === 'en')?.text ||
                        "";
                    
                      return (
                        <div key={idx} className="mb-3">
                          <hr />
                          <p><strong>{questionText}</strong></p>
                          <ul className="mb-0">
                            {entry.answer.map((ans, i) => {
                              const translation = ans.translations.find(t => t.language === userLang)?.text
                                || ans.translations.find(t => t.language === 'en')?.text
                                || ans.key;
                    
                              return <li key={i}>{translation}</li>;
                            })}
                          </ul>
                        </div>
                      );
                    })
                  ) : (
                    <p>{t("No feedback available")}</p>
                  )}
                </>
              );
            })()}

          </>
        </Modal.Body>
        <Modal.Footer>
        </Modal.Footer>
      </Modal>}

      {selectedExercise && showExerciseStats && <Modal show={showExerciseStats} onHide={() => setShowExerciseStats(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{selectedExercise.title} {t("Information")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
        {(() => {
              const intervention = patientData?.interventions?.find(i => i._id === selectedExercise?._id);

              if (!intervention) return <p>{t("No statistics available")}</p>;
              
              const totalCount = intervention.dates?.length || 0;
              const completedCount = intervention.dates?.filter(d => d.status === 'completed')?.length || 0;
              const feedbackCount = intervention.dates?.filter(d => d.feedback?.length > 0)?.length || 0;
              const currentTotalCount = intervention.currentTotalCount;
              

              if (intervention) {
                return (
                  <>
                      <strong>{t("Total Sessions")}:</strong> {totalCount}<br />
                      <div className="mb-4">
                      <div className="mb-4">
                        <div className="progress">
                          <div
                            className="progress-bar bg-success"
                            role="progressbar"
                            style={{ width: `${isFinite(completedCount / totalCount * 100) ? completedCount / totalCount * 100 : 0}%` }} // assuming 1-5 scale
                            aria-valuenow={isFinite(completedCount / totalCount * 100) ? completedCount / totalCount * 100 : 0}
                            aria-valuemin="0"
                            aria-valuemax="100"
                          >
                            {isFinite(Math.floor(completedCount / totalCount * 100)) ? completedCount / totalCount * 100 : 0}%
                          </div>
                          <div
                            className="progress-bar bg-danger"
                            role="progressbar"
                            style={{ width: `${Math.floor((currentTotalCount - completedCount) / totalCount * 100) ? Math.floor((currentTotalCount - completedCount) / totalCount * 100) : 0}%`}} // assuming 1-5 scale
                            aria-valuenow={Math.floor((currentTotalCount - completedCount) / totalCount * 100) ? Math.floor((currentTotalCount - completedCount) / totalCount * 100) : 0 }
                            aria-valuemin="0"
                            aria-valuemax="100"
                          >
                            {isFinite(Math.floor((currentTotalCount - completedCount) / totalCount * 100)) ? Math.floor((currentTotalCount - completedCount) / totalCount * 100) : 0}%
                          </div>
                          <div
                            className="progress-bar bg-warning"
                            role="progressbar"
                            style={{ width: `${isFinite(Math.floor((totalCount - currentTotalCount) / totalCount * 100)) ? Math.floor((totalCount - currentTotalCount) / totalCount * 100) : 100}%`}} // assuming 1-5 scale
                            aria-valuenow={isFinite(Math.floor((totalCount - currentTotalCount) / totalCount * 100)) ? Math.floor((totalCount - currentTotalCount) / totalCount * 100) : 100}
                            aria-valuemin="0"
                            aria-valuemax="100"
                          >
                            {isFinite(Math.floor((totalCount - currentTotalCount) / totalCount * 100)) ? Math.floor((totalCount - currentTotalCount) / totalCount * 100) : 100}%
                          </div>
                        </div>
                      </div>

                        <strong>{t("Current Sessions")}:</strong>
                        <div className="mb-4">
                        <div className="progress">
                          <div
                            className="progress-bar bg-success"
                            role="progressbar"
                            style={{ width: `${isFinite(completedCount / currentTotalCount * 100) ? (completedCount / currentTotalCount * 100) : 0}%` }} // assuming 1-5 scale
                            aria-valuenow={isFinite(completedCount / currentTotalCount * 100) ? (completedCount / currentTotalCount * 100) : 0}
                            aria-valuemin="0"
                            aria-valuemax="100"
                          >
                            {isFinite(completedCount / currentTotalCount * 100) ? Math.floor(completedCount / currentTotalCount * 100) : 0}%
                          </div>
                          <div
                            className="progress-bar bg-danger"
                            role="progressbar"
                            style={{ width: `${isFinite((currentTotalCount - completedCount) / currentTotalCount * 100) ? (currentTotalCount - completedCount) / currentTotalCount * 100 : 100}%` }} // assuming 1-5 scale
                            aria-valuenow={isFinite((currentTotalCount - completedCount) / currentTotalCount * 100) ? (currentTotalCount - completedCount) / currentTotalCount * 100 : 100}
                            aria-valuemin="0"
                            aria-valuemax="100"
                          >
                            {isFinite((currentTotalCount - completedCount) / currentTotalCount * 100) ? Math.floor((currentTotalCount - completedCount) / currentTotalCount * 100) : 100}%
                          </div>
                        </div>
                        </div>

                      <strong>{t("Current Feedback Answered")}:</strong>
                      <div className="mb-4">
                      <div className="progress">
                          <div
                            className="progress-bar bg-success"
                            role="progressbar"
                            style={{ width: `${isFinite(feedbackCount / currentTotalCount * 100) ? (feedbackCount / currentTotalCount * 100) : 0}%` }} // assuming 1-5 scale
                            aria-valuenow={isFinite(feedbackCount / currentTotalCount * 100) ? (feedbackCount / currentTotalCount * 100) : 0}
                            aria-valuemin="0"
                            aria-valuemax="100"
                          >
                            {isFinite(feedbackCount / currentTotalCount * 100) ? Math.floor(feedbackCount / currentTotalCount * 100) : 0}%
                          </div>
                          <div
                            className="progress-bar bg-danger"
                            role="progressbar"
                            style={{ width: `${isFinite((currentTotalCount - feedbackCount) / currentTotalCount * 100) ? (currentTotalCount - feedbackCount) / currentTotalCount * 100 : 100}%` }} // assuming 1-5 scale
                            aria-valuenow={isFinite((currentTotalCount - feedbackCount) / currentTotalCount * 100) ? (currentTotalCount - feedbackCount) / currentTotalCount * 100 : 100 }
                            aria-valuemin="0"
                            aria-valuemax="100"
                          >
                            {isFinite((currentTotalCount - feedbackCount) / currentTotalCount * 100) ? Math.floor(currentTotalCount - feedbackCount) / currentTotalCount * 100 : 100}%
                          </div>
                        </div>
                        </div>
                      </div>
                  </>


                );
              } else {
                return <p>{t("No feedback available")}</p>;
              }
            })()}
        </Modal.Body>
        <Modal.Footer>
        </Modal.Footer>
      </Modal>}
    
      
      

    </div>
    </>
  );
};

export default RehabTable;
