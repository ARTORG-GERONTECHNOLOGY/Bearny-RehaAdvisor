// src/pages/Home.tsx
import React, { useEffect, useState } from 'react';
import { Button, Col, Container, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import '../assets/styles/home.css';
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

  const toggleLoginModal = () => setShowLoginModal((p) => !p);
  const toggleRegisterModal = () => setShowRegisterModal((p) => !p);

  return (
    <div className="d-flex flex-column min-vh-100 home-root">
      {/* Register action in header when logged out */}
      <Header
        isLoggedIn={authStore.isAuthenticated}
        showRegisterAction={!authStore.isAuthenticated}
        onRegister={toggleRegisterModal}
      />

      {/* HERO */}
      <main className="flex-grow-1 d-flex align-items-center home-main py-4 py-sm-5">
        <Container fluid="md" className="px-3 px-sm-4 px-md-5">
          {/* keep hero from touching header/footer on small screens */}
          <Row className="g-4 g-lg-5 align-items-center py-2 py-md-3">
            {/* Text column */}
            <Col
              xs={12}
              md={6}
              className="text-center text-md-start order-2 order-md-1 d-flex flex-column align-items-center align-items-md-start"
            >
              <h1 className="home-title fw-bold mb-3">
                {t('YourCompanyName')} {t('Tele-Rehabilitation Platform')}
              </h1>

              <p className="home-lead text-muted mb-4 px-1 px-sm-0">
                {t(
                  'Sign in as a Therapist or Patient. Therapists will be asked for a 2-factor code.'
                )}
              </p>

              {/* full-width on mobile, natural width on >=sm */}
              <div className="d-grid d-sm-flex gap-3 justify-content-center justify-content-md-start w-100">
                <Button
                  variant="primary"
                  className="home-cta px-4"
                  size="lg"
                  onClick={toggleLoginModal}
                >
                  {t('Login')}
                </Button>
              </div>
            </Col>

            {/* Image column */}
            <Col xs={12} md={6} className="order-1 order-md-2">
              {/* add consistent padding + prevent overflow on small screens */}
              <div className="home-art rounded-4 overflow-hidden shadow-sm mx-auto">
                <picture>
                  <img
                    src="/home.jpg"
                    alt={t('YourCompanyName')}
                    className="w-100 h-100 d-block"
                    loading="eager"
                    decoding="async"
                    style={{ objectFit: 'cover', aspectRatio: '16 / 10' }}
                  />
                </picture>
              </div>
            </Col>
          </Row>
        </Container>
      </main>

      {/* Modals */}
      <LoginForm show={showLoginModal} handleClose={toggleLoginModal} defaultRole="Therapist" />
      <FormRegister show={showRegisterModal} handleRegShow={toggleRegisterModal} />
      <Footer />
    </div>
  );
};

export default Home;
