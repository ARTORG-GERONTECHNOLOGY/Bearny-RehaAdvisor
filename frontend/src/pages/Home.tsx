// src/pages/Home.tsx
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Footer from '@/components/common/Footer';
import LoginForm from '@/components/HomePage/LoginForm';
import FormRegister from '@/components/HomePage/RegisteringForm';
import authStore from '@/stores/authStore';
import HomeIllustration from '@/assets/home_illustration.svg?react';
import Container from '@/components/Container';

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
    <div className="flex flex-col min-h-screen bg-back">
      <HomeIllustration className="ml-auto md:absolute right-0 top-28 md:top-1/4" />

      {/* HERO */}
      <main className="flex-1 flex items-center py-8">
        <Container>
          {/* Text column */}
          <div className="w-full md:w-1/2 text-center flex flex-col items-center md:text-start md:items-start">
            <h1 className="font-bold mb-0">{t('homeHeadline')}</h1>
            <h2 className="text-lg text-muted mb-3">{t('homeSubheadline')}</h2>

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
          </div>
        </Container>
      </main>

      {/* Modals */}
      <LoginForm show={showLoginModal} handleClose={toggleLoginModal} />
      <FormRegister show={showRegisterModal} handleRegShow={toggleRegisterModal} />

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Home;
