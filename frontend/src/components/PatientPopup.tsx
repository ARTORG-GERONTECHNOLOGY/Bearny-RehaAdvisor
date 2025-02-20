import React, { useEffect, useMemo, useState } from 'react';
import { Button, Col, ListGroup, Modal, Row } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import apiClient from '../api/client';
import authStore from '../stores/authStore';

interface PatientPopupProps {
  patient_id: {
    created_at: any; // Or a more specific type based on the structure of your patient object
    username: string;
  } | null;
  show: boolean;
  handleClose: () => void;
}

const PatientPopup: React.FC<PatientPopupProps> = ({ patient_id, show, handleClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [patient, setPatientData] = useState<any>(null); // Assuming patient is an object, not an array
  const [loading, setLoading] = useState<boolean>(true); // Loading state

  // Calculate elapsed days since creation, handling BSON date object
  const daysElapsed = useMemo(() => {
    if (!patient_id) return 0; // In case patient_id is null
    const createdAt = new Date(patient_id.created_at?.$date || patient_id.created_at);
    const today = new Date();
    return Math.floor((today.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  }, [patient_id]);

  const handleGoToRehab = () => {
    if (patient_id) {
      localStorage.setItem('selectedPatient', patient_id.username);
      navigate(`/rehabtable`);
    }
  };

  useEffect(() => {
    if (authStore.isAuthenticated && authStore.userType === 'Therapist' && patient_id) {
      const fetchPatientData = async () => {
        try {
          setLoading(true); // Start loading
          const response = await apiClient.get(`patients/${patient_id.username}`);
          setPatientData(response.data);
        } catch (error) {
          console.error('Error fetching patient data', error);
        } finally {
          setLoading(false); // Stop loading
        }
      };
      fetchPatientData();
    }
  }, [authStore.isAuthenticated, authStore.userType, patient_id]);

  if (!patient_id || loading) {
    return (
      <div>
        <p>{t('Loading...')}</p> {/* Or add a spinner/loading indicator */}
      </div>
    );
  }

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>{ // @ts-ignore
          patient.name}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Full-width Rehab Button */}
        <Row className="mb-4">
          <Col>
            <Button variant="primary" onClick={handleGoToRehab} className="w-100">
              {t('Go to Rehab Table')}
            </Button>
          </Col>
        </Row>

        <Row>
          {/* Basic Information */}
          <Col md={6}>
            <h5 className="mb-3">{t('Basic Information')}</h5>
            <ListGroup variant="flush">
              <ListGroup.Item><strong>{t('Username')}:</strong> { // @ts-ignore
                patient.username}</ListGroup.Item>
              <ListGroup.Item><strong>{t('First Name')}:</strong> { // @ts-ignore
                patient.first_name}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Email')}:</strong> { // @ts-ignore
                patient.email}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Phone')}:</strong> { // @ts-ignore
                patient.phone}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Gender')}:</strong> { // @ts-ignore
                patient.sex}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Therapist')}:</strong> { // @ts-ignore
                patient.therapist}</ListGroup.Item>
            </ListGroup>
          </Col>

          {/* Rehabilitation Details */}
          <Col md={6}>
            <h5 className="mb-3">{t('Rehabilitation Details')}</h5>
            <ListGroup variant="flush">
              <ListGroup.Item><strong>{t('Diagnosis')}:</strong> { // @ts-ignore
                patient.diagnosis}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Rehabilitation Duration')}:</strong> { // @ts-ignore
                patient.duration} {t('days')}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Days Passed')}:</strong> {daysElapsed} / { // @ts-ignore
                patient.duration}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Function')}:</strong> { // @ts-ignore
                Array.isArray(patient.function) ? patient.function.join(', ') : patient.function}</ListGroup.Item>
            </ListGroup>
          </Col>
        </Row>

        <hr />

        <Row>
          {/* Personal Background */}
          <Col md={6}>
            <h5 className="mb-3">{t('Personal Background')}</h5>
            <ListGroup variant="flush">
              <ListGroup.Item><strong>{t('Education Level')}:</strong> { // @ts-ignore
                patient.level_of_education}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Professional Status')}:</strong> { // @ts-ignore
                patient.professional_status}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Marital Status')}:</strong> { // @ts-ignore
                patient.marital_status}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Lifestyle')}:</strong> { // @ts-ignore
                Array.isArray(patient.lifestyle) ? patient.lifestyle.join(', ') : patient.lifestyle}</ListGroup.Item>
            </ListGroup>
          </Col>

          {/* Goals & Support */}
          <Col md={6}>
            <h5 className="mb-3">{t('Goals & Support')}</h5>
            <ListGroup variant="flush">
              <ListGroup.Item><strong>{t('Personal Goals')}:</strong> { // @ts-ignore
                Array.isArray(patient.personal_goals) ? patient.personal_goals.join(', ') : patient.personal_goals}
              </ListGroup.Item>
              <ListGroup.Item><strong>{t('Medication Intake')}:</strong> { // @ts-ignore
                patient.medication_intake}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Social Support')}:</strong> { // @ts-ignore
                patient.social_support}</ListGroup.Item>
            </ListGroup>
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer>
      </Modal.Footer>
    </Modal>
  );
};

export default PatientPopup;
