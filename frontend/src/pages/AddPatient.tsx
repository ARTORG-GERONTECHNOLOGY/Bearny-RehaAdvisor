import React, { useEffect } from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';
import FormRegisterPatient from '../components/forms/RegisteringForm_patient';  // Import the registration form component
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';  // For redirecting unauthorized users
import authStore from '../stores/authStore';

const AddPatient: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();  // Used for navigation

  // Authentication and role check
  useEffect(() => {
    authStore.checkAuthentication();
    if (authStore.isAuthenticated && authStore.userType !== 'Therapist') {
      // Only therapists should have access to this page
      navigate('/unauthorized');  // Redirect to unauthorized access page if not a therapist
    }
  }, [navigate]);

  return (
    <Container fluid className="d-flex flex-column vh-100">
      {/* Header Component */}
      <Header isLoggedIn={!!authStore.userType} />

      <div className="main-content my-5">
        <Row className="justify-content-center">
          <Col md={6}>
            <Card>
              <Card.Body>
                <h2 className="text-center mb-4">{t('AddaNewPatient')}</h2>

                {/* Registration Form */}
                <FormRegisterPatient pageType="patient"  therapist={authStore.id} />
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Footer Component */}
      <Footer />
    </Container>
  );
};

export default AddPatient;
