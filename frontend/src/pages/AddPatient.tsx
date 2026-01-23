import React, { useEffect } from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import RegisterPatientForm from '../components/AddPatient/RegisterPatientForm';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import useAuthGuard from '../hooks/useAuthGuard';
import authStore from '../stores/authStore';

const AddPatient: React.FC = () => {
  const { t } = useTranslation();

  // Restrict to therapists
  useAuthGuard('Therapist');

  const isAuthenticated = !!authStore.userType;
  const therapistId = authStore.id;

  useEffect(() => {
    document.title = t('AddaNewPatient') || 'Add New Patient';
  }, [t]);

  return (
    <Container fluid className="d-flex flex-column vh-100">
      <Header isLoggedIn={isAuthenticated} />

      <main className="my-5 flex-grow-1">
        <Row className="justify-content-center">
          <Col xs={12} md={8} lg={6}>
            <Card className="shadow-sm">
              <Card.Body>
                <h2 className="text-center mb-4">{t('AddaNewPatient')}</h2>
                <RegisterPatientForm therapist={therapistId} />
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </main>

      <Footer />
    </Container>
  );
};

export default AddPatient;
export { AddPatient };