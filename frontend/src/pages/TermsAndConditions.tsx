import React, { useEffect, useState } from 'react';
import { Button, Col, Container, Row } from 'react-bootstrap';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import LoginForm from '../components/HomePage/LoginForm';
import { useTranslation } from 'react-i18next';
import authStore from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
const TermsAndConditions: React.FC = () => {
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
                <h1 className="text-3xl font-semibold mb-4">Terms and Conditions</h1>

            <p className="mb-4">
            This web application is provided for research purposes only. By accessing or using this platform, you agree to the following terms.
            </p>

            <h2 className="text-xl font-semibold mb-2 mt-6">1. Research Use</h2>
            <p className="mb-4">
            The application is designed to support clinical and rehabilitation research. It is not intended for commercial use or general medical diagnosis.
            </p>

            <h2 className="text-xl font-semibold mb-2 mt-6">2. Data Privacy</h2>
            <p className="mb-4">
            All user data collected through this platform is handled in accordance with ethical research guidelines and applicable data protection regulations.
            </p>

            <h2 className="text-xl font-semibold mb-2 mt-6">3. No Guarantees</h2>
            <p className="mb-4">
            The application is provided "as is" without warranties of any kind. We make no guarantees regarding accuracy, reliability, or availability.
            </p>

            <h2 className="text-xl font-semibold mb-2 mt-6">4. Consent</h2>
            <p className="mb-4">
            By using this platform, you consent to your data being used for scientific and academic purposes, in anonymized form.
            </p>

            <h2 className="text-xl font-semibold mb-2 mt-6">5. Changes</h2>
            <p className="mb-4">
            These terms may be updated periodically. Continued use of the application implies acceptance of the revised terms.
            </p>

            <p className="mt-10 italic text-sm">
            If you have any questions or concerns, please contact the research team.
            </p>
      </Container>
      <Footer />
    </div>
  );
};

export default TermsAndConditions;
