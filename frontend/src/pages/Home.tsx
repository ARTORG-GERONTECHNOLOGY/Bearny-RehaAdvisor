// src/pages/Home.tsx
import React, { useEffect, useState } from 'react';
import { Col, Container, Row } from 'react-bootstrap';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import '@/assets/styles/home.css';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import LoginForm from '@/components/HomePage/LoginForm';
import FormRegister from '@/components/HomePage/RegisteringForm';
import authStore from '@/stores/authStore';
import HomeIllustration from '@/assets/home_illustration.svg?react';

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
    <div className="d-flex flex-column min-vh-100 home-root bg-back">
      <Header isLoggedIn={authStore.isAuthenticated} />
      <HomeIllustration className="ml-auto md:absolute right-0 top-28 md:top-1/4" />

      {/* HERO */}
      <main className="flex-grow-1 d-flex align-items-center home-main py-4 py-sm-5 z-1">
        <Container fluid="md" className="px-3 px-sm-4 px-md-5">
          {/* keep hero from touching header/footer on small screens */}
          <Row className="g-4 g-lg-5 align-items-center py-2 py-md-3">
            {/* Text column */}
            <Col
              xs={12}
              md={6}
              className="text-center text-md-start order-2 order-md-1 d-flex flex-column align-items-center align-items-md-start"
            >
              <h1 className="fw-bold mb-0">{t('homeHeadline')}</h1>
              <h2 className="h4 text-muted mb-3">{t('homeSubheadline')}</h2>

              <p className="text-muted mb-3">{t('Sign in as a Therapist or Patient.')}</p>
              <div className="flex flex-col items-center md:items-start w-full md:w-auto gap-2">
                <Button onClick={toggleLoginModal} className="w-full sm:w-auto">
                  {t('Login')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={toggleRegisterModal}
                  className="text-brand text-sm p-0 h-auto"
                >
                  {t('Register (Only for Therapists)')}
                </Button>
              </div>
            </Col>
          </Row>
        </Container>
      </main>

      {/* Modals */}
      <LoginForm show={showLoginModal} handleClose={toggleLoginModal} />
      <FormRegister show={showRegisterModal} handleRegShow={toggleRegisterModal} />
      <Footer />
    </div>
  );
};

export default Home;
