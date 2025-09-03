import React, { useEffect, useState } from 'react';
import { Button, Col, Container, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import LoginForm from '../components/HomePage/LoginForm';
import FormRegister from '../components/HomePage/RegisteringForm';
import authStore from '../stores/authStore';

const Home: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  useEffect(() => {
    authStore.checkAuthentication();
    if (authStore.isAuthenticated && authStore.userType) {
      navigate(`/${authStore.userType.toLowerCase()}`);
    }
  }, [navigate]);

  const toggleLoginModal = () => setShowLoginModal((prev) => !prev);
  const toggleRegisterModal = () => setShowRegisterModal((prev) => !prev);

  return (
    <div className="d-flex flex-column min-vh-100">
      {/* Show Register action in header when logged out and on home */}
      <Header
        isLoggedIn={authStore.isAuthenticated}
        showRegisterAction={!authStore.isAuthenticated}
        onRegister={toggleRegisterModal}
      />

      <Container
        fluid
        className="flex-grow-1 d-flex flex-column justify-content-center px-3 px-sm-4 px-md-5"
      >
        <Row className="justify-content-center align-items-center text-center flex-grow-1">
          <Col xs={12} sm={10} md={8} lg={6}>
            <h1 className="mb-3 fs-2 fs-md-1 fw-bold">Tele-rehabilitation</h1>
            <p className="fs-6 fs-md-5 mb-4">
              {t('Sign in as a Therapist or Patient. Therapists will be asked for a 2-factor code.')}
            </p>

            <img
              src="/home.jpg"
              alt="Tele-Rehabilitation"
              className="img-fluid mb-4 w-100 d-none d-sm-block"
              style={{ maxHeight: '250px', objectFit: 'contain' }}
            />
          </Col>
        </Row>

        {/* Keep only the Login button on the page; Register moved to header */}
        <Row className="justify-content-center mb-5 text-center">
          <Col xs={10} sm={8} md={4} className="mb-3 mb-md-0">
            <Button className="w-100 py-3 fs-5" onClick={toggleLoginModal}>
              {t('Login')}
            </Button>
          </Col>
        </Row>

        <LoginForm show={showLoginModal} handleClose={toggleLoginModal} defaultRole="Therapist" />
        <FormRegister show={showRegisterModal} handleRegShow={toggleRegisterModal} />
      </Container>

      <Footer />
    </div>
  );
};

export default Home;
