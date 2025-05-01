import React, { useEffect, useState } from 'react';
import { Button, Col, Container, Row } from 'react-bootstrap';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import LoginForm from '../components/HomePage/LoginForm';
import { useTranslation } from 'react-i18next';
import authStore from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
const PatientHome: React.FC = () => {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { t } = useTranslation();
  const navigate = useNavigate();

  const toggleLoginModal = () => setShowLoginModal((prev) => !prev);
  useEffect(() => {
    authStore.checkAuthentication();
    if (authStore.isAuthenticated || authStore.userType === 'Patient') {
      navigate('/patient');
    }
  }, [navigate]);
  return (
    <div className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={authStore.isAuthenticated} />
      <Container
        fluid
        className="flex-grow-1 d-flex flex-column justify-content-center px-3 px-sm-4"
      >
        <Row className="justify-content-center align-items-center text-center flex-grow-1">
          <Col xs={12} md={8} lg={6}>
            <h1 className="mb-3 display-5">Tele-rehabilitation</h1>
            <p className="lead mb-4">{t('Welcome to the Patient Login Page')}</p>
            <img
              src="/home.jpg"
              alt="Tele-rehabilitation"
              className="img-fluid mb-4"
              style={{ maxHeight: '200px', objectFit: 'contain' }}
            />
          </Col>
        </Row>

        <Row className="justify-content-center mb-5 text-center">
          <Col xs={10} sm={6} md={4} className="mb-3 mb-md-0">
            <Button className="w-100 py-3 fs-5" onClick={toggleLoginModal}>
              {t('Login')}
            </Button>
          </Col>
        </Row>
      </Container>
      <Footer />
      {/* Login Modal */}
      <LoginForm show={showLoginModal} pageType={'patient'} handleClose={toggleLoginModal} />
    </div>
  );
};

export default PatientHome;
