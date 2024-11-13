import React, { useState } from 'react';
import { Button, Col, Container, Row } from 'react-bootstrap';
import Header from '../components/common/Header'; // import the Header
import Footer from '../components/common/Footer'; // import the Footer
import LoginForm from '../components/forms/LoginForm'; // Import the LoginForm component
import FormRegister from '../components/forms/RegisteringForm';
import { useTranslation } from 'react-i18next';
// @ts-ignore
import flagEN from '../assets/flags/gb.png';
// @ts-ignore
import Artog from '../assets/images/artorg.jpg';
import authStore from '../stores/authStore';


const Home: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Simulate login state
  const [showLoginModal, setShowLoginModal] = useState(false); // State to control the modal visibility
  const [showRegisterModal, setShowRegisterModal] = useState(false); // State to control the modal visibility

  const handleShow = () => setShowLoginModal(true);
  const handleClose = () => setShowLoginModal(false);
  const handleRegShow = () => setShowRegisterModal(true);
  const handleRegClose = () => setShowRegisterModal(false);

  const { t } = useTranslation();

  return (
    <>


      <Container fluid className="d-flex flex-column vh-100">
        {/* Header Component */}
        <Header isLoggedIn={authStore.isAuthenticated} />

        <Row className="flex-grow-1 d-flex justify-content-center align-items-center"> {/* Center content vertically and horizontally */}
          <Col xs="auto" className="text-center">
            {/* Web App Name */}
            <h1 className="mb-4">Tele-rehabilitation</h1>
            {/* Informational Text */}
            <p className="lead">{t('Welcome to the Therapist Login Page')}</p>
            <img src="/home.jpg" alt="Post-telereha Advisor Logo" style={{ maxWidth: '20%', height: 'auto' }} />

          </Col>
          <Row className="d-flex justify-content-center mb-5">
            <Col xs="auto" className="text-center">
              <Button
                style={{ width: "200px", height: "75px" }}
                onClick={handleShow}  // Show login modal on button click
              >
                {t('Login')}
              </Button>
            </Col>
            <Col xs="auto" className="text-center">
              <Button
                style={{ width: "200px", height: "75px" }}
                onClick={handleRegShow}  // Show register modal on button click
              >
                {t('Register')}
              </Button>
            </Col>
          </Row>
        </Row>

        {/* Login Form Modal */}
        <LoginForm show={showLoginModal} handleClose={handleClose} pageType="regular" />
        <FormRegister show={showRegisterModal} handleRegShow={handleRegClose} pageType="regular" />

        {/* Footer Component */}
        <Footer />
      </Container>



    </>
  );
};

export default Home;
