import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Col, Container, Modal, OverlayTrigger, Row, Table, Tooltip } from 'react-bootstrap';
import { FaInfoCircle, FaPlus, FaStar } from 'react-icons/fa';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import authStore from '../stores/authStore';
import apiClient from '../api/client';
import { t } from 'i18next';
import AddRecommendationModal from '../components/AddRecomendationModal';


const RehabTable: React.FC = () => {
  const navigate = useNavigate();
  const [patientData, setPatientData] = useState<any[]>([]);
  const [patientName, setPatientName] = useState<string>('John Doe');
  const [patientUsername, setPatientUsername] = useState<string>('');
  const [patientType, setPatientType] = useState<string>('');
  const [patientStartDate, setPatientStartDate] = useState<Date | null>(null);
  const [patientDuration, setPatientDuration] = useState<number>(0);
  const today = new Date();
  const tableRef = useRef<HTMLDivElement>(null);
  const [selectedExercise, setSelectedExercise] = useState<any>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [exerciseStats, setExerciseStats] = useState<any>(null);

  useEffect(() => {
    authStore.checkAuthentication();

    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
      return;
    }

    if (localStorage.getItem('selectedPatient')) {
      setPatientUsername(localStorage.getItem('selectedPatient') as string || '');
      fetchPatientData();
      fetchPatientDetails();
    }
  }, [navigate]);

  const fetchPatientData = async () => {
    try {
      const response = await apiClient.get(`patients/${localStorage.getItem('selectedPatient') || patientUsername}/rehab`);
      //localStorage.removeItem('selectedPatient');
      setPatientName(response.data.patient_name);
      setPatientData(response.data.reha_data);
      setPatientType(response.data.function || '');
    } catch (error) {
      console.error('Error fetching patient data', error);
    }
  };

  const fetchPatientDetails = async () => {
    try {
      const response = await apiClient.get(`patients/${localStorage.getItem('selectedPatient')}`);
      const patientData = response.data;
      const created_at = patientData.created_at;
      const duration = patientData.duration;
      setPatientName(`${patientData.first_name} ${patientData.name}` || '');
      // Handle the $date format and convert it to a JavaScript Date object
      // Parse the created_at string into a JavaScript Date object

      const startDate = created_at ? new Date(created_at) : new Date();
      setPatientStartDate(startDate);
      setPatientDuration(duration);
    } catch (error) {
      console.error('Error fetching patient details', error);
    }
  };

  const generateDateRange = () => {
    if (!patientStartDate || patientDuration <= 0) return [];
    const dates = [];
    for (let i = 0; i < patientDuration; i++) {
      const date = new Date(patientStartDate);
      date.setDate(patientStartDate.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const allDates = generateDateRange();

  const formatDate = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const handleExerciseClick = (intervention: any) => {
    if (intervention) {
      setSelectedExercise(intervention);
      setShowModal(true);
    }
  };

  const handleAddRecommendation = async (recommendationId: number) => {
    try {
      await apiClient.post('recommendations/add-to-patient/', {
        patient_id: patientUsername,
        intervention_id: recommendationId,
      });
      setShowAddModal(false); // Close the modal after adding
      fetchPatientData(); // Refresh the table data
    } catch (error) {
      console.error('Error adding recommendation:', error);
    }
  };

  const handleShowInfo = (intervention: any) => {
    const completedCount = intervention.completion_dates.length;
    const totalCount =
      completedCount + intervention.not_completed_dates.length + intervention.future_dates.length;
    const averageRating =
      intervention.feedback.reduce((sum: number, fb: any) => sum + (fb.rating || 0), 0) /
      (intervention.feedback.length || 1);

    setExerciseStats({
      name: intervention.intervention_title,
      completedCount,
      totalCount,
      averageRating: averageRating.toFixed(1),
    });

    setShowInfoModal(true);
  };

  const handleDeleteExercise = async (interventionTitle: string) => {
    try {
      const selectedIntervention = patientData.find(
        (intervention) => intervention.intervention_title === interventionTitle
      );

      if (!selectedIntervention) {
        console.error('Intervention not found');
        return;
      }

      const { intervention_id } = selectedIntervention;

      await apiClient.post('recommendations/remove-from-patient', {
        patient_id: patientUsername,
        intervention_id,
      });

      console.log('Recommendation removed for patient:', patientUsername);

      setPatientData((prevData) =>
        prevData.map((intervention) => {
          if (intervention.intervention_id === intervention_id) {
            const now = new Date();
            const updatedFutureDates = intervention.future_dates.filter(
              (date: string) => new Date(date) <= now
            );

            return {
              ...intervention,
              recomended_t: false,
              future_dates: updatedFutureDates,
            };
          }

          return intervention;
        })
      );

      setShowInfoModal(false);
    } catch (error) {
      console.error('Error removing recommendation:', error);
    }
  };

  return (
    <div className="d-flex flex-column vh-100">
      <Header isLoggedIn={authStore.isAuthenticated} />

      <Container className="flex-grow-1 my-4">
        <Row className="justify-content-center">
          <Col xs={12} lg={10}>
            <h2 className="text-center mb-4">{patientName}</h2>
            <Button
              variant="primary"
              onClick={() => setShowAddModal(true)}
              className="mb-3"
            >
              <FaPlus /> {t("Add Recommendation")}
            </Button>
            <div className="table-responsive shadow-sm p-3 mb-5 bg-white rounded" style={{ maxHeight: '400px' }}>
              <Table bordered hover className="table-striped">
                <thead style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'white' }}>
                <tr>
                  <th>{t("Day")}</th>
                  {patientData.map((intervention, idx) => (
                    <th key={idx}>
                      {intervention.intervention_title}{' '}
                      <OverlayTrigger
                        placement="top"
                        overlay={
                          <Tooltip>
                            {t("Show description and average stats for")} {intervention.intervention_title}
                          </Tooltip>
                        }
                      >
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => handleShowInfo(intervention)}
                        >
                          <FaInfoCircle />
                        </Button>
                      </OverlayTrigger>
                    </th>
                  ))}
                </tr>
                </thead>
                <tbody style={{ maxHeight: '350px', overflow: 'scroll', tableLayout: 'fixed' } }>
                {allDates.map((date, idx) => (
                  <tr key={idx}>
                    <td
                      style={{
                        fontWeight: date.toDateString() === today.toDateString() ? 'bold' : 'normal',
                      }}
                    >
                      {`${t("Day")} ${idx + 1}`} ({formatDate(date)})
                    </td>
                    {patientData.map((intervention, intIdx) => {
                      const formattedDate = formatDate(date)
                      const isDone = intervention.completion_dates.some(
                        (d: string) => formatDate(new Date(d)) === formattedDate,
                      )
                      const isNotDone = intervention.not_completed_dates.some(
                        (d: string) => formatDate(new Date(d)) === formattedDate,
                      )
                      const isFuture = intervention.future_dates.some(
                        (d: string) => formatDate(new Date(d)) === formattedDate,
                      )
                      return (
                        <td
                          key={intIdx}
                          className="text-center align-middle"
                          style={{
                            backgroundColor: isDone
                              ? '#28a745' // Green for done
                              : isNotDone
                                ? '#dc3545' // Red for not done
                                : isFuture
                                  ? '#FFA500' // Orange for future
                                  : '#d3d3d3', // Gray for no data
                            color: isDone || isNotDone ? 'white' : 'black',
                            fontWeight: isDone || isNotDone ? 'bold' : 'normal',
                          }}
                          onClick={() =>
                            (isDone || isNotDone || isFuture) && handleExerciseClick(intervention)
                          }
                        >
                          {isDone ? t('Done') : isNotDone ? t('Not Done') : isFuture ? t('Upcoming') : ''}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                </tbody>
              </Table>
            </div>
          </Col>
        </Row>
      </Container>

      <Footer />

      <AddRecommendationModal
        show={showAddModal}
        onHide={() => setShowAddModal(false)}
        onAdd={handleAddRecommendation}
        patient={patientUsername}
        existingRecommendations={patientData.map((intervention) => intervention.intervention_id)}
        patientFunction={patientType}
      />

      {/* Modal for viewing exercise details */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{t("Intervention Details")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedExercise ? (
            <>
              <h5>{selectedExercise.intervention_title}</h5>
              <p>{selectedExercise.description}</p>
              <p>
                <FaStar size={24} color={'gold'} /> {selectedExercise.feedback?.[0]?.rating ?? '0'}  / 5
              </p>
            </>
          ) : (
            <p>{t("No Intervention selected.")}</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            {t("Close")}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Info Modal for exercise stats */}
      <Modal show={showInfoModal} onHide={() => setShowInfoModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{exerciseStats?.name} {t("Information")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {exerciseStats && (
            <>
              <p>
                <strong>{t("Completed:")}</strong> {exerciseStats.completedCount} / {exerciseStats.totalCount}
              </p>
              <p>
                <strong>{t("Average Rating:")}</strong> {exerciseStats.averageRating}{' '}
                <FaStar size={24} color={'gold'} />
              </p>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="danger" onClick={() => handleDeleteExercise(exerciseStats?.name || '')}>
            {t("Delete Exercise")}
          </Button>
          <Button variant="secondary" onClick={() => setShowInfoModal(false)}>
             {t("Close")}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default RehabTable;
