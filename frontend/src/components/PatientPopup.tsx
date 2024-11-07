import React, { useMemo } from 'react';
import { Modal, Button, ListGroup, Row, Col } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface PatientPopupProps {
  patient: any;
  show: boolean;
  handleClose: () => void;
}

const PatientPopup: React.FC<PatientPopupProps> = ({ patient, show, handleClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Calculate elapsed days since creation, handling BSON date object
  const daysElapsed = useMemo(() => {
    const createdAt = new Date(patient.created_at?.$date || patient.created_at);
    const today = new Date();
    return Math.floor((today.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  }, [patient.created_at]);

  const handleGoToRehab = () => {
    localStorage.setItem('selectedPatient', patient.username);
    navigate(`/rehabtable`);
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{patient.name}</Modal.Title>
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
              <ListGroup.Item><strong>{t('Username')}:</strong> {patient.username}</ListGroup.Item>
              <ListGroup.Item><strong>{t('First Name')}:</strong> {patient.first_name}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Email')}:</strong> {patient.email}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Phone')}:</strong> {patient.phone}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Gender')}:</strong> {patient.sex}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Therapist')}:</strong> {patient.therapist}</ListGroup.Item>
            </ListGroup>
          </Col>

          {/* Rehabilitation Details */}
          <Col md={6}>
            <h5 className="mb-3">{t('Rehabilitation Details')}</h5>
            <ListGroup variant="flush">
              <ListGroup.Item><strong>{t('Diagnosis')}:</strong> {patient.diagnosis}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Rehabilitation Duration')}:</strong> {patient.duration} {t('days')}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Days Passed')}:</strong> {daysElapsed} / {patient.duration}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Function')}:</strong> {Array.isArray(patient.function) ? patient.function.join(', ') : patient.function}</ListGroup.Item>
            </ListGroup>
          </Col>
        </Row>

        <hr />

        <Row>
          {/* Personal Background */}
          <Col md={6}>
            <h5 className="mb-3">{t('Personal Background')}</h5>
            <ListGroup variant="flush">
              <ListGroup.Item><strong>{t('Education Level')}:</strong> {patient.level_of_education}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Professional Status')}:</strong> {patient.professional_status}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Marital Status')}:</strong> {patient.marital_status}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Lifestyle')}:</strong> {Array.isArray(patient.lifestyle) ? patient.lifestyle.join(', ') : patient.lifestyle}</ListGroup.Item>
            </ListGroup>
          </Col>

          {/* Goals & Support */}
          <Col md={6}>
            <h5 className="mb-3">{t('Goals & Support')}</h5>
            <ListGroup variant="flush">
              <ListGroup.Item><strong>{t('Personal Goals')}:</strong> {Array.isArray(patient.personal_goals) ? patient.personal_goals.join(', ') : patient.personal_goals}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Medication Intake')}:</strong> {patient.medication_intake}</ListGroup.Item>
              <ListGroup.Item><strong>{t('Social Support')}:</strong> {patient.social_support}</ListGroup.Item>
            </ListGroup>
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          {t('Close')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PatientPopup;
